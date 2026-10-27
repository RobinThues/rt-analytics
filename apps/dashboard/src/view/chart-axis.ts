// Axis and tooltip labels of the trend charts (spec 2026-10-27-hourly-charts). A point's `at` is a day
// ("2026-10-27") or a wall-clock hour ("2026-10-27T09:00") the server formatted in the app's timezone, so
// these helpers only cut strings: the browser's own timezone can never change a label.
import { formatShortDay } from "@/lib/format";
import type { Interval } from "./interval";

type Point = { at: string };

const dayOf = (at: string) => at.slice(0, 10);
const timeOf = (at: string) => at.slice(11, 16);

/** "27 Oct", or "27 Oct, 09:00" for an hour. */
export const pointLabel = (at: string) =>
  at.length > 10 ? `${formatShortDay(dayOf(at))}, ${timeOf(at)}` : formatShortDay(at);

/** True when all points are on one day. */
export const oneDay = (points: readonly Point[]) => new Set(points.map((p) => dayOf(p.at))).size <= 1;

/**
 * The x ticks of an hourly chart: every 3 hours on a one-day chart, else the first hour of each day.
 * Daily charts keep recharts' own ticks (undefined).
 */
export function chartTicks(points: readonly Point[], interval: Interval): string[] | undefined {
  if (interval === "day") return undefined;
  if (oneDay(points)) return points.filter((p) => Number(timeOf(p.at).slice(0, 2)) % 3 === 0).map((p) => p.at);
  return points.filter((p, i) => i === 0 || dayOf(points[i - 1].at) !== dayOf(p.at)).map((p) => p.at);
}

/** A tick's text: the time on a one-day hourly chart, else the day. */
export const tickLabel = (at: string, interval: Interval, isOneDay: boolean) =>
  interval === "hour" && isOneDay ? timeOf(at) : formatShortDay(dayOf(at));
