import { describe, expect, it } from "vitest";
import type { BreakdownRow, KpiRow } from "@/queries/overview";
import { toBreakdown, toConsentShares, toKpis, toRetention } from "./model";

describe("overview model", () => {
  it("toKpis: per-day visitors, shares and change; zero sessions give 0 rates, not NaN", () => {
    const cur: KpiRow = {
      period: "cur",
      visitor_days: 300,
      persistent_people: 10,
      returning_people: 4,
      sessions: 200,
      persistent_sessions: 20,
      bounced_sessions: 50,
      pageviews: 400,
      errors: 2,
    };
    const prev: KpiRow = { ...cur, period: "prev", visitor_days: 150, sessions: 0, persistent_sessions: 0, bounced_sessions: 0 };
    const k = toKpis([cur, prev], 30, true);
    expect(k.visitorsPerDay).toEqual({ value: 10, change: 100 });
    expect(k.bounceRate.value).toBe(0.25);
    expect(k.coverage.value).toBe(0.1);
    expect(k.sessions.change).toBeNull();
    expect(toKpis([], 30, true).bounceRate).toEqual({ value: 0, change: null });
    expect(toKpis([cur], 30, false).pageviews.change).toBeUndefined();
  });
  it("toBreakdown: Other last and only with data, prev values outside the top count into Other", () => {
    const rows: BreakdownRow[] = [
      { period: "cur", value: "/a", pageviews: 10, visitor_days: 30 },
      { period: "cur", value: "/b", pageviews: 20, visitor_days: 3 },
      { period: "prev", value: null, pageviews: 7, visitor_days: 3 },
      { period: "prev", value: "/b", pageviews: 10, visitor_days: 3 },
    ];
    expect(toBreakdown(rows, 3, true)).toEqual([
      { label: "/b", isOther: false, pageviews: 20, visitorsPerDay: 1, pageviewsChange: 100 },
      { label: "/a", isOther: false, pageviews: 10, visitorsPerDay: 10, pageviewsChange: null },
    ]);
    const withOther = toBreakdown([...rows, { period: "cur", value: null, pageviews: 1, visitor_days: 1 }], 3, true);
    expect(withOther.at(-1)).toMatchObject({ label: "Other", isOther: true, pageviewsChange: -85.71428571428571 });
  });
  it("toBreakdown without compare has no change", () => {
    expect(toBreakdown([{ period: "cur", value: "/a", pageviews: 1, visitor_days: 1 }], 1, false)[0]?.pageviewsChange).toBeUndefined();
  });
  it("toRetention: shares relative to week 0", () => {
    expect(
      toRetention([
        { cohort: "2026-09-07", week_n: 0, people: 10 },
        { cohort: "2026-09-07", week_n: 2, people: 3 },
      ]),
    ).toEqual([{ cohort: "2026-09-07", size: 10, shares: [1, 0, 0.3] }]);
  });
  it("toConsentShares: shares per period, sorted by the current share", () => {
    expect(
      toConsentShares([
        { period: "cur", consent_state: "pending", pageviews: 75 },
        { period: "cur", consent_state: "accepted", pageviews: 25 },
        { period: "prev", consent_state: "accepted", pageviews: 10 },
      ]),
    ).toEqual([
      { state: "pending", share: 0.75, prevShare: 0 },
      { state: "accepted", share: 0.25, prevShare: 1 },
    ]);
    expect(toConsentShares([{ period: "cur", consent_state: "pending", pageviews: 5 }])).toEqual([
      { state: "pending", share: 1, prevShare: null },
    ]);
  });
});
