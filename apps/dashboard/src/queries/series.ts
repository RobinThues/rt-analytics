// Pure helpers that turn period-labelled rows into chart and tile data.
import type { QueryContext, Period } from "./context";
import { addDays, eachDay } from "@/time/range";

/** One point per calendar day of the range; the previous period is aligned by day offset. Missing days are 0. */
export function alignSeries(
  rows: ReadonlyArray<{ period: Period; day: string; n: number }>,
  ctx: Pick<QueryContext, "range" | "prev" | "compare">,
): Array<{ day: string; cur: number; prev: number | null }> {
  const key = (period: Period, day: string) => `${period}|${day}`;
  const values = new Map(rows.map((r) => [key(r.period, r.day), r.n]));
  return eachDay(ctx.range).map((day, i) => ({
    day,
    cur: values.get(key("cur", day)) ?? 0,
    prev: ctx.compare ? (values.get(key("prev", addDays(ctx.prev.from, i))) ?? 0) : null,
  }));
}

/** Change in percent; null when there is nothing to compare with (previous value 0 or missing). */
export function change(cur: number, prev: number | null | undefined): number | null {
  if (prev === null || prev === undefined || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

/** "Per day" numbers: a sum of daily values divided by the calendar days of the range. */
export function perDay(sum: number, days: number): number {
  return days > 0 ? sum / days : 0;
}
