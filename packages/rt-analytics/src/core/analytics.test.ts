import { beforeEach, describe, expect, it } from "vitest";
import { createAnalytics, type AnalyticsDeps } from "./analytics.js";
import type { Batch } from "./types.js";
import type { Transport } from "./queue.js";
import { fakeStorage, quotaFullStorage, throwingStorage } from "../test-utils.js";

describe("createAnalytics", () => {
  let batches: Batch[];
  let deps: Required<Pick<AnalyticsDeps, "localStorage" | "sessionStorage" | "transport" | "now">>;

  beforeEach(() => {
    batches = [];
    const transport: Transport = { send: (_u, body) => void batches.push(JSON.parse(body)) };
    deps = { localStorage: fakeStorage(), sessionStorage: fakeStorage(), transport, now: () => 1_750_000_000_000 };
  });

  const make = () => createAnalytics<{ game_won: { attempts: number } }>({ appId: "wordle" }, deps);

  it("emits $session_start before the first event", () => {
    const a = make();
    a.track("game_won", { attempts: 3 });
    a.flush();
    const names = batches[0]!.events.map((e) => e.name);
    expect(names).toEqual(["$session_start", "game_won"]);
    expect(batches[0]!.events[1]!.props).toEqual({ attempts: 3 });
    expect(batches[0]!.appId).toBe("wordle");
  });

  it("keeps visitorId null before consent, sets it after accept", () => {
    const a = make();
    a.page();
    a.flush();
    expect(batches[0]!.events.every((e) => e.visitorId === null)).toBe(true);
    a.acceptConsent();
    a.page();
    a.flush();
    const last = batches.at(-1)!;
    expect(last.consentState).toBe("accepted");
    expect(last.events.at(-1)!.visitorId).toBeTruthy();
  });

  it("emits $consent on accept and decline, and decline clears the visitor id", () => {
    const a = make();
    a.acceptConsent();
    a.page();
    a.declineConsent();
    a.page();
    a.flush();
    const all = batches.flatMap((b) => b.events);
    expect(all.filter((e) => e.name === "$consent")).toHaveLength(2);
    expect(all.at(-1)!.visitorId).toBeNull();
    expect(deps.localStorage!.getItem("rta_vid")).toBeNull();
  });

  it("identify stamps userId on subsequent events; reset clears it", () => {
    const a = make();
    a.identify("user-42");
    a.page();
    a.reset();
    a.page();
    a.flush();
    const all = batches.flatMap((b) => b.events);
    expect(all.find((e) => e.name === "$identify")!.userId).toBe("user-42");
    expect(all.at(-1)!.userId).toBeNull();
  });

  it("returns an inert no-op instance on the server (no deps)", () => {
    const a = createAnalytics({ appId: "x" });
    expect(() => {
      a.track("anything", {});
      a.flush();
    }).not.toThrow();
    expect(a.getConsent()).toBe("pending");
  });

  it("keeps sending when every storage access throws", () => {
    const a = createAnalytics(
      { appId: "wordle" },
      { ...deps, localStorage: throwingStorage(), sessionStorage: throwingStorage() },
    );
    expect(() => {
      a.acceptConsent();
      a.page();
      a.flush();
    }).not.toThrow();
    expect(batches.flatMap((b) => b.events).some((e) => e.name === "$pageview")).toBe(true);
  });

  it("keeps one session when storage writes fail (quota full)", () => {
    const a = createAnalytics(
      { appId: "wordle" },
      { ...deps, localStorage: quotaFullStorage(), sessionStorage: quotaFullStorage() },
    );
    a.acceptConsent();
    a.page();
    a.page();
    a.flush();
    const starts = batches.flatMap((b) => b.events).filter((e) => e.name === "$session_start");
    expect(starts).toHaveLength(1);
  });

  describe("cookieless", () => {
    it("never touches the storages, even when deps provide them", () => {
      const a = createAnalytics({ appId: "wordle", cookieless: true }, deps);
      a.page();
      a.acceptConsent();
      a.page();
      a.flush();
      expect(deps.localStorage!.length).toBe(0);
      expect(deps.sessionStorage!.length).toBe(0);
    });

    it("keeps consent pending, sends no $consent and no visitor id", () => {
      const a = createAnalytics({ appId: "wordle", cookieless: true }, deps);
      const seen: string[] = [];
      a.onConsentChange((s) => seen.push(s));
      a.acceptConsent();
      a.declineConsent();
      a.page();
      a.flush();
      const events = batches.flatMap((b) => b.events);
      expect(a.getConsent()).toBe("pending");
      expect(seen).toEqual([]);
      expect(events.some((e) => e.name === "$consent")).toBe(false);
      expect(events.every((e) => e.visitorId === null)).toBe(true);
      expect(batches.every((b) => b.consentState === "pending")).toBe(true);
    });

    it("keeps one in-memory session", () => {
      const a = createAnalytics({ appId: "wordle", cookieless: true }, deps);
      a.page();
      a.page();
      a.flush();
      const events = batches.flatMap((b) => b.events);
      expect(events.filter((e) => e.name === "$session_start")).toHaveLength(1);
      expect(new Set(events.map((e) => e.sessionId)).size).toBe(1);
    });
  });
});
