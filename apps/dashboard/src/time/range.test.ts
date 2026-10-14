// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addDays, daysBetween, defaultRange, rangeBounds, todayIn } from "./range";

describe("time", () => {
  it("today in a timezone", () => {
    expect(todayIn("Europe/Berlin", new Date("2026-10-13T22:30:00Z"))).toBe("2026-10-14");
    expect(todayIn("UTC", new Date("2026-10-13T22:30:00Z"))).toBe("2026-10-13");
  });
  it("adds days across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-01", "2026-10-28")).toBe(27);
  });
  it("default range is 28 days including today", () => {
    expect(defaultRange("2026-10-14")).toEqual({ from: "2026-09-17", to: "2026-10-14" });
  });
  it("bounds are local midnights in UTC, also over DST changes", () => {
    expect(rangeBounds({ from: "2026-10-24", to: "2026-10-25" }, "Europe/Berlin")).toEqual({
      fromTs: "2026-10-23T22:00:00.000Z",
      toTs: "2026-10-25T23:00:00.000Z",
    });
    expect(rangeBounds({ from: "2026-03-29", to: "2026-03-29" }, "Europe/Berlin")).toEqual({
      fromTs: "2026-03-28T23:00:00.000Z",
      toTs: "2026-03-29T22:00:00.000Z",
    });
    expect(rangeBounds({ from: "2026-10-01", to: "2026-10-01" }, "UTC")).toEqual({
      fromTs: "2026-10-01T00:00:00.000Z",
      toTs: "2026-10-02T00:00:00.000Z",
    });
  });
});
