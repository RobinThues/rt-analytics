import { describe, expect, it } from "vitest";
import { dateToDay, dayToDate, formatRangeLabel, presetRange, rangeError, selectedPreset, withView } from "./range-ui";

describe("range presets and limits", () => {
  it("presets end today and include it", () => {
    expect(presetRange(7, "2026-10-16")).toEqual({ from: "2026-10-10", to: "2026-10-16" });
    expect(presetRange(28, "2026-10-16")).toEqual({ from: "2026-09-19", to: "2026-10-16" });
    expect(presetRange(90, "2026-10-16")).toEqual({ from: "2026-07-19", to: "2026-10-16" });
  });

  it("selectedPreset names the preset only for an exact preset ending today", () => {
    const today = "2026-10-17";
    expect(selectedPreset(presetRange(28, today), today)).toBe(28);
    expect(selectedPreset(presetRange(7, today), today)).toBe(7);
    expect(selectedPreset(presetRange(90, today), today)).toBe(90);
    expect(selectedPreset({ from: "2026-09-19", to: "2026-10-16" }, today)).toBeNull();
    expect(selectedPreset({ from: "2026-09-18", to: "2026-10-17" }, today)).toBeNull();
  });

  it("rangeError uses the parseViewState rules", () => {
    expect(rangeError({ from: "2026-10-01", to: "2026-10-17" }, "2026-10-16")).toBe("The end is after today.");
    expect(rangeError({ from: "2025-01-01", to: "2026-10-16" }, "2026-10-16")).toBe("Up to 400 days.");
    expect(rangeError({ from: "2026-10-10", to: "2026-10-01" }, "2026-10-16")).toBe("The start is after the end.");
    expect(rangeError({ from: "2026-09-19", to: "2026-10-16" }, "2026-10-16")).toBeNull();
  });
});

describe("formatRangeLabel", () => {
  it("one year at the end, both years across a new year, one day alone", () => {
    expect(formatRangeLabel({ from: "2026-09-19", to: "2026-10-16" })).toBe("19 Sept – 16 Oct 2026");
    expect(formatRangeLabel({ from: "2025-12-28", to: "2026-01-03" })).toBe("28 Dec 2025 – 3 Jan 2026");
    expect(formatRangeLabel({ from: "2026-10-16", to: "2026-10-16" })).toBe("16 Oct 2026");
  });
});

describe("withView", () => {
  it("puts from, to and compare first and keeps every other parameter in order", () => {
    expect(
      withView("?event=x&from=a&to=b&steps=s1&steps=s2", { range: { from: "2026-10-10", to: "2026-10-16" } }),
    ).toBe("?from=2026-10-10&to=2026-10-16&event=x&steps=s1&steps=s2");
    expect(withView("?from=a&to=b&compare=0&event=x", { compare: true })).toBe("?from=a&to=b&event=x");
    expect(withView("?from=a&to=b", { compare: false })).toBe("?from=a&to=b&compare=0");
  });
  it("keeps the interval after compare and sets a new one", () => {
    expect(withView("?event=x&interval=hour&from=a&to=b", { compare: false })).toBe(
      "?from=a&to=b&compare=0&interval=hour&event=x",
    );
    expect(withView("?from=a&to=b&interval=hour&event=x", { interval: "day" })).toBe(
      "?from=a&to=b&interval=day&event=x",
    );
    expect(withView("?from=a&to=b", { interval: "hour" })).toBe("?from=a&to=b&interval=hour");
  });
});

describe("local date helpers", () => {
  it("convert in the browser's local time, never through UTC", () => {
    expect(dateToDay(new Date(2026, 9, 16, 23, 30))).toBe("2026-10-16");
    expect(dateToDay(dayToDate("2026-03-29"))).toBe("2026-03-29");
    expect(dayToDate("2026-10-16").getHours()).toBe(0);
  });
});
