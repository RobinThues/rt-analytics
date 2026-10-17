// @vitest-environment node
import { describe, expect, it } from "vitest";
import { kpiCellClass, kpiEdges } from "./kpi-grid";

const tokens = (s: string) => s.split(" ").filter(Boolean);

describe("kpiEdges", () => {
  it("lines only between cells, never around the outside", () => {
    expect(kpiEdges(0, 6, 6)).toEqual({ left: false, top: false, bottom: false });
    expect(kpiEdges(3, 6, 6)).toEqual({ left: true, top: false, bottom: false });
    expect(kpiEdges(2, 6, 2)).toEqual({ left: false, top: true, bottom: true });
    expect(kpiEdges(5, 6, 3)).toEqual({ left: true, top: true, bottom: false });
    expect(kpiEdges(2, 3, 3)).toEqual({ left: true, top: false, bottom: false });
    expect(kpiEdges(0, 1, 1)).toEqual({ left: false, top: false, bottom: false });
  });
});

describe("kpiCellClass", () => {
  const summary = { base: 2, sm: 3, lg: 6 } as const;

  it("sets the line per breakpoint", () => {
    expect(tokens(kpiCellClass(1, 6, summary))).toEqual(
      expect.arrayContaining(["border-l", "sm:border-l", "lg:border-l", "pr-0", "sm:pr-4"]),
    );
    expect(tokens(kpiCellClass(3, 6, summary))).toEqual(
      expect.arrayContaining(["border-l", "sm:border-l-0", "lg:border-l"]),
    );
  });

  it("a single cell has no lines", () => {
    const t = tokens(kpiCellClass(0, 1, { base: 1 }));
    expect(t).not.toContain("border-l");
    expect(t).not.toContain("border-t");
  });
});
