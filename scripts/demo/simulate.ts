// Simulates visits the way the rt-analytics SDK records them (see spec section 6, "Sessions"):
// cookieless sessions live in memory and restart on full page loads, accepting consent starts a new session
// with a new persistent visitor id, late web vitals can create sessions without a pageview, and daily ids
// change at 00:00 UTC.
import { createHash } from "node:crypto";
import { SDK_VERSION } from "rt-analytics";
import {
  DAILY_VISITOR_PREFIX,
  EVENTS,
  SERVER_CONSENT_STATE,
  type EventRow,
  type RowConsentState,
} from "rt-analytics/schema";
import type { DemoProfile, Device, ServerEventDef, Subscription, VisitState } from "./profile.js";
import { createRng, uuid, type Rng } from "./rng.js";

const DAY_MS = 86_400_000;

export interface Visitor {
  key: string;
  kind: "pending" | "accepted" | "declined";
  /** Set once the visitor accepted consent; reused on later visits. */
  persistentId: string | null;
  device: Device;
  country: string;
}

export interface GenerateOptions {
  from: Date;
  days: number;
  seed: number;
}

/** Same shape as the ingest's daily id (UTC day), but derived from a demo visitor key. */
export function dailyVisitorId(visitorKey: string, at: Date): string {
  const day = at.toISOString().slice(0, 10);
  return DAILY_VISITOR_PREFIX + createHash("sha256").update(`demo:${day}:${visitorKey}`).digest("hex").slice(0, 32);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function webVital(rng: Rng, metric: "LCP" | "CLS" | "INP", mobile: boolean): Record<string, unknown> {
  if (metric === "LCP") {
    const value = Math.round((900 + rng.next() * 2600) * (mobile ? 1.3 : 1));
    return { metric, value, rating: value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor" };
  }
  if (metric === "CLS") {
    const value = Math.round(rng.next() ** 3 * 0.4 * 1000) / 1000;
    return { metric, value, rating: value <= 0.1 ? "good" : value <= 0.25 ? "needs-improvement" : "poor" };
  }
  const value = Math.round(40 + rng.next() ** 2 * 500);
  return { metric, value, rating: value <= 200 ? "good" : value <= 500 ? "needs-improvement" : "poor" };
}

const ERRORS = [
  "TypeError: Cannot read properties of undefined (reading 'lat')",
  "Failed to fetch",
  "ChunkLoadError: Loading chunk 742 failed.",
];

export function simulateVisit(profile: DemoProfile, rng: Rng, visitor: Visitor, start: Date): EventRow[] {
  const rows: EventRow[] = [];
  const source = rng.weighted(profile.sources).value;
  const mobile = visitor.device.deviceType !== "desktop";
  let decided = visitor.kind === "pending" || visitor.persistentId !== null;
  let consent: RowConsentState = visitor.persistentId !== null ? "accepted" : "pending";
  let persistentId = visitor.persistentId;
  let sessionId = "";
  let t = start.getTime();
  let path = rng.weighted(profile.pages).value;
  let referrer = source.referrer;
  let utm = source.utm ?? null;
  const visit: VisitState = { place: null };
  const happened = new Set<string>();

  const push = (name: string, props: Record<string, unknown>) => {
    const at = new Date(t);
    rows.push({
      event_id: uuid(rng),
      app_id: profile.appId,
      event_name: name,
      timestamp: at,
      visitor_id: persistentId ?? dailyVisitorId(visitor.key, at),
      session_id: sessionId,
      user_id: null,
      page_path: path,
      referrer,
      utm_source: utm?.source ?? null,
      utm_medium: utm?.medium ?? null,
      utm_campaign: utm?.campaign ?? null,
      country: visitor.country,
      browser: visitor.device.browser,
      os: visitor.device.os,
      device_type: visitor.device.deviceType,
      viewport_w: visitor.device.viewport[0],
      viewport_h: visitor.device.viewport[1],
      props: Object.keys(props).length > 0 ? JSON.stringify(props) : null,
      consent_state: consent,
      sdk_version: SDK_VERSION,
    });
    t += 200 + rng.int(0, 2000);
  };
  const newSession = () => {
    sessionId = uuid(rng);
    push(EVENTS.sessionStart, {});
  };

  const pageviews = Math.min(
    profile.pageviews.max,
    1 + Math.floor(-Math.log(1 - rng.next()) * Math.max(0, profile.pageviews.mean - 1)),
  );
  newSession();
  for (let i = 0; i < pageviews; i++) {
    let fullLoad = i === 0;
    if (i > 0) {
      t += rng.int(20, 180) * 1000;
      const previous = path;
      path = rng.weighted(profile.pages).value;
      utm = null; // UTM parameters are only in the landing URL
      fullLoad = rng.chance(profile.fullLoadChance);
      if (fullLoad) {
        referrer = `${profile.origin}${previous}`;
        if (persistentId === null) newSession(); // in-memory sessions do not survive a full page load
      }
    }
    push(EVENTS.pageview, {});
    if (fullLoad) {
      push(EVENTS.webVital, webVital(rng, "LCP", mobile));
      push(EVENTS.webVital, webVital(rng, "CLS", mobile));
    }

    if (!decided) {
      decided = true;
      t += rng.int(3, 30) * 1000;
      if (visitor.kind === "accepted") {
        persistentId = uuid(rng);
        visitor.persistentId = persistentId;
        consent = "accepted";
        newSession(); // switching to sessionStorage starts a new session
        push(EVENTS.consent, { state: "accepted" });
      } else {
        consent = "declined";
        push(EVENTS.consent, { state: "declined" });
      }
    }

    for (const def of profile.clientEvents) {
      if (!def.paths.includes(path)) continue;
      if (def.after && !happened.has(def.after)) continue;
      if (!rng.chance(def.chance)) continue;
      t += rng.int(5, 60) * 1000;
      push(def.name, def.props(rng, visit));
      happened.add(def.name);
    }
    if (rng.chance(profile.errorChancePerPageview)) {
      push(EVENTS.error, {
        message: rng.pick(ERRORS),
        source: `${profile.origin}/_next/static/chunks/app.js`,
        line: rng.int(1, 4000),
      });
    }
    if (rng.chance(0.6)) push(EVENTS.webVital, webVital(rng, "INP", mobile));
  }

  if (persistentId === null && rng.chance(profile.vitalsOnlySessionChance)) {
    t += 31 * 60 * 1000 + rng.int(0, 600) * 1000; // tab hidden after the 30-minute session timeout
    newSession();
    push(EVENTS.webVital, webVital(rng, "INP", mobile));
  }
  return rows;
}

function serverRow(appId: string, name: string, at: Date, props: Record<string, unknown>, rng: Rng): EventRow {
  return {
    event_id: uuid(rng),
    app_id: appId,
    event_name: name,
    timestamp: at,
    visitor_id: null,
    session_id: null,
    user_id: null,
    page_path: null,
    referrer: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    country: null,
    browser: null,
    os: null,
    device_type: null,
    viewport_w: null,
    viewport_h: null,
    props: JSON.stringify(props),
    consent_state: SERVER_CONSENT_STATE,
    sdk_version: SDK_VERSION,
  };
}

function simulateServerEvents(profile: DemoProfile, def: ServerEventDef, rng: Rng, opts: GenerateOptions): EventRow[] {
  const rows: EventRow[] = [];
  const subs: Subscription[] = [];
  for (let d = 0; d < opts.days; d++) {
    const dayStart = opts.from.getTime() + d * DAY_MS;
    const progress = opts.days > 1 ? d / (opts.days - 1) : 1;
    const target = Math.round(lerp(def.pool.start, def.pool.end, progress));
    while (subs.length < target) subs.push(def.newSubscription(rng, subs.length));
    const day = new Date(dayStart).toISOString().slice(0, 10);
    for (const sub of subs) {
      const polls = rng.int(def.pollsPerDay.min, def.pollsPerDay.max);
      for (let p = 0; p < polls; p++) {
        const at = new Date(dayStart + rng.int(0, DAY_MS / 1000 - 1) * 1000);
        rows.push(serverRow(profile.appId, def.name, at, def.props(rng, sub, day), rng));
      }
    }
  }
  return rows;
}

export function generateDemoEvents(profile: DemoProfile, opts: GenerateOptions): EventRow[] {
  const rng = createRng(opts.seed);
  const rows: EventRow[] = [];
  const known = new Set<Visitor>();
  let counter = 0;
  const consentKinds = [
    { kind: "pending" as const, weight: profile.consent.pending },
    { kind: "accepted" as const, weight: profile.consent.accepted },
    { kind: "declined" as const, weight: profile.consent.declined },
  ];
  const hours = profile.hourWeights.map((weight, hour) => ({ hour, weight }));

  for (let d = 0; d < opts.days; d++) {
    const dayStart = opts.from.getTime() + d * DAY_MS;
    const progress = opts.days > 1 ? d / (opts.days - 1) : 1;
    const base = lerp(profile.visitsPerDay.start, profile.visitsPerDay.end, progress);
    const weekday = new Date(dayStart).getUTCDay();
    const visits = Math.round(base * (profile.weekdayFactor[weekday] ?? 1) * (0.85 + rng.next() * 0.3));
    const today: Visitor[] = [];
    for (const v of known) if (today.length < visits && rng.chance(profile.returnChancePerDay)) today.push(v);
    while (today.length < visits) {
      today.push({
        key: `v${counter++}`,
        kind: rng.weighted(consentKinds).kind,
        persistentId: null,
        device: rng.weighted(profile.devices).value,
        country: rng.weighted(profile.countries).value,
      });
    }
    for (const v of today) {
      const start = new Date(dayStart + rng.weighted(hours).hour * 3_600_000 + rng.int(0, 3599) * 1000);
      rows.push(...simulateVisit(profile, rng, v, start));
      if (v.persistentId !== null) known.add(v);
    }
  }
  for (const def of profile.serverEvents) rows.push(...simulateServerEvents(profile, def, rng, opts));

  const end = opts.from.getTime() + opts.days * DAY_MS;
  return rows.filter((r) => r.timestamp.getTime() < end).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
