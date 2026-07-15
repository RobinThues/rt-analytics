import type { AnalyticsEvent, Batch, ConsentState } from "../core/types.js";

const MAX_EVENTS = 25;
const MAX_STRING = 1024;
const MAX_PROPS_BYTES = 4096;
const NAME_RE = /^\$?[a-z0-9_]{1,64}$/i;
const APP_ID_RE = /^[a-z0-9_-]{1,32}$/i;

function str(v: unknown, max = MAX_STRING): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function validateEvent(raw: unknown): AnalyticsEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const e = raw as Record<string, unknown>;
  const name = typeof e.name === "string" && NAME_RE.test(e.name) ? e.name : null;
  const eventId = str(e.eventId, 64);
  const ts = typeof e.ts === "string" && !Number.isNaN(Date.parse(e.ts)) ? e.ts : null;
  const sessionId = str(e.sessionId, 64);
  if (!name || !eventId || !ts || !sessionId) return null;

  let props: Record<string, unknown> = {};
  if (typeof e.props === "object" && e.props !== null && !Array.isArray(e.props)) {
    const json = JSON.stringify(e.props);
    if (new TextEncoder().encode(json).length <= MAX_PROPS_BYTES) props = e.props as Record<string, unknown>;
  }

  return {
    eventId,
    name,
    ts,
    sessionId,
    visitorId: str(e.visitorId, 64),
    userId: str(e.userId, 128),
    pagePath: str(e.pagePath) ?? "",
    referrer: str(e.referrer),
    utmSource: str(e.utmSource, 128),
    utmMedium: str(e.utmMedium, 128),
    utmCampaign: str(e.utmCampaign, 128),
    viewportW: num(e.viewportW),
    viewportH: num(e.viewportH),
    props,
  };
}

export function validateBatch(input: unknown): Batch | null {
  if (typeof input !== "object" || input === null) return null;
  const b = input as Record<string, unknown>;
  const appId = typeof b.appId === "string" && APP_ID_RE.test(b.appId) ? b.appId : null;
  const consentState =
    b.consentState === "accepted" || b.consentState === "declined" || b.consentState === "pending"
      ? (b.consentState as ConsentState)
      : null;
  const sdkVersion = str(b.sdkVersion, 32);
  if (!appId || !consentState || !sdkVersion || !Array.isArray(b.events)) return null;
  if (b.events.length === 0 || b.events.length > MAX_EVENTS) return null;

  const events: AnalyticsEvent[] = [];
  for (const raw of b.events) {
    const e = validateEvent(raw);
    if (!e) return null;
    events.push(e);
  }
  return { appId, sdkVersion, consentState, events };
}
