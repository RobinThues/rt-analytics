import { describe, expect, it } from "vitest";
import { funnelGeometry } from "./chart";
import { toFunnelView } from "./steps";

const view = toFunnelView(
  [
    { period: "cur", step: 1, sessions: 2807 },
    { period: "cur", step: 2, sessions: 1140 },
    { period: "cur", step: 3, sessions: 312 },
    { period: "prev", step: 1, sessions: 2505 },
    { period: "prev", step: 2, sessions: 980 },
    { period: "prev", step: 3, sessions: 290 },
  ],
  3,
  true,
);

describe("funnelGeometry", () => {
  it("scales bars to the largest value, with previous-period bars and conversion chips", () => {
    const g = funnelGeometry(view, { compare: true, size: 180 });
    expect(g.bars.map((b) => Math.round(b.length))).toEqual([180, 73, 20]);
    expect(g.bars.map((b) => Math.round(b.prevLength ?? -1))).toEqual([161, 63, 19]);
    expect(g.chips).toEqual([
      { afterStep: 1, label: "41 % →" },
      { afterStep: 2, label: "27 % →" },
    ]);
  });

  it("no previous bars without compare", () => {
    expect(funnelGeometry(view, { compare: false, size: 180 }).bars.every((b) => b.prevLength === null)).toBe(true);
  });

  it("an empty funnel has zero-length bars and no NaN", () => {
    const empty = funnelGeometry(toFunnelView([], 2, true), { compare: true, size: 100 });
    expect(empty.bars.map((b) => b.length)).toEqual([0, 0]);
    expect(empty.bars.map((b) => b.prevLength)).toEqual([0, 0]);
    expect(empty.chips).toEqual([{ afterStep: 1, label: "– →" }]);
  });
});
