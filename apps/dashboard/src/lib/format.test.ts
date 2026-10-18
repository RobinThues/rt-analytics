import { describe, expect, it } from "vitest";
import { changeParts, formatBytes, formatDecimal, formatInt, formatShare, formatShortDay } from "./format";

describe("formatBytes", () => {
  it("uses decimal units", () => {
    expect(formatBytes(1_000_000_000)).toBe("1 GB");
    expect(formatBytes(500_000_000)).toBe("500 MB");
    expect(formatBytes(2_500_000_000)).toBe("2.5 GB");
    expect(formatBytes(999)).toBe("999 B");
  });
});

describe("number formats", () => {
  it("change as a direction and the rounded percent, 'new' when there is nothing to compare with", () => {
    expect(changeParts(12.4)).toEqual({ dir: "up", text: "12 %" });
    expect(changeParts(-5)).toEqual({ dir: "down", text: "5 %" });
    expect(changeParts(0.4)).toEqual({ dir: "none", text: "0 %" });
    expect(changeParts(null)).toEqual({ dir: "none", text: "new" });
  });
  it("changes from 1,000 % on are short, so they fit the Change column", () => {
    expect(changeParts(999.4)).toEqual({ dir: "up", text: "999 %" });
    expect(changeParts(999.6)).toEqual({ dir: "up", text: "1K %" });
    expect(changeParts(15_400)).toEqual({ dir: "up", text: "15K %" });
    expect(changeParts(153_000)).toEqual({ dir: "up", text: "150K %" });
    expect(changeParts(2_460_000)).toEqual({ dir: "up", text: "2.5M %" });
    expect(changeParts(1234)).toEqual({ dir: "up", text: "1.2K %" });
  });
  it("shares, decimals and integers", () => {
    expect(formatShare(0.14)).toBe("14 %");
    expect(formatDecimal(10)).toBe("10.0");
    expect(formatInt(1234.4)).toBe("1,234");
  });
});

describe("formatShortDay", () => {
  it("day and short month, independent of the server timezone", () => {
    expect(formatShortDay("2026-10-05")).toBe("5 Oct");
    expect(formatShortDay("2026-09-23")).toBe("23 Sept");
    expect(formatShortDay("2026-06-01")).toBe("1 Jun");
    expect(formatShortDay("2026-07-04")).toBe("4 Jul");
  });
});
