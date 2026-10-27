import { describe, expect, it } from "vitest";
import { chartTicks, oneDay, pointLabel, tickLabel } from "./chart-axis";

const hours = (day: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ at: `${day}T${String(from + i).padStart(2, "0")}:00` }));

describe("chart axis", () => {
  it("tooltip labels: the day, or the day and the hour", () => {
    expect(pointLabel("2026-10-27")).toBe("27 Oct");
    expect(pointLabel("2026-10-27T09:00")).toBe("27 Oct, 09:00");
  });
  it("daily charts keep recharts' own ticks", () => {
    expect(chartTicks([{ at: "2026-10-26" }, { at: "2026-10-27" }], "day")).toBeUndefined();
    expect(tickLabel("2026-10-27", "day", false)).toBe("27 Oct");
  });
  it("one day of hours: a tick every 3 hours with the time", () => {
    const points = hours("2026-10-27", 0, 23);
    const ticks = chartTicks(points, "hour");
    expect(ticks).toEqual(["00", "03", "06", "09", "12", "15", "18", "21"].map((h) => `2026-10-27T${h}:00`));
    expect(oneDay(points)).toBe(true);
    expect(tickLabel("2026-10-27T09:00", "hour", true)).toBe("09:00");
  });
  it("several days of hours: a tick at the first hour of each day with the day", () => {
    const points = [...hours("2026-10-26", 0, 23), ...hours("2026-10-27", 0, 9)];
    const ticks = chartTicks(points, "hour");
    expect(ticks).toEqual(["2026-10-26T00:00", "2026-10-27T00:00"]);
    expect(oneDay(points)).toBe(false);
    expect(tickLabel("2026-10-27T00:00", "hour", false)).toBe("27 Oct");
  });
  it("a day that starts at 01:00 (DST gap at midnight) still gets its tick", () => {
    const points = [...hours("2026-09-05", 22, 23), ...hours("2026-09-06", 1, 3)];
    expect(chartTicks(points, "hour")).toEqual(["2026-09-05T22:00", "2026-09-06T01:00"]);
  });
});
