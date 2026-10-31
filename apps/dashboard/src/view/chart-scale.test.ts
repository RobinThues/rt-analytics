import { describe, expect, it } from "vitest";
import { logTickLabel, logTicks, parseScale } from "./chart-scale";

describe("parseScale", () => {
  it("is linear unless the URL says log", () => {
    expect(parseScale("log")).toBe("log");
    expect(parseScale("linear")).toBe("linear");
    expect(parseScale(undefined)).toBe("linear");
    expect(parseScale("sqrt")).toBe("linear");
    expect(parseScale(["log", "log"])).toBe("linear");
  });
});

describe("logTickLabel", () => {
  it("keeps short values and shortens long ones to fit the axis", () => {
    expect(logTickLabel(0)).toBe("0");
    expect(logTickLabel(10_000)).toBe("10,000");
    expect(logTickLabel(100_000)).toBe("100K");
    expect(logTickLabel(1_000_000)).toBe("1M");
  });
});

describe("logTicks", () => {
  it("runs from 0 to the first power of ten at or above the largest value", () => {
    expect(logTicks([1000])).toEqual([0, 1, 10, 100, 1000]);
    expect(logTicks([11])).toEqual([0, 1, 10, 100]);
  });

  it("leaves out 1 from 10,000 up, where its label would touch the 0", () => {
    expect(logTicks([3, 3669, 900])).toEqual([0, 10, 100, 1000, 10000]);
    expect(logTicks([120_000])).toEqual([0, 10, 100, 1000, 10000, 100000, 1000000]);
  });

  it("stays usable with only zeros, nulls or nothing", () => {
    expect(logTicks([0, 0])).toEqual([0, 1]);
    expect(logTicks([null])).toEqual([0, 1]);
    expect(logTicks([])).toEqual([0, 1]);
    expect(logTicks([0.5])).toEqual([0, 1]);
  });
});
