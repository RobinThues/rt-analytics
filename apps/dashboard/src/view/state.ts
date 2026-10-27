// Every view is a URL (spec section 3, "Routes and URL state"). Broken values fall back to defaults.
import { daysBetween, defaultRange, isDay, type DateRange } from "@/time/range";
import { parseInterval, type Interval } from "./interval";

const MAX_DAYS = 400;
type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** `interval` is the URL choice (null: automatic); chartInterval() gives the one the charts use. */
export interface ViewState {
  range: DateRange;
  compare: boolean;
  interval: Interval | null;
}

export function parseViewState(params: Params, today: string): ViewState {
  const from = one(params.from);
  const to = one(params.to);
  const ok =
    from !== undefined &&
    to !== undefined &&
    isDay(from) &&
    isDay(to) &&
    from <= to &&
    to <= today &&
    daysBetween(from, to) < MAX_DAYS;
  return {
    range: ok ? { from, to } : defaultRange(today),
    compare: one(params.compare) !== "0",
    interval: parseInterval(params.interval),
  };
}
