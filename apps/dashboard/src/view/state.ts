// Every view is a URL (spec section 3, "Routes and URL state"). Broken values fall back to defaults.
import { daysBetween, defaultRange, isDay, type DateRange } from "@/time/range";

const MAX_DAYS = 400;
type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export function parseViewState(params: Params, today: string): { range: DateRange; compare: boolean } {
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
  return { range: ok ? { from, to } : defaultRange(today), compare: one(params.compare) !== "0" };
}
