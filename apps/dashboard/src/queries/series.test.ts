import { describe, expect, it } from "vitest";
import { buildContext } from "./context";
import { alignHours, alignSeries, change, chartSeries, perDay } from "./series";

const ctx = {
  range: { from: "2026-10-24", to: "2026-10-26" },
  prev: { from: "2026-10-21", to: "2026-10-23" },
  compare: true,
};

describe("series", () => {
  it("one point per calendar day across the DST change, missing days are 0, prev aligned by offset", () => {
    const rows = [
      { period: "cur" as const, day: "2026-10-25", n: 5 },
      { period: "prev" as const, day: "2026-10-21", n: 7 },
    ];
    expect(alignSeries(rows, ctx)).toEqual([
      { at: "2026-10-24", prevAt: "2026-10-21", cur: 0, prev: 7 },
      { at: "2026-10-25", prevAt: "2026-10-22", cur: 5, prev: 0 },
      { at: "2026-10-26", prevAt: "2026-10-23", cur: 0, prev: 0 },
    ]);
  });
  it("no rows and compare off", () => {
    const points = alignSeries([], { ...ctx, compare: false });
    expect(points.map((p) => p.prev)).toEqual([null, null, null]);
    expect(points.map((p) => p.prevAt)).toEqual([null, null, null]);
  });
  it("change in percent, null when there is nothing to compare with", () => {
    expect(change(150, 100)).toBe(50);
    expect(change(0, 100)).toBe(-100);
    expect(change(5, 0)).toBeNull();
    expect(change(5, null)).toBeNull();
    expect(change(5, undefined)).toBeNull();
  });
  it("nothing in both periods is no change, not 'new'", () => {
    expect(change(0, 0)).toBe(0);
  });
  it("per day divides by calendar days and never returns NaN", () => {
    expect(perDay(30, 3)).toBe(10);
    expect(perDay(0, 3)).toBe(0);
    expect(perDay(5, 0)).toBe(0);
  });
});

const hourCtx = (tz: string, from: string, to = from, compare = true) =>
  buildContext({
    table: "t",
    appId: "demo",
    settings: { timezone: tz, hosts: [] },
    range: { from, to },
    compare,
    today: "2026-12-31",
    interval: "hour",
  });

describe("alignHours", () => {
  it("24 wall-clock hours, missing hours 0, previous period aligned by wall clock", () => {
    const rows = [
      { period: "cur" as const, hour_start: "2026-10-27T09:00", n: 40 },
      { period: "prev" as const, hour_start: "2026-10-26T00:00", n: 3 },
    ];
    const points = alignHours(rows, hourCtx("Europe/Berlin", "2026-10-27"), null);
    expect(points).toHaveLength(24);
    expect(points[0]).toEqual({ at: "2026-10-27T00:00", prevAt: "2026-10-26T00:00", cur: 0, prev: 3 });
    expect(points[9]).toEqual({ at: "2026-10-27T09:00", prevAt: "2026-10-26T09:00", cur: 40, prev: 0 });
    expect(points[23].at).toBe("2026-10-27T23:00");
  });
  it("leaves out hours after the query's as_of hour; that hour stays", () => {
    const ctx = hourCtx("Europe/Berlin", "2026-10-27");
    const at = (asOf: string | null) => alignHours([], ctx, asOf).map((p) => p.at);
    expect(at("2026-10-27T08:30:00.123456Z").at(-1)).toBe("2026-10-27T09:00"); // 09:30 in Berlin
    expect(at("2026-10-27T08:30:00Z")).toHaveLength(10);
    expect(at("2026-10-27T08:30:00.733840000Z")).toHaveLength(10); // as BigQuery returns it
    expect(at("2026-11-01T00:00:00Z")).toHaveLength(24);
    expect(at("2026-10-26T12:00:00Z")).toHaveLength(0);
    expect(at("not a time")).toHaveLength(24);
  });
  it("autumn DST day: 24 points, the repeated hour is one point", () => {
    const rows = [{ period: "cur" as const, hour_start: "2026-10-25T02:00", n: 3 }];
    const points = alignHours(rows, hourCtx("Europe/Berlin", "2026-10-25"), null);
    expect(points).toHaveLength(24);
    expect(points.slice(1, 4).map((p) => [p.at, p.cur])).toEqual([
      ["2026-10-25T01:00", 0],
      ["2026-10-25T02:00", 3],
      ["2026-10-25T03:00", 0],
    ]);
    expect(new Set(points.map((p) => p.at)).size).toBe(24);
  });
  it("spring DST day: 23 points without 02:00", () => {
    const points = alignHours([], hourCtx("Europe/Berlin", "2026-03-29"), null);
    expect(points).toHaveLength(23);
    expect(points.slice(1, 3).map((p) => p.at)).toEqual(["2026-03-29T01:00", "2026-03-29T03:00"]);
  });
  it("a DST change inside the range keeps the previous period on the same wall-clock hour", () => {
    const rows = [
      { period: "cur" as const, hour_start: "2026-10-26T09:00", n: 50 },
      { period: "prev" as const, hour_start: "2026-10-19T09:00", n: 20 },
    ];
    const points = alignHours(rows, hourCtx("Europe/Berlin", "2026-10-21", "2026-10-27"), null);
    expect(points).toHaveLength(168);
    expect(points.find((p) => p.at === "2026-10-26T09:00")).toEqual({
      at: "2026-10-26T09:00",
      prevAt: "2026-10-19T09:00",
      cur: 50,
      prev: 20,
    });
    expect(points.at(-1)).toMatchObject({ at: "2026-10-27T23:00", prevAt: "2026-10-20T23:00" });
  });
  it("half-hour offset timezone: points are local hours", () => {
    const points = alignHours([], hourCtx("Asia/Kolkata", "2026-10-27"), null);
    expect(points).toHaveLength(24);
    expect(points.slice(0, 2).map((p) => p.at)).toEqual(["2026-10-27T00:00", "2026-10-27T01:00"]);
  });
  it("compare off: no previous values or labels", () => {
    const rows = [{ period: "prev" as const, hour_start: "2026-10-26T00:00", n: 3 }];
    const points = alignHours(rows, hourCtx("UTC", "2026-10-27", "2026-10-27", false), null);
    expect(points.every((p) => p.prev === null && p.prevAt === null)).toBe(true);
  });
});

describe("chartSeries", () => {
  // Explorer rows: per day (no hour_start), per hour (day NULL) and the range total (both NULL).
  const rows = [
    { period: "cur" as const, day: "2026-10-27", hour_start: null, n: 50, as_of: "2026-10-27T08:30:00Z" },
    { period: "cur" as const, day: null, hour_start: "2026-10-27T09:00", n: 40, as_of: "2026-10-27T08:30:00Z" },
    { period: "cur" as const, day: null, hour_start: null, n: 50, as_of: "2026-10-27T08:30:00Z" },
  ];
  it("hourly uses only the hour rows and cuts at their as_of", () => {
    const points = chartSeries(rows, hourCtx("Europe/Berlin", "2026-10-27"));
    expect(points).toHaveLength(10);
    expect(points.reduce((s, p) => s + p.cur, 0)).toBe(40);
  });
  it("daily uses only the day rows and never cuts (today stays, partial)", () => {
    const c = { ...hourCtx("Europe/Berlin", "2026-10-27"), interval: "day" as const };
    expect(chartSeries(rows, c)).toEqual([{ at: "2026-10-27", prevAt: "2026-10-26", cur: 50, prev: 0 }]);
  });
  it("daily rows without hour_start (the daily SQL) count as daily", () => {
    const c = { ...hourCtx("Europe/Berlin", "2026-10-27"), interval: "day" as const };
    expect(chartSeries([{ period: "cur", day: "2026-10-27", n: 7 }], c)[0].cur).toBe(7);
  });
});
