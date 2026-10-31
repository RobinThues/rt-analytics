import { describe, expect, it } from "vitest";
import { evaluate, median, transition, type Firing, type Metrics, type Thresholds } from "./rules";

const t: Thresholds = {
  errorShare: { share: 0.2, minErrorSessions: 20 },
  routeFailures: { minFailures: 20 },
  silentAll: { minutes: 30 },
  silentPageviews: { minBaseline: 8 },
  trafficSpike: { factor: 5, minPageviews: 50 },
  trafficDrop: { share: 0.2, minBaseline: 30 },
};

const quiet: Metrics = {
  pageviews: 20,
  sessions: 15,
  errorSessions: 0,
  failures: {},
  minutesSinceLastEvent: 1,
  baselinePageviews: [20, 20, 20, 20, 20, 20, 20],
};

const keys = (m: Partial<Metrics>) => evaluate({ ...quiet, ...m }, t).map((f) => f.key);

describe("median", () => {
  it("handles odd, even and empty lists, and ignores one past spike", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
    expect(median([5, 5, 5, 3000, 5, 5, 5])).toBe(5);
  });
});

describe("evaluate", () => {
  it("is quiet on a normal hour", () => {
    expect(keys({})).toEqual([]);
  });

  it("error share needs both the share and the minimum", () => {
    expect(keys({ sessions: 100, errorSessions: 30 })).toEqual(["error_share"]);
    expect(keys({ sessions: 100, errorSessions: 19 })).toEqual([]);
    expect(keys({ sessions: 1000, errorSessions: 30 })).toEqual([]);
    expect(keys({ sessions: 0, errorSessions: 0 })).toEqual([]);
  });

  it("treats each failing route as its own problem", () => {
    expect(keys({ failures: { "/api/geocode": 25, "/api/cal": 40, "/api/location": 3 } })).toEqual([
      "route_failures:/api/geocode",
      "route_failures:/api/cal",
    ]);
  });

  it("is silent after the time limit, and when nothing is in the window", () => {
    expect(keys({ minutesSinceLastEvent: 29 })).toEqual([]);
    expect(keys({ minutesSinceLastEvent: 30, pageviews: 20 })).toEqual(["silent_all"]);
    expect(keys({ minutesSinceLastEvent: null, pageviews: 20 })).toEqual(["silent_all"]);
  });

  it("names lost pageviews only when server events still arrive and the hour is normally busy", () => {
    expect(keys({ pageviews: 0 })).toEqual(["silent_pageviews"]);
    expect(keys({ pageviews: 0, baselinePageviews: [1, 2, 0, 1, 1, 0, 2] })).toEqual([]);
    expect(keys({ pageviews: 0, minutesSinceLastEvent: 45 })).toEqual(["silent_all"]);
  });

  it("spike needs the factor and the minimum", () => {
    expect(keys({ pageviews: 100 })).toEqual(["traffic_spike"]);
    expect(keys({ pageviews: 40, baselinePageviews: [1, 1, 1, 1, 1, 1, 1] })).toEqual([]);
    expect(keys({ pageviews: 60, baselinePageviews: [20, 20, 20, 20, 20, 20, 20] })).toEqual([]);
    expect(keys({ pageviews: 60, baselinePageviews: [] })).toEqual(["traffic_spike"]);
  });

  it("drop needs a busy baseline, and doesn't repeat a full silence", () => {
    const busy = { baselinePageviews: [100, 100, 100, 100, 100, 100, 100] };
    expect(keys({ ...busy, pageviews: 19 })).toEqual(["traffic_drop"]);
    expect(keys({ ...busy, pageviews: 20 })).toEqual([]);
    expect(keys({ ...busy, pageviews: 0 })).toEqual(["silent_pageviews"]);
    expect(keys({ pageviews: 1 })).toEqual([]);
  });

  it("keeps numbers in the detail, for the private email", () => {
    const [f] = evaluate({ ...quiet, sessions: 100, errorSessions: 30 }, t);
    expect(f!.detail).toContain("30 of 100");
    expect(f!.key).not.toMatch(/\d/);
  });
});

describe("transition", () => {
  const firing = (key: string): Firing => ({ key, rule: "error_share", detail: "x" });
  const NOW = "2026-11-09T10:00:00.000Z";

  it("starts a problem once, and stays quiet while it goes on", () => {
    const first = transition([firing("a")], [], NOW, 4);
    expect(first.started.map((f) => f.key)).toEqual(["a"]);
    expect(first.open).toEqual([{ key: "a", since: NOW, cleanRuns: 0 }]);
    const second = transition([firing("a")], first.open, "later", 4);
    expect(second.started).toEqual([]);
    expect(second.ended).toEqual([]);
    expect(second.open).toEqual([{ key: "a", since: NOW, cleanRuns: 0 }]);
  });

  it("ends a problem only after enough clean runs in a row", () => {
    let open = [{ key: "a", since: NOW, cleanRuns: 0 }];
    for (let run = 1; run <= 3; run++) {
      const r = transition([], open, "later", 4);
      expect(r.ended).toEqual([]);
      expect(r.open[0]!.cleanRuns).toBe(run);
      open = r.open;
    }
    const last = transition([], open, "later", 4);
    expect(last.ended.map((p) => p.key)).toEqual(["a"]);
    expect(last.open).toEqual([]);
  });

  it("a firing run in between resets the count and sends nothing new", () => {
    const r = transition([firing("a")], [{ key: "a", since: NOW, cleanRuns: 3 }], "later", 4);
    expect(r.started).toEqual([]);
    expect(r.open[0]!.cleanRuns).toBe(0);
  });

  it("keeps problems apart", () => {
    const r = transition([firing("b")], [{ key: "a", since: NOW, cleanRuns: 3 }], "later", 4);
    expect(r.started.map((f) => f.key)).toEqual(["b"]);
    expect(r.ended.map((p) => p.key)).toEqual(["a"]);
    expect(r.open.map((p) => p.key)).toEqual(["b"]);
  });
});
