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

  it("sums the failure count, because writes are limited, with a limit per row", () => {
    expect(METRICS_SQL).toContain("SUM(IF(LAX_INT64(props.count) BETWEEN 1 AND 100000, LAX_INT64(props.count), 1))");
  });

  it("counts sessions with an error too, so the share can't pass 100 % or miss a broken page", () => {
    expect(METRICS_SQL).toContain("COUNT(DISTINCT IF(event_name IN ('$pageview', '$error'), session_id, NULL))");
  });

  it("only reads failure rows without a session, so a browser can't forge them", () => {
    expect(METRICS_SQL).toContain("event_name = '$route_failure' AND session_id IS NULL");
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

  it("lets only plain paths through, because route names go into public logs", () => {
    const m = toMetrics([
      row({ kind: "failure", route: "/api/cal", n: 1 }),
      row({ kind: "failure", route: "::error::forged", n: 2 }),
      row({ kind: "failure", route: "/api/x\n::warning::forged", n: 3 }),
      row({ kind: "failure", route: "__proto__", n: 4 }),
    ]);
    expect(Object.keys(m.failures).sort()).toEqual(["(invalid route)", "/api/cal"]);
    expect(m.failures["(invalid route)"]).toBe(9);
    expect(Object.getPrototypeOf(m.failures)).toBeNull();
  });
});
