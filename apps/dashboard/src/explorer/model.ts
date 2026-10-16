// Turns explorer rows into list rows, totals and breakdown rows (spec section 6: visitors and distinct
// values are per-day averages; events and sessions are range totals).
import type { Catalog } from "@/discovery/catalog";
import type { Period, QueryContext } from "@/queries/context";
import type { BreakdownMetricRow, EventListRow, Metric, MetricRow, PropValueRow } from "@/queries/explorer";
import { change, perDay } from "@/queries/series";
import { eachDay } from "@/time/range";

const isPerDay = (m: Metric) => m.kind === "visitors" || m.kind === "distinct";

function total(rows: readonly MetricRow[], period: Period, metric: Metric, days: number): number | null {
  const mine = rows.filter((r) => r.period === period);
  if (mine.length === 0) return null;
  if (isPerDay(metric)) {
    return perDay(
      mine.filter((r) => r.day !== null).reduce((s, r) => s + r.n, 0),
      days,
    );
  }
  return mine.find((r) => r.day === null)?.n ?? 0;
}

export function metricTotals(
  rows: readonly MetricRow[],
  metric: Metric,
  days: number,
): { cur: number; prev: number | null } {
  return { cur: total(rows, "cur", metric, days) ?? 0, prev: total(rows, "prev", metric, days) };
}

export function toEventList(
  rows: readonly EventListRow[],
  ctx: Pick<QueryContext, "range" | "prev" | "compare">,
  catalog: Catalog,
): Array<{ name: string; total: number; change: number | null | undefined; spark: number[] }> {
  const days = eachDay(ctx.range);
  return catalog.events
    .map(({ name }) => {
      const mine = rows.filter((r) => r.event_name === name);
      const cur = mine.filter((r) => r.period === "cur");
      const sum = (p: Period) => mine.filter((r) => r.period === p).reduce((s, r) => s + r.events, 0);
      const byDay = new Map(cur.map((r) => [r.day, r.events]));
      return {
        name,
        total: sum("cur"),
        change: ctx.compare ? change(sum("cur"), sum("prev")) : undefined,
        spark: days.map((d) => byDay.get(d) ?? 0),
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export function toPropBreakdown(
  rows: readonly BreakdownMetricRow[],
  metric: Metric,
  days: number,
  compare: boolean,
): Array<{ label: string; isOther: boolean; cur: number; change: number | null | undefined }> {
  const values = [...new Set(rows.filter((r) => r.period === "cur").map((r) => r.value))];
  const forValue = (v: string | null) => rows.filter((r) => r.value === v);
  const out = values.map((v) => {
    const t = metricTotals(forValue(v), metric, days);
    return {
      label: v ?? "Other",
      isOther: v === null,
      cur: t.cur,
      change: compare ? change(t.cur, t.prev) : undefined,
    };
  });
  return [...out.filter((r) => !r.isOther).sort((a, b) => b.cur - a.cur), ...out.filter((r) => r.isOther)];
}

/** Value suggestions per prop key, as pairs for the client form (prop keys come from the ingest). */
export function valuesByKey(rows: readonly PropValueRow[]): Array<[string, string[]]> {
  const byKey = new Map<string, string[]>();
  for (const r of rows) {
    const list = byKey.get(r.key) ?? [];
    list.push(r.value);
    byKey.set(r.key, list);
  }
  return [...byKey];
}
