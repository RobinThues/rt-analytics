// Chart interval (spec 2026-10-27-hourly-charts): one point per day or per hour. Pure, so the server and
// the client control share it.
import { rangeDays, type DateRange } from "@/time/range";

export type Interval = "day" | "hour";

/** Hourly charts up to this many days (168 points). */
export const MAX_HOURLY_DAYS = 7;

/** The `interval` URL parameter; anything else is no choice (automatic). */
export function parseInterval(value: string | string[] | undefined): Interval | null {
  return value === "hour" || value === "day" ? value : null;
}

export const hourlyAllowed = (range: DateRange) => rangeDays(range) <= MAX_HOURLY_DAYS;

/** The interval the charts use: the choice when allowed, else hourly for one day and daily otherwise. */
export function chartInterval(range: DateRange, choice: Interval | null): Interval {
  if (!hourlyAllowed(range)) return "day";
  return choice ?? (rangeDays(range) === 1 ? "hour" : "day");
}
