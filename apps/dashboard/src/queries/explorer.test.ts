// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildContext } from "./context";
import {
  eventBreakdownQuery,
  eventListQuery,
  eventSeriesQuery,
  propValuesQuery,
  type ExplorerSelection,
} from "./explorer";

const ctx = buildContext({
  table: "`p.analytics.events`",
  appId: "demo",
  settings: { timezone: "Europe/Berlin", hosts: [] },
  range: { from: "2026-10-01", to: "2026-10-16" },
  compare: true,
  today: "2026-10-16",
});
const sel: ExplorerSelection = {
  event: "calendar_poll",
  metric: { kind: "distinct", key: "subscription" },
  filter: { key: "kind", value: "token" },
  by: null,
};

describe("explorer queries", () => {
  it("event, keys and values are parameters", () => {
    const q = eventSeriesQuery(ctx, sel);
    expect(q.params).toMatchObject({
      event: "calendar_poll",
      metric_key: "subscription",
      filter_key: "kind",
      filter_value: "token",
    });
    expect(q.sql).toContain("LAX_STRING(e.props[@filter_key]) = @filter_value");
    expect(q.sql).toContain("COUNT(DISTINCT LAX_STRING(props[@metric_key]))");
    expect(q.sql).not.toContain("subscription");
    expect(q.sql).not.toContain("token");
  });
  it("daily rows and a range total in one query", () => {
    expect(eventSeriesQuery(ctx, sel).sql).toContain("GROUPING SETS ((period, day), (period))");
  });
  it("sessions count only sessions with a pageview", () => {
    const sql = eventSeriesQuery(ctx, { ...sel, metric: { kind: "sessions" }, filter: null }).sql;
    expect(sql).toContain("'$pageview'");
    expect(sql).toContain("COUNT(DISTINCT pv_session)");
  });
  it("no filter, no filter params", () => {
    const q = eventSeriesQuery(ctx, { ...sel, metric: { kind: "events" }, filter: null });
    expect(q.params.filter_key).toBeUndefined();
    expect(q.sql).not.toContain("@filter_key");
  });
  it("breakdown: top 20 by events in the current range, rest in Other", () => {
    const q = eventBreakdownQuery(ctx, { ...sel, by: "client" });
    expect(q.params.by_key).toBe("client");
    expect(q.sql).toContain("LIMIT 20");
    expect(q.sql).toContain("GROUPING SETS ((period, value, day), (period, value))");
  });
  it("event list excludes built-in events", () => {
    expect(eventListQuery(ctx).sql).toContain("NOT STARTS_WITH(event_name, '$')");
  });
  it("prop values: current range, event and key as params", () => {
    const q = propValuesQuery(ctx, "calendar_poll", "kind");
    expect(q.params).toMatchObject({ event: "calendar_poll", value_key: "kind" });
    expect(q.sql).toContain("period = 'cur'");
    expect(q.sql).toContain("LIMIT 20");
  });
});
