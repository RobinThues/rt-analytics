import { describe, expect, it } from "vitest";
import { formatBytes, formatChange, formatDecimal, formatInt, formatShare, formatShortDay } from "./format";

describe("formatBytes", () => {
  it("uses decimal units", () => {
    expect(formatBytes(1_000_000_000)).toBe("1 GB");
    expect(formatBytes(500_000_000)).toBe("500 MB");
    expect(formatBytes(2_500_000_000)).toBe("2.5 GB");
    expect(formatBytes(999)).toBe("999 B");
  });
});

describe("number formats", () => {
  it("change in percent with sign, 'new' when there is nothing to compare with", () => {
    expect(formatChange(12.4)).toBe("+12 %");
    expect(formatChange(-5)).toBe("−5 %");
    expect(formatChange(0)).toBe("0 %");
    expect(formatChange(null)).toBe("new");
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
  });
});
