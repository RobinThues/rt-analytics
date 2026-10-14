// Date ranges in an app's timezone (spec section 6, "Time"). Days are "YYYY-MM-DD" strings.
export type DateRange = { from: string; to: string };

const DAY_MS = 86_400_000;
const toUtcMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const fromUtcMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function todayIn(tz: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    now,
  );
}

export const addDays = (day: string, n: number) => fromUtcMs(toUtcMs(day) + n * DAY_MS);
export const daysBetween = (from: string, to: string) => Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
export const defaultRange = (today: string): DateRange => ({ from: addDays(today, -27), to: today });

/** True for a real calendar day like "2026-02-28" (rejects "2026-02-30"). */
export function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toUtcMs(value)) && fromUtcMs(toUtcMs(value)) === value;
}

/** Offset of tz from UTC in minutes at the given instant. */
function offsetMinutes(tz: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at) / 60_000);
}

/** UTC instant of 00:00 local time on `day` in `tz`. */
function localMidnight(day: string, tz: string): number {
  const guess = toUtcMs(day);
  const first = guess - offsetMinutes(tz, guess) * 60_000;
  return guess - offsetMinutes(tz, first) * 60_000;
}

/** [from 00:00, to+1 00:00) in tz, as UTC ISO strings for the partition filter. */
export function rangeBounds(range: DateRange, tz: string): { fromTs: string; toTs: string } {
  return {
    fromTs: new Date(localMidnight(range.from, tz)).toISOString(),
    toTs: new Date(localMidnight(addDays(range.to, 1), tz)).toISOString(),
  };
}
