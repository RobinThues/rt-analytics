// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildContext } from "./context";
import {
  breakdownQuery,
  consentQuery,
  DIMS,
  kpisQuery,
  retentionQuery,
  slowPagesQuery,
  topErrorsQuery,
  trafficQuery,
  webVitalsQuery,
} from "./overview";

const ctx = buildContext({
  table: "`p.analytics.events`",
  appId: "x' OR 1=1 --",
  settings: { timezone: "Europe/Berlin", hosts: ["example.com"] },
  range: { from: "2026-10-01", to: "2026-10-16" },
  compare: true,
  today: "2026-10-16",
});
const all = [
  kpisQuery(ctx),
  trafficQuery(ctx),
  ...DIMS.map((d) => breakdownQuery(ctx, d)),
  webVitalsQuery(ctx),
  slowPagesQuery(ctx),
  topErrorsQuery(ctx),
  consentQuery(ctx),
  retentionQuery(ctx),
];

describe("overview queries", () => {
  it("every overview query filters app and a timestamp range, never inlines the app id", () => {
    for (const q of all) {
      expect(q.sql).toContain("app_id = @app_id");
      expect(q.sql).toMatch(/timestamp >= TIMESTAMP\(@\w+\)/);
      expect(q.sql).not.toContain("1=1");
      expect(q.params.app_id).toBe("x' OR 1=1 --");
    }
  });
  it("only overview breakdowns by source use the own hosts, as a typed array param", () => {
    const q = breakdownQuery(ctx, "source");
    expect(q.params.own_hosts).toEqual(["example.com"]);
    expect(q.types).toEqual({ own_hosts: ["STRING"] });
    expect(q.sql).toContain("IN UNNEST(@own_hosts)");
    expect(breakdownQuery(ctx, "page").params.own_hosts).toBeUndefined();
  });
  it("breakdowns rank the top 20 by current pageviews and put the rest in NULL (Other)", () => {
    const sql = breakdownQuery(ctx, "country").sql;
    expect(sql).toContain("LIMIT 20");
    expect(sql).toContain("WHERE period = 'cur'");
  });
  it("web vitals: only LCP, INP, CLS, p75 from APPROX_QUANTILES", () => {
    const sql = webVitalsQuery(ctx).sql;
    expect(sql).toContain("APPROX_QUANTILES");
    expect(sql).toContain("[OFFSET(75)]");
    expect(sql).toContain("('LCP', 'INP', 'CLS')");
  });
  it("retention: 28-day lookback, Monday weeks, persistent ids only, no previous period", () => {
    const q = retentionQuery(ctx);
    expect(q.params.lookback_ts).toBe("2026-09-02T22:00:00.000Z");
    expect(q.sql).toContain("WEEK(MONDAY)");
    expect(q.sql).toContain("NOT STARTS_WITH(visitor_id, 'd_')");
    expect(q.params.prev_from_ts).toBeUndefined();
  });
});
