// Pure helpers that turn period-labelled rows into chart and tile data.
import type { QueryContext, Period } from "./context";
import { addDays, eachDay, localDateTime } from "@/time/range";

/**
 * One chart point. `at` is a day ("2026-10-27") or the wall-clock start of an hour ("2026-10-27T09:00") in
 * the app's timezone, `prevAt` the same for the previous period's aligned point (null without one).
 */
export type ChartPoint = { at: string; prevAt: string | null; cur: number; prev: number | null };

/** One point per calendar day of the range; the previous period is aligned by day offset. Missing days are 0. */
export function alignSeries(
  rows: ReadonlyArray<{ period: Period; day: string; n: number }>,
  ctx: Pick<QueryContext, "range" | "prev" | "compare">,
): ChartPoint[] {
  const key = (period: Period, day: string) => `${period}|${day}`;
  const values = new Map(rows.map((r) => [key(r.period, r.day), r.n]));
  return eachDay(ctx.range).map((day, i) => {
    const prevDay = addDays(ctx.prev.from, i);
    return {
      at: day,
      prevAt: ctx.compare ? prevDay : null,
      cur: values.get(key("cur", day)) ?? 0,
      prev: ctx.compare ? (values.get(key("prev", prevDay)) ?? 0) : null,
    };
  });
}

const HOUR_MS = 3_600_000;

/** "2026-10-27T09:00": the wall-clock hour of an instant in `tz`, as `hour_start` in SQL. */
const hourOf = (ms: number, tz: string) => `${localDateTime(ms, tz).slice(0, 13)}:00`;

/**
 * Every wall-clock hour of the range in order, from one-hour steps between the range's local midnights.
 * The repeated autumn DST hour is one hour; the skipped spring hour does not exist.
 */
function rangeHours(ctx: Pick<QueryContext, "tz" | "params">): string[] {
  const start = Date.parse(ctx.params.from_ts);
  const end = Date.parse(ctx.params.to_ts);
  const hours: string[] = [];
  for (let t = start; t < end; t += HOUR_MS) {
    const h = hourOf(t, ctx.tz);
    if (h !== hours.at(-1)) hours.push(h);
  }
  return hours;
}

/**
 * One point per wall-clock hour of the range (`hour_start` in SQL). The previous period is aligned by wall
 * clock: the same hour, the range's day count earlier. Hours after the hour of `asOf` (the query's
 * CURRENT_TIMESTAMP) are left out, so a cached result never shows hours it could not see as zeros.
 */
export function alignHours(
  rows: ReadonlyArray<{ period: Period; hour_start: string; n: number }>,
  ctx: Pick<QueryContext, "tz" | "compare" | "days" | "params">,
  asOf: string | null,
): ChartPoint[] {
  const key = (period: Period, hour: string) => `${period}|${hour}`;
  const values = new Map(rows.map((r) => [key(r.period, r.hour_start), r.n]));
  const asOfMs = asOf === null ? NaN : Date.parse(asOf);
  const last = Number.isNaN(asOfMs) ? null : hourOf(asOfMs, ctx.tz);
  return rangeHours(ctx)
    .filter((at) => last === null || at <= last)
    .map((at) => {
      const prevAt = ctx.compare ? `${addDays(at.slice(0, 10), -ctx.days)}${at.slice(10)}` : null;
      return {
        at,
        prevAt,
        cur: values.get(key("cur", at)) ?? 0,
        prev: prevAt === null ? null : (values.get(key("prev", prevAt)) ?? 0),
      };
    });
}

/**
 * Rows of a chart query: per day (`day`), per hour (`hour_start`), or a total without either. Hourly
 * queries also return `as_of`, the time the query ran.
 */
export type SeriesRow = {
  period: Period;
  day?: string | null;
  hour_start?: string | null;
  as_of?: string | null;
  n: number;
};

/** The chart points for the context's interval, from the rows of that interval only. */
export function chartSeries(
  rows: readonly SeriesRow[],
  ctx: Pick<QueryContext, "interval" | "range" | "prev" | "compare" | "tz" | "days" | "params">,
): ChartPoint[] {
  if (ctx.interval === "hour") {
    const hourly = rows.flatMap((r) =>
      typeof r.hour_start === "string" ? [{ period: r.period, hour_start: r.hour_start, n: r.n }] : [],
    );
    return alignHours(hourly, ctx, rows.find((r) => typeof r.as_of === "string")?.as_of ?? null);
  }
  const daily = rows.flatMap((r) =>
    typeof r.day === "string" && (r.hour_start ?? null) === null ? [{ period: r.period, day: r.day, n: r.n }] : [],
  );
  return alignSeries(daily, ctx);
}

/**
 * Change in percent; null ("new") when the previous value is missing or 0 while the current one is not.
 * Nothing in both periods is no change (0).
 */
export function change(cur: number, prev: number | null | undefined): number | null {
  if (prev === 0 && cur === 0) return 0;
  if (prev === null || prev === undefined || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

/** "Per day" numbers: a sum of daily values divided by the calendar days of the range. */
export function perDay(sum: number, days: number): number {
  return days > 0 ? sum / days : 0;
}
