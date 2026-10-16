import { CoverageNote } from "@/components/coverage-note";
import { KpiTile } from "@/components/kpi-tile";
import { QueryError } from "@/components/query-error";
import { TrendChart } from "@/components/trend-chart";
import { formatDecimal, formatInt, formatShare } from "@/lib/format";
import { toKpis } from "@/overview/model";
import { alignSeries } from "@/queries/series";
import type { TrafficRow } from "@/queries/overview";
import type { PanelProps } from "../page-data";
import { loadKpis, loadTraffic } from "./shared";

export async function KpiPanel({ ctx, live, maxBytes }: PanelProps) {
  const res = await loadKpis(ctx, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  const k = toKpis(res.rows, ctx.days, ctx.compare);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile
          label="Visitors per day"
          value={formatDecimal(k.visitorsPerDay.value)}
          change={k.visitorsPerDay.change}
          testId="kpi-visitors"
        />
        <KpiTile
          label="Persistent people"
          value={formatInt(k.persistentPeople.value)}
          change={k.persistentPeople.change}
          testId="kpi-people"
        />
        <KpiTile
          label="Sessions"
          value={formatInt(k.sessions.value)}
          change={k.sessions.change}
          testId="kpi-sessions"
        />
        <KpiTile
          label="Pageviews"
          value={formatInt(k.pageviews.value)}
          change={k.pageviews.change}
          testId="kpi-pageviews"
        />
        <KpiTile
          label="Bounce rate"
          value={formatShare(k.bounceRate.value)}
          change={k.bounceRate.change}
          testId="kpi-bounce"
        />
        <KpiTile label="Errors" value={formatInt(k.errors.value)} change={k.errors.change} testId="kpi-errors" />
      </div>
      <CoverageNote coverage={k.coverage.value} />
    </div>
  );
}

const series = (rows: readonly TrafficRow[], pick: (r: TrafficRow) => number) =>
  rows.map((r) => ({ period: r.period, day: r.day, n: pick(r) }));

export async function TrafficCharts({ ctx, live, maxBytes }: PanelProps) {
  const res = await loadTraffic(ctx, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  const charts: Array<[string, (r: TrafficRow) => number]> = [
    ["Visitors", (r) => r.visitors],
    ["Sessions", (r) => r.sessions],
    ["Pageviews", (r) => r.pageviews],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {charts.map(([title, pick]) => (
        <div key={title} className="min-w-0">
          <p className="mb-2 text-sm font-medium">{title}</p>
          <TrendChart
            title={title}
            data={alignSeries(series(res.rows, pick), ctx)}
            compare={ctx.compare}
            prevFrom={ctx.prev.from}
          />
        </div>
      ))}
    </div>
  );
}

export async function ErrorChart({ ctx, live, maxBytes }: PanelProps) {
  const res = await loadTraffic(ctx, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  return (
    <TrendChart
      title="Errors"
      data={alignSeries(
        series(res.rows, (r) => r.errors),
        ctx,
      )}
      compare={ctx.compare}
      prevFrom={ctx.prev.from}
    />
  );
}
