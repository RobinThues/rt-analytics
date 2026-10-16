import { describe, expect, it } from "vitest";
import { alignSeries, change, perDay } from "./series";

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
      { day: "2026-10-24", cur: 0, prev: 7 },
      { day: "2026-10-25", cur: 5, prev: 0 },
      { day: "2026-10-26", cur: 0, prev: 0 },
    ]);
  });
  it("no rows and compare off", () => {
    expect(alignSeries([], { ...ctx, compare: false }).map((p) => p.prev)).toEqual([null, null, null]);
  });
  it("change in percent, null when there is nothing to compare with", () => {
    expect(change(150, 100)).toBe(50);
    expect(change(0, 100)).toBe(-100);
    expect(change(5, 0)).toBeNull();
    expect(change(5, null)).toBeNull();
    expect(change(5, undefined)).toBeNull();
  });
  it("per day divides by calendar days and never returns NaN", () => {
    expect(perDay(30, 3)).toBe(10);
    expect(perDay(0, 3)).toBe(0);
    expect(perDay(5, 0)).toBe(0);
  });
});
