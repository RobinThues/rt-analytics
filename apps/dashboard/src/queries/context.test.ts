// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildContext, eventsCte, periodOf, sessionsCte, toSpec } from "./context";

const base = { table: "`p.analytics.events`", appId: "demo", settings: { timezone: "Europe/Berlin", hosts: [] } };

describe("buildContext", () => {
  it("range including today: partial cut, read window covers the previous period plus one day each side", () => {
    const ctx = buildContext({
      ...base,
      range: { from: "2026-10-01", to: "2026-10-16" },
      compare: true,
      today: "2026-10-16",
    });
    expect(ctx.days).toBe(16);
    expect(ctx.prev).toEqual({ from: "2026-09-15", to: "2026-09-30" });
    expect(ctx.params).toEqual({
      app_id: "demo",
      tz: "Europe/Berlin",
      from_ts: "2026-09-30T22:00:00.000Z",
      to_ts: "2026-10-16T22:00:00.000Z",
      prev_from_ts: "2026-09-14T22:00:00.000Z",
      prev_to_ts: "2026-09-30T22:00:00.000Z",
      prev_last_day_start: "2026-09-29T22:00:00.000Z",
      today_start: "2026-10-15T22:00:00.000Z",
      partial_today: true,
      compare: true,
      read_from_ts: "2026-09-13T22:00:00.000Z",
      read_to_ts: "2026-10-17T22:00:00.000Z",
    });
  });
  it("compare off: the read window starts one day before from", () => {
    const ctx = buildContext({
      ...base,
      range: { from: "2026-10-01", to: "2026-10-10" },
      compare: false,
      today: "2026-10-16",
    });
    expect(ctx.params.read_from_ts).toBe("2026-09-29T22:00:00.000Z");
    expect(ctx.params.partial_today).toBe(false);
    expect(ctx.params.compare).toBe(false);
  });
  it("params are the same all day long (no time of day in them)", () => {
    const input = { ...base, range: { from: "2026-10-01", to: "2026-10-16" }, compare: true, today: "2026-10-16" };
    expect(buildContext(input).params).toEqual(buildContext(input).params);
  });
});

describe("SQL fragments", () => {
  it("periodOf cuts the previous period at the same time of day when today is in range", () => {
    const sql = periodOf("timestamp");
    expect(sql).toContain("TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), TIMESTAMP(@today_start), SECOND)");
    expect(sql).toContain("@partial_today");
    expect(sql).toContain("'cur'");
    expect(sql).toContain("'prev'");
  });
  it("eventsCte filters app and the read window and selects only the given columns", () => {
    const sql = eventsCte("`p.analytics.events`", ["event_name", "timestamp"]);
    expect(sql).toContain("app_id = @app_id");
    expect(sql).toContain("timestamp >= TIMESTAMP(@read_from_ts) AND timestamp < TIMESTAMP(@read_to_ts)");
    expect(sql).not.toContain("props");
  });
  it("sessions need a pageview and use the daily prefix from the schema", () => {
    const sql = sessionsCte();
    expect(sql).toContain("HAVING COUNTIF(event_name = '$pageview') > 0");
    expect(sql).toContain("STARTS_WITH(visitor_id, 'd_')");
  });
  it("toSpec drops params the SQL does not use", () => {
    const spec = toSpec("check", "SELECT @a, @ab", { a: 1, ab: 2, abc: 3 });
    expect(spec.params).toEqual({ a: 1, ab: 2 });
  });
});
