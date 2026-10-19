// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildContext } from "./context";
import {
  breakdownsQuery,
  DIMS,
  kpisQuery,
  retentionQuery,
  splitBreakdowns,
  trafficQuery,
  qualityQuery,
  splitQuality,
} from "./overview";

const ctx = buildContext({
  table: "`p.analytics.events`",
  appId: "x' OR 1=1 --",
  settings: { timezone: "Europe/Berlin", hosts: ["example.com"] },
  range: { from: "2026-10-01", to: "2026-10-16" },
  compare: true,
  today: "2026-10-16",
});
const all = [kpisQuery(ctx), trafficQuery(ctx), breakdownsQuery(ctx), qualityQuery(ctx), retentionQuery(ctx)];

describe("overview queries", () => {
  it("every overview query filters app and a timestamp range, never inlines the app id", () => {
    for (const q of all) {
      expect(q.sql).toContain("app_id = @app_id");
      expect(q.sql).toMatch(/timestamp >= TIMESTAMP\(@\w+\)/);
      expect(q.sql).not.toContain("1=1");
      expect(q.params.app_id).toBe("x' OR 1=1 --");
    }
  });
  it("breakdowns: one query reads the table once and passes the own hosts as a typed array param", () => {
    const q = breakdownsQuery(ctx);
    expect(q.name).toBe("breakdowns");
    expect(q.sql.split(ctx.table).length - 1).toBe(1);
    expect(q.params.own_hosts).toEqual(["example.com"]);
    expect(q.types).toEqual({ own_hosts: ["STRING"] });
    expect(q.sql).toContain("IN UNNEST(@own_hosts)");
    for (const d of DIMS) expect(q.sql).toContain(`'${d}' AS dim`);
  });
  it("breakdowns rank the top 20 per dimension by current pageviews and put the rest in NULL (Other)", () => {
    const sql = breakdownsQuery(ctx).sql;
    expect(sql).toContain("PARTITION BY dim");
    expect(sql).toContain("<= 20");
    expect(sql).toContain("WHERE period = 'cur'");
    expect(sql).toContain("USING (dim, value)");
  });
  it("splitBreakdowns gives every dimension its own rows without the dim column", () => {
    const empty = splitBreakdowns([]);
    expect(Object.keys(empty).sort()).toEqual([...DIMS].sort());
    for (const d of DIMS) expect(empty[d]).toEqual([]);
    const split = splitBreakdowns([
      { dim: "os", period: "cur", value: "Linux", pageviews: 3, visitor_days: 2 },
      { dim: "page", period: "prev", value: null, pageviews: 1, visitor_days: 1 },
    ]);
    expect(split.os).toEqual([{ period: "cur", value: "Linux", pageviews: 3, visitor_days: 2 }]);
    expect(split.page).toEqual([{ period: "prev", value: null, pageviews: 1, visitor_days: 1 }]);
    expect(split.country).toEqual([]);
  });
  it("quality: one query reads the table once and keeps each panel's own limits", () => {
    const q = qualityQuery(ctx);
    expect(q.name).toBe("quality");
    expect(q.sql.split(ctx.table).length - 1).toBe(1);
    expect(q.sql.match(/LIMIT 10/g)).toHaveLength(2);
    expect(q.sql).toContain("HAVING COUNT(*) >= 5");
    for (const p of ["vitals", "slow_pages", "errors", "consent"]) expect(q.sql).toContain(`'${p}' AS panel`);
  });
  it("web vitals: only LCP, INP, CLS, p75 from APPROX_QUANTILES", () => {
    const sql = qualityQuery(ctx).sql;
    expect(sql).toContain("APPROX_QUANTILES");
    expect(sql).toContain("[OFFSET(75)]");
    expect(sql).toContain("('LCP', 'INP', 'CLS')");
  });
  it("splitQuality gives each panel only its own fields", () => {
    expect(splitQuality([])).toEqual({ vitals: [], slowPages: [], errors: [], consent: [] });
    const nulls = { period: null, metric: null, p75: null, samples: null, page_path: null, message: null };
    const more = { occurrences: null, last_seen: null, consent_state: null, pageviews: null };
    const split = splitQuality([
      { ...nulls, ...more, panel: "slow_pages", page_path: "/a", p75: 2500, samples: 7 },
      { ...nulls, ...more, panel: "vitals", period: "cur", metric: "LCP", p75: 1800, samples: 40 },
      { ...nulls, ...more, panel: "errors", message: "boom", occurrences: 3, last_seen: "2026-10-13 10:00" },
      { ...nulls, ...more, panel: "consent", period: "prev", consent_state: "granted", pageviews: 9 },
    ]);
    expect(split.slowPages).toEqual([{ page_path: "/a", p75: 2500, samples: 7 }]);
    expect(split.vitals).toEqual([{ period: "cur", metric: "LCP", p75: 1800, samples: 40 }]);
    expect(split.errors).toEqual([{ message: "boom", occurrences: 3, last_seen: "2026-10-13 10:00" }]);
    expect(split.consent).toEqual([{ period: "prev", consent_state: "granted", pageviews: 9 }]);
  });
  it("retention: 28-day lookback, Monday weeks, persistent ids only, no previous period", () => {
    const q = retentionQuery(ctx);
    expect(q.params.lookback_ts).toBe("2026-09-02T22:00:00.000Z");
    expect(q.sql).toContain("WEEK(MONDAY)");
    expect(q.sql).toContain("NOT STARTS_WITH(visitor_id, 'd_')");
    expect(q.params.prev_from_ts).toBeUndefined();
  });
});
