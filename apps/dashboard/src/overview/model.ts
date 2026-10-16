// Turns overview rows into what the tiles and tables show (spec section 6, "Metrics").
import type { Period } from "@/queries/context";
import type { BreakdownRow, ConsentRow, KpiRow, RetentionRow, VitalRow } from "@/queries/overview";
import { change, perDay } from "@/queries/series";

/** `change` is undefined when compare is off, null when there is nothing to compare with. */
export type Metric = { value: number; change: number | null | undefined };

export interface Kpis {
  visitorsPerDay: Metric;
  persistentPeople: Metric;
  returningPeople: Metric;
  sessions: Metric;
  pageviews: Metric;
  /** Share 0..1 of sessions with exactly one pageview. */
  bounceRate: Metric;
  errors: Metric;
  /** Share 0..1 of sessions with a persistent id. */
  coverage: Metric;
}

export interface BreakdownView {
  label: string;
  isOther: boolean;
  pageviews: number;
  visitorsPerDay: number;
  pageviewsChange: number | null | undefined;
}

const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

export function toKpis(rows: readonly KpiRow[], days: number, compare: boolean): Kpis {
  const cur = rows.find((r) => r.period === "cur");
  const prev = rows.find((r) => r.period === "prev");
  const metric = (pick: (r: KpiRow) => number): Metric => {
    const value = cur ? pick(cur) : 0;
    return { value, change: compare ? change(value, prev ? pick(prev) : null) : undefined };
  };
  return {
    visitorsPerDay: metric((r) => perDay(r.visitor_days, days)),
    persistentPeople: metric((r) => r.persistent_people),
    returningPeople: metric((r) => r.returning_people),
    sessions: metric((r) => r.sessions),
    pageviews: metric((r) => r.pageviews),
    bounceRate: metric((r) => share(r.bounced_sessions, r.sessions)),
    errors: metric((r) => r.errors),
    coverage: metric((r) => share(r.persistent_sessions, r.sessions)),
  };
}

/** Sorted by current pageviews; Other last and only when it has current data. */
export function toBreakdown(rows: readonly BreakdownRow[], days: number, compare: boolean): BreakdownView[] {
  const prev = new Map(rows.filter((r) => r.period === "prev").map((r) => [r.value, r.pageviews]));
  const view = (r: BreakdownRow): BreakdownView => ({
    label: r.value ?? "Other",
    isOther: r.value === null,
    pageviews: r.pageviews,
    visitorsPerDay: perDay(r.visitor_days, days),
    pageviewsChange: compare ? change(r.pageviews, prev.get(r.value) ?? null) : undefined,
  });
  const cur = rows.filter((r) => r.period === "cur");
  const named = cur.filter((r) => r.value !== null).sort((a, b) => b.pageviews - a.pageviews);
  const other = cur.filter((r) => r.value === null);
  return [...named, ...other].map(view);
}

export function toRetention(rows: readonly RetentionRow[]): Array<{ cohort: string; size: number; shares: number[] }> {
  const cohorts = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const weeks = cohorts.get(r.cohort) ?? new Map<number, number>();
    weeks.set(r.week_n, r.people);
    cohorts.set(r.cohort, weeks);
  }
  return [...cohorts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cohort, weeks]) => {
      const size = weeks.get(0) ?? 0;
      const last = Math.max(0, ...weeks.keys());
      return {
        cohort,
        size,
        shares: Array.from({ length: last + 1 }, (_, i) => share(weeks.get(i) ?? 0, size)),
      };
    });
}

/** Share of pageviews per consent state; prevShare is null when there is no previous data at all. */
export function toConsentShares(
  rows: readonly ConsentRow[],
): Array<{ state: string; share: number; prevShare: number | null }> {
  const total = (p: Period) => rows.filter((r) => r.period === p).reduce((s, r) => s + r.pageviews, 0);
  const curTotal = total("cur");
  const prevTotal = total("prev");
  const prev = new Map(rows.filter((r) => r.period === "prev").map((r) => [r.consent_state, r.pageviews]));
  return rows
    .filter((r) => r.period === "cur")
    .map((r) => ({
      state: r.consent_state,
      share: share(r.pageviews, curTotal),
      prevShare: prevTotal > 0 ? share(prev.get(r.consent_state) ?? 0, prevTotal) : null,
    }))
    .sort((a, b) => b.share - a.share);
}

export type VitalName = VitalRow["metric"];
export const VITAL_NAMES: readonly VitalName[] = ["LCP", "INP", "CLS"];

/** p75 per metric; a metric without current samples has no value and no change (not "new"). */
export function toVitals(
  rows: readonly VitalRow[],
  compare: boolean,
): Record<VitalName, { value: number | null; change: number | null | undefined }> {
  const find = (period: Period, metric: VitalName) => rows.find((r) => r.period === period && r.metric === metric);
  const entry = (metric: VitalName) => {
    const cur = find("cur", metric);
    if (!cur) return { value: null, change: undefined };
    return { value: cur.p75, change: compare ? change(cur.p75, find("prev", metric)?.p75 ?? null) : undefined };
  };
  return { LCP: entry("LCP"), INP: entry("INP"), CLS: entry("CLS") };
}
