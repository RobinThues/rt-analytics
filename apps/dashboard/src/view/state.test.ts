import { describe, expect, it } from "vitest";
import { parseViewState } from "./state";

const today = "2026-10-14";

describe("parseViewState", () => {
  it("defaults to 28 days with compare on", () => {
    expect(parseViewState({}, today)).toEqual({ range: { from: "2026-09-17", to: today }, compare: true });
  });
  it("reads a valid range and compare=0", () => {
    expect(parseViewState({ from: "2026-10-01", to: "2026-10-07", compare: "0" }, today)).toEqual({
      range: { from: "2026-10-01", to: "2026-10-07" },
      compare: false,
    });
  });
  it("falls back for broken, reversed, future or too long ranges", () => {
    const fallback = parseViewState({}, today).range;
    for (const p of [
      { from: "x", to: "2026-10-07" },
      { from: "2026-10-07", to: "2026-10-01" },
      { from: "2026-10-01", to: "2026-12-01" },
      { from: "2024-01-01", to: "2026-10-01" },
      { from: ["2026-10-01"], to: "2026-10-07" },
      { from: "2026-02-30", to: "2026-03-02" },
    ])
      expect(parseViewState(p, today).range).toEqual(fallback);
  });
});
