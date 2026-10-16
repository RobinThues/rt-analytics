// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildContext } from "./context";
import { funnelQuery } from "./funnel";

const ctx = buildContext({
  table: "`p.analytics.events`",
  appId: "demo",
  settings: { timezone: "Europe/Berlin", hosts: [] },
  range: { from: "2026-10-01", to: "2026-10-16" },
  compare: true,
  today: "2026-10-16",
});

describe("funnelQuery", () => {
  it("one CTE per step, strictly later timestamps, params per step", () => {
    const q = funnelQuery(ctx, [
      { event: "$pageview", filter: { key: "path", value: "/" } },
      { event: "place_selected", filter: { key: "source", value: "map" } },
      { event: "subscribe_click", filter: null },
    ]);
    expect(q.params).toMatchObject({
      e1: "$pageview",
      v1: "/",
      e2: "place_selected",
      k2: "source",
      v2: "map",
      e3: "subscribe_click",
    });
    expect(q.params.k1).toBeUndefined();
    expect(q.sql).toContain("ev.page_path = @v1");
    expect(q.sql).toContain("LAX_STRING(ev.props[@k2]) = @v2");
    expect(q.sql.match(/ev\.timestamp > s\d\.t/g)).toHaveLength(2);
    expect(q.sql).not.toContain("place_selected");
    expect(q.sql).toContain("app_id = @app_id");
  });
  it("sessions belong to the period of their first event and need a pageview", () => {
    const sql = funnelQuery(ctx, [
      { event: "a", filter: null },
      { event: "b", filter: null },
    ]).sql;
    expect(sql).toContain("HAVING COUNTIF(event_name = '$pageview') > 0");
    expect(sql).toMatch(/CASE\s+WHEN s\.start_ts >= TIMESTAMP\(@from_ts\)/);
  });
});
