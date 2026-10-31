import { describe, expect, it } from "vitest";
import { logTicks, parseScale } from "./chart-scale";

describe("parseScale", () => {
  it("is linear unless the URL says log", () => {
    expect(parseScale("log")).toBe("log");
    expect(parseScale("linear")).toBe("linear");
    expect(parseScale(undefined)).toBe("linear");
    expect(parseScale("sqrt")).toBe("linear");
    expect(parseScale(["log", "log"])).toBe("linear");
  });
});

describe("logTicks", () => {
  it("runs from 0 to the first power of ten at or above the largest value", () => {
    expect(logTicks([3, 3669, 900])).toEqual([0, 1, 10, 100, 1000, 10000]);
    expect(logTicks([1000])).toEqual([0, 1, 10, 100, 1000]);
    expect(logTicks([11])).toEqual([0, 1, 10, 100]);
  });

  it("stays usable with only zeros, nulls or nothing", () => {
    expect(logTicks([0, 0])).toEqual([0, 1]);
    expect(logTicks([null])).toEqual([0, 1]);
    expect(logTicks([])).toEqual([0, 1]);
    expect(logTicks([0.5])).toEqual([0, 1]);
  });
});
