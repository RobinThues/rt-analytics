import { describe, expect, it } from "vitest";
import { chartInterval, hourlyAllowed, MAX_HOURLY_DAYS, parseInterval } from "./interval";

describe("parseInterval", () => {
  it("reads hour and day, anything else is no choice", () => {
    expect(parseInterval("hour")).toBe("hour");
    expect(parseInterval("day")).toBe("day");
    for (const v of [undefined, "", "HOUR", "week", ["hour"]]) expect(parseInterval(v)).toBeNull();
  });
});

describe("chartInterval", () => {
  const days = (n: number) => ({ from: "2026-10-01", to: `2026-10-${String(n).padStart(2, "0")}` });

  it("without a choice: hourly for one day, daily otherwise", () => {
    expect(chartInterval(days(1), null)).toBe("hour");
    expect(chartInterval(days(2), null)).toBe("day");
    expect(chartInterval(days(28), null)).toBe("day");
  });
  it("the choice wins up to 7 days", () => {
    expect(chartInterval(days(1), "day")).toBe("day");
    expect(chartInterval(days(2), "hour")).toBe("hour");
    expect(chartInterval(days(MAX_HOURLY_DAYS), "hour")).toBe("hour");
  });
  it("longer ranges are always daily", () => {
    expect(chartInterval(days(MAX_HOURLY_DAYS + 1), "hour")).toBe("day");
    expect(hourlyAllowed(days(MAX_HOURLY_DAYS))).toBe(true);
    expect(hourlyAllowed(days(MAX_HOURLY_DAYS + 1))).toBe(false);
  });
});
