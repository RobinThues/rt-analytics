import { describe, expect, it } from "vitest";
import { METRICS_SQL, toMetrics, type MetricRow } from "./metrics";

const row = (over: Partial<MetricRow>): MetricRow => ({
  kind: "current",
  days_ago: 0,
  route: null,
  n: null,
  sessions: null,
  error_sessions: null,
  ...over,
});

describe("METRICS_SQL", () => {
  it("filters the app and the partition in both reads, with parameters", () => {
    expect(METRICS_SQL.match(/app_id = @app_id/g)).toHaveLength(2);
    expect(METRICS_SQL.match(/timestamp >= TIMESTAMP_SUB\(TIMESTAMP\(@now\)/g)).toHaveLength(2);
  });

  it("sums the failure count, because writes are limited", () => {
    expect(METRICS_SQL).toContain("SUM(IFNULL(LAX_INT64(props.count), 1))");
  });
});

describe("toMetrics", () => {
  it("reads every kind of row", () => {
    const m = toMetrics([
      row({ n: 40, sessions: 30, error_sessions: 6 }),
      row({ kind: "failure", route: "/api/cal", n: 25 }),
      row({ kind: "last_event", n: 2 }),
      row({ kind: "baseline", days_ago: 1, n: 10 }),
      row({ kind: "baseline", days_ago: 7, n: 70 }),
    ]);
    expect(m).toMatchObject({
      pageviews: 40,
      sessions: 30,
      errorSessions: 6,
      minutesSinceLastEvent: 2,
      baselinePageviews: [10, 0, 0, 0, 0, 0, 70],
    });
    expect(m.failures["/api/cal"]).toBe(25);
  });

  it("is empty and silent without rows", () => {
    const m = toMetrics([row({ kind: "last_event", n: null })]);
    expect(m.minutesSinceLastEvent).toBeNull();
    expect(m.pageviews).toBe(0);
    expect(m.baselinePageviews).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("a route called __proto__ can't touch the object", () => {
    const m = toMetrics([row({ kind: "failure", route: "__proto__", n: 3 })]);
    expect(Object.getPrototypeOf(m.failures)).toBeNull();
    expect(m.failures["__proto__"]).toBe(3);
  });
});
