import { DAILY_VISITOR_PREFIX } from "rt-analytics/schema";
import { describe, expect, it } from "vitest";
import { toNdjsonLine } from "./ndjson.js";
import { dwdProfile } from "./dwd-profile.js";
import { createRng } from "./rng.js";
import { dailyVisitorId, generateDemoEvents, simulateVisit, type Visitor } from "./simulate.js";
import { testProfile } from "./test-profile.js";

const from = new Date("2026-07-01T00:00:00Z");
const days = 14;
const end = from.getTime() + days * 86_400_000;
const rows = generateDemoEvents(testProfile(), { from, days, seed: 7 });
const visitor = (over: Partial<Visitor> = {}): Visitor => ({
  key: "v1",
  kind: "pending",
  persistentId: null,
  device: { browser: "Chrome", os: "Windows", deviceType: "desktop", viewport: [1920, 1080] },
  country: "DE",
  ...over,
});

describe("generateDemoEvents", () => {
  it("is repeatable with the same seed", () => {
    const again = generateDemoEvents(testProfile(), { from, days, seed: 7 });
    expect(again.map(toNdjsonLine)).toEqual(rows.map(toNdjsonLine));
  });

  it("keeps every row inside [from, end) and sorted", () => {
    expect(rows.length).toBeGreaterThan(100);
    for (const r of rows) {
      expect(r.timestamp.getTime()).toBeGreaterThanOrEqual(from.getTime());
      expect(r.timestamp.getTime()).toBeLessThan(end);
    }
    const times = rows.map((r) => r.timestamp.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("uses the demo app id and valid event names", () => {
    for (const r of rows) {
      expect(r.app_id).toBe("demo");
      expect(r.event_name).toMatch(/^\$?[a-z][a-z0-9_]*$/);
    }
  });

  it("gives server events no visitor, session or page data", () => {
    const polls = rows.filter((r) => r.event_name === "calendar_poll");
    expect(polls.length).toBeGreaterThan(0);
    for (const r of polls) {
      expect([r.visitor_id, r.session_id, r.page_path, r.country]).toEqual([null, null, null, null]);
      expect(r.consent_state).toBe("server");
    }
  });

  it("keeps token subscriptions stable and changes legacy ones every day", () => {
    const subs = rows
      .filter((r) => r.event_name === "calendar_poll")
      .map((r) => JSON.parse(r.props!) as { subscription: string; kind: string });
    const token = new Set(subs.filter((s) => s.kind === "token").map((s) => s.subscription));
    const legacy = new Set(subs.filter((s) => s.kind === "legacy").map((s) => s.subscription));
    expect(token.size).toBeLessThanOrEqual(2);
    expect(legacy.size).toBeGreaterThan(days);
  });

  it("mixes cookieless and persistent visitors", () => {
    const sessions = new Map<string, string>();
    for (const r of rows) if (r.session_id && r.visitor_id) sessions.set(r.session_id, r.visitor_id);
    const ids = [...sessions.values()];
    const daily = ids.filter((id) => id.startsWith(DAILY_VISITOR_PREFIX)).length / ids.length;
    expect(daily).toBeGreaterThan(0.6);
    expect(daily).toBeLessThan(0.95);
  });

  it("produces some sessions without a pageview", () => {
    const withPageview = new Set(rows.filter((r) => r.event_name === "$pageview").map((r) => r.session_id));
    const all = new Set(rows.filter((r) => r.session_id).map((r) => r.session_id));
    expect(all.size).toBeGreaterThan(withPageview.size);
  });
});

describe("simulateVisit", () => {
  it("starts a new session on every full page load for cookieless visitors", () => {
    const p = testProfile({
      fullLoadChance: 1,
      pageviews: { mean: 4, max: 4 },
      vitalsOnlySessionChance: 0,
      clientEvents: [],
    });
    const out = simulateVisit(p, createRng(1), visitor(), new Date("2026-07-01T10:00:00Z"));
    const pageviews = out.filter((r) => r.event_name === "$pageview");
    expect(pageviews.length).toBeGreaterThan(1);
    expect(new Set(pageviews.map((r) => r.session_id)).size).toBe(pageviews.length);
    expect(out.filter((r) => r.event_name === "$session_start").length).toBe(pageviews.length);
    expect(pageviews.slice(1).every((r) => r.referrer?.startsWith("http://localhost:3000/"))).toBe(true);
  });

  it("keeps one session over client-side navigations", () => {
    const p = testProfile({
      fullLoadChance: 0,
      pageviews: { mean: 4, max: 4 },
      vitalsOnlySessionChance: 0,
      clientEvents: [],
    });
    const out = simulateVisit(p, createRng(1), visitor(), new Date("2026-07-01T10:00:00Z"));
    expect(new Set(out.map((r) => r.session_id)).size).toBe(1);
  });

  it("splits session and visitor when consent is accepted", () => {
    const v = visitor({ kind: "accepted" });
    const p = testProfile({ fullLoadChance: 0, vitalsOnlySessionChance: 0, clientEvents: [] });
    const out = simulateVisit(p, createRng(2), v, new Date("2026-07-01T10:00:00Z"));
    const consent = out.find((r) => r.event_name === "$consent")!;
    expect(JSON.parse(consent.props!)).toEqual({ state: "accepted" });
    // Like the SDK, the new session's $session_start is emitted right before $consent, so "before" means
    // the events of the earlier (cookieless) session.
    const before = out.filter((r) => r.timestamp < consent.timestamp && r.session_id !== consent.session_id);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((r) => r.visitor_id!.startsWith("d_") && r.consent_state === "pending")).toBe(true);
    expect(consent.visitor_id!.startsWith("d_")).toBe(false);
    expect(consent.session_id).not.toBe(before[0]!.session_id);
    expect(v.persistentId).toBe(consent.visitor_id);
  });

  it("changes the daily id at 00:00 UTC", () => {
    expect(dailyVisitorId("v1", new Date("2026-07-01T23:59:59Z"))).not.toBe(
      dailyVisitorId("v1", new Date("2026-07-02T00:00:01Z")),
    );
    expect(dailyVisitorId("v1", new Date("2026-07-01T01:00:00Z"))).toBe(
      dailyVisitorId("v1", new Date("2026-07-01T22:00:00Z")),
    );
  });
});

describe("toNdjsonLine", () => {
  it("writes ISO timestamps and props as JSON objects", () => {
    const row = rows.find((r) => r.props !== null)!;
    const parsed = JSON.parse(toNdjsonLine(row)) as { timestamp: string; props: unknown };
    expect(parsed.timestamp).toBe(row.timestamp.toISOString());
    expect(typeof parsed.props).toBe("object");
  });
});

describe("dwdProfile", () => {
  it("generates a realistic volume for 90 days", () => {
    const all = generateDemoEvents(dwdProfile, { from, days: 90, seed: 42 });
    expect(all.length).toBeGreaterThan(30_000);
    expect(all.length).toBeLessThan(300_000);
    expect(new Set(all.map((r) => r.event_name))).toEqual(
      new Set([
        "$session_start",
        "$pageview",
        "$web_vital",
        "$consent",
        "$error",
        "place_selected",
        "subscribe_click",
        "calendar_poll",
      ]),
    );
  });
});
