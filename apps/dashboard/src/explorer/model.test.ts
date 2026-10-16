import { describe, expect, it } from "vitest";
import type { EventListRow, MetricRow } from "@/queries/explorer";
import { catalog } from "./fixtures";
import { metricTotals, toEventList, toPropBreakdown, valuesByKey } from "./model";

const ctx = {
  range: { from: "2026-10-01", to: "2026-10-03" },
  prev: { from: "2026-09-28", to: "2026-09-30" },
  compare: true,
};

describe("explorer model", () => {
  it("metricTotals: per-day average for visitors, total row for events", () => {
    const rows: MetricRow[] = [
      { period: "cur", day: "2026-10-01", n: 4 },
      { period: "cur", day: "2026-10-02", n: 2 },
      { period: "cur", day: null, n: 5 },
      { period: "prev", day: null, n: 10 },
    ];
    expect(metricTotals(rows, { kind: "visitors" }, 3)).toEqual({ cur: 2, prev: 0 });
    expect(metricTotals(rows, { kind: "events" }, 3)).toEqual({ cur: 5, prev: 10 });
    expect(metricTotals(rows.slice(0, 3), { kind: "events" }, 3)).toEqual({ cur: 5, prev: null });
  });
  it("toEventList: every catalog event, zeros when missing, sorted by total, spark per day", () => {
    const rows: EventListRow[] = [
      { period: "cur", event_name: "place_selected", day: "2026-10-02", events: 3 },
      { period: "prev", event_name: "place_selected", day: "2026-09-28", events: 6 },
    ];
    expect(toEventList(rows, ctx, catalog)).toEqual([
      { name: "place_selected", total: 3, change: -50, spark: [0, 3, 0] },
      { name: "calendar_poll", total: 0, change: 0, spark: [0, 0, 0] },
    ]);
  });
  it("toPropBreakdown: Other last, per-day for distinct, change against prev", () => {
    const rows = [
      { period: "cur", value: "a", day: null, n: 9 },
      { period: "cur", value: "a", day: "2026-10-01", n: 3 },
      { period: "cur", value: null, day: null, n: 1 },
      { period: "cur", value: null, day: "2026-10-01", n: 3 },
      { period: "prev", value: "a", day: null, n: 3 },
      { period: "prev", value: "a", day: "2026-09-28", n: 6 },
    ] as const;
    expect(toPropBreakdown([...rows], { kind: "events" }, 3, true)).toEqual([
      { label: "a", isOther: false, cur: 9, change: 200 },
      { label: "Other", isOther: true, cur: 1, change: null },
    ]);
    expect(toPropBreakdown([...rows], { kind: "distinct", key: "k" }, 3, false)[0]).toEqual({
      label: "a",
      isOther: false,
      cur: 1,
      change: undefined,
    });
  });
});

describe("valuesByKey", () => {
  it("groups the value rows per key in row order, also for prototype names", () => {
    expect(
      valuesByKey([
        { key: "kind", value: "token" },
        { key: "kind", value: "legacy" },
        { key: "__proto__", value: "x" },
      ]),
    ).toEqual([
      ["kind", ["token", "legacy"]],
      ["__proto__", ["x"]],
    ]);
  });
});
