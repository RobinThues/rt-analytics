// Range picker logic (layout spec, "Range picker"): presets, limits, the button label and the URL a new
// range or Compare value goes to. Pure, so the client picker and the tests share it.
import { formatShortDay } from "@/lib/format";
import { addDays, daysBetween, isDay, type DateRange } from "@/time/range";
import type { Interval } from "./interval";

export const RANGE_PRESETS = [7, 28, 90] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** Same limit as parseViewState: under 400 days. */
const MAX_DAYS = 400;

/** The last `days` days, today included (the v1 default is the last 28). */
export const presetRange = (days: RangePreset, today: string): DateRange => ({
  from: addDays(today, -(days - 1)),
  to: today,
});

/** The preset the range is exactly (ends today, that many days long), or null for a custom range. */
export function selectedPreset(range: DateRange, today: string): RangePreset | null {
  return (
    RANGE_PRESETS.find((d) => {
      const p = presetRange(d, today);
      return p.from === range.from && p.to === range.to;
    }) ?? null
  );
}

/** Why a range cannot be applied, or null (the rules of parseViewState). */
export function rangeError(range: DateRange, today: string): string | null {
  if (!isDay(range.from) || !isDay(range.to)) return "Pick a start and an end.";
  if (range.to > today) return "The end is after today.";
  if (range.from > range.to) return "The start is after the end.";
  if (daysBetween(range.from, range.to) >= MAX_DAYS) return "Up to 400 days.";
  return null;
}

/** "19 Sept – 16 Oct 2026"; both years when they differ; one day alone. */
export function formatRangeLabel(range: DateRange): string {
  const year = (d: string) => d.slice(0, 4);
  if (range.from === range.to) return `${formatShortDay(range.to)} ${year(range.to)}`;
  const from =
    year(range.from) === year(range.to)
      ? formatShortDay(range.from)
      : `${formatShortDay(range.from)} ${year(range.from)}`;
  return `${from} – ${formatShortDay(range.to)} ${year(range.to)}`;
}

const VIEW_KEYS = new Set(["from", "to", "compare", "interval"]);

/**
 * The query string for the same page with a new range, Compare value and/or chart interval: from, to,
 * compare and interval first (as viewQuery writes them), then every other parameter in its order.
 */
export function withView(search: string, view: { range?: DateRange; compare?: boolean; interval?: Interval }): string {
  const current = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out = new URLSearchParams();
  const from = view.range?.from ?? current.get("from");
  const to = view.range?.to ?? current.get("to");
  if (from !== null) out.set("from", from);
  if (to !== null) out.set("to", to);
  const compareOff = view.compare === undefined ? current.get("compare") === "0" : !view.compare;
  if (compareOff) out.set("compare", "0");
  const interval = view.interval ?? current.get("interval");
  if (interval !== null) out.set("interval", interval);
  for (const [k, v] of current) if (!VIEW_KEYS.has(k)) out.append(k, v);
  return `?${out.toString()}`;
}

/** A calendar day as a local-midnight Date (for the calendar), never through UTC. */
export function dayToDate(day: string): Date {
  return new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
}

/** The local calendar day of a Date (from the calendar), never through toISOString(). */
export function dateToDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
