import { redirect } from "next/navigation";
import { Suspense } from "react";
import { dataQuery } from "@/bq/query";
import { CredentialsBanner } from "@/components/credentials-banner";
import { EventList } from "@/components/event-list";
import { ExplorerControls } from "@/components/explorer-controls";
import { Header } from "@/components/header";
import { KpiTile } from "@/components/kpi-tile";
import { PageBody } from "@/components/page-body";
import { Panel } from "@/components/panel";
import { QueryError } from "@/components/query-error";
import { TrendChart } from "@/components/trend-chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildCatalog, type Catalog } from "@/discovery/catalog";
import { listEvents, listPropKeys } from "@/discovery/data";
import { toEventList, metricTotals, toPropBreakdown, valuesByKey } from "@/explorer/model";
import { explorerParams, needsCanonicalRedirect, parseExplorer } from "@/explorer/state";
import { formatChange, formatDecimal, formatInt } from "@/lib/format";
import { viewQuery } from "@/lib/query-string";
import {
  eventBreakdownQuery,
  eventListQuery,
  eventSeriesQuery,
  propValuesQuery,
  type BreakdownMetricRow,
  type EventListRow,
  type ExplorerSelection,
  type Metric,
  type MetricRow,
  type PropValueRow,
} from "@/queries/explorer";
import { alignSeries, change } from "@/queries/series";
import { loadPage, type PanelProps } from "../page-data";

const perDay = (m: Metric) => m.kind === "visitors" || m.kind === "distinct";

function metricLabel(m: Metric): string {
  switch (m.kind) {
    case "events":
      return "Events";
    case "sessions":
      return "Sessions with the event";
    case "visitors":
      return "Visitors with the event, per day";
    case "distinct":
      return `Distinct values of ${m.key}, per day`;
  }
}

async function EventListPanel({
  ctx,
  live,
  maxBytes,
  catalog,
  selected,
  hrefBase,
}: PanelProps & { catalog: Catalog; selected: string | null; hrefBase: string }) {
  const res = await dataQuery<EventListRow>(eventListQuery(ctx), ctx.appId, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  return (
    <EventList
      rows={toEventList(res.rows, ctx, catalog)}
      hrefFor={(e) => `${hrefBase}&event=${encodeURIComponent(e)}`}
      selected={selected}
      compare={ctx.compare}
    />
  );
}

async function SeriesPanel({ ctx, live, maxBytes, sel }: PanelProps & { sel: ExplorerSelection }) {
  const res = await dataQuery<MetricRow>(eventSeriesQuery(ctx, sel), ctx.appId, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  const t = metricTotals(res.rows, sel.metric, ctx.days);
  const fmt = perDay(sel.metric) ? formatDecimal : formatInt;
  const days = res.rows.flatMap((r) => (r.day === null ? [] : [{ period: r.period, day: r.day, n: r.n }]));
  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-64">
        <KpiTile
          label={perDay(sel.metric) ? "Average per day" : "Total in range"}
          value={fmt(t.cur)}
          change={ctx.compare ? change(t.cur, t.prev) : undefined}
          testId="explorer-total"
        />
      </div>
      <TrendChart
        title={metricLabel(sel.metric)}
        data={alignSeries(days, ctx)}
        compare={ctx.compare}
        prevFrom={ctx.prev.from}
      />
    </div>
  );
}

async function PropBreakdownPanel({
  ctx,
  live,
  maxBytes,
  sel,
}: PanelProps & { sel: ExplorerSelection & { by: string } }) {
  const res = await dataQuery<BreakdownMetricRow>(eventBreakdownQuery(ctx, sel), ctx.appId, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  const rows = toPropBreakdown(res.rows, sel.metric, ctx.days, ctx.compare);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data in this range.</p>;
  const fmt = perDay(sel.metric) ? formatDecimal : formatInt;
  return (
    <Table data-testid="explorer-breakdown" className="text-xs sm:text-sm">
      <TableHeader>
        <TableRow>
          <TableHead>{sel.by}</TableHead>
          <TableHead className="text-right">{perDay(sel.metric) ? "Per day" : "Total"}</TableHead>
          {ctx.compare && <TableHead className="text-right">Change</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.isOther ? "\u0000other" : r.label} className={r.isOther ? "text-muted-foreground" : ""}>
            <TableCell className="max-w-48 truncate" title={r.label}>
              {r.label}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt(r.cur)}</TableCell>
            {ctx.compare && <TableCell className="text-right tabular-nums">{formatChange(r.change ?? null)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

async function ControlsPanel({
  ctx,
  live,
  catalog,
  sel,
  qsBase,
}: PanelProps & { catalog: Catalog; sel: ExplorerSelection; qsBase: Array<[string, string]> }) {
  const keys = catalog.keys[sel.event] ?? [];
  const values =
    keys.length > 0 ? await dataQuery<PropValueRow>(propValuesQuery(ctx, sel.event, keys), ctx.appId, live) : null;
  return (
    <ExplorerControls
      appId={ctx.appId}
      qsBase={qsBase}
      catalog={catalog}
      sel={sel}
      values={values?.ok ? valuesByKey(values.rows) : []}
    />
  );
}

async function Explorer({ params, searchParams }: PageProps<"/[appId]/events">) {
  const data = await loadPage({ params, searchParams });
  const { appId, apps, state, live, ctx, maxBytes, sp } = data;
  const [events, keys] = await Promise.all([listEvents(appId), listPropKeys(appId)]);
  const catalog = events.ok ? buildCatalog(events.rows, keys.ok ? keys.rows : []) : null;
  const sel = catalog ? parseExplorer(sp, catalog) : null;
  const pageParams = explorerParams(sel);
  if (needsCanonicalRedirect(sp)) redirect(`/${appId}/events${viewQuery(state, pageParams)}`);
  const p = { ctx, live, maxBytes };
  const rangeQs = viewQuery(state);
  const qsBase = [...new URLSearchParams(rangeQs.slice(1))] as Array<[string, string]>;
  const event = sel && catalog?.events.find((e) => e.name === sel.event);
  return (
    <>
      <Header
        appId={appId}
        apps={apps}
        page="events"
        state={state}
        live={live}
        qs={viewQuery(state, pageParams)}
        hidden={pageParams}
      />
      <Suspense fallback={null}>
        <CredentialsBanner />
      </Suspense>
      <PageBody>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Panel title="Events" description="App events seen in the last 30 days.">
            {catalog ? (
              <EventListPanel
                {...p}
                catalog={catalog}
                selected={sel?.event ?? null}
                hrefBase={`/${appId}/events${rangeQs}`}
              />
            ) : (
              !events.ok && <QueryError result={events} maxBytes={maxBytes} />
            )}
          </Panel>
          <div className="flex min-w-0 flex-col gap-4">
            {sel && catalog ? (
              <>
                <Panel title={sel.event} description={metricLabel(sel.metric)}>
                  <div className="flex flex-col gap-4">
                    {event && !event.withVisitor && !event.withSession && (
                      <p className="text-sm text-muted-foreground">Server event: no visitor or session metrics.</p>
                    )}
                    {/* key: the form fields are uncontrolled, so a new selection must remount them. */}
                    <ControlsPanel
                      key={JSON.stringify(pageParams)}
                      {...p}
                      catalog={catalog}
                      sel={sel}
                      qsBase={qsBase}
                    />
                    <SeriesPanel {...p} sel={sel} />
                  </div>
                </Panel>
                {sel.by && (
                  <Panel title={`By ${sel.by}`} description="Top 20 values in the range, the rest as Other.">
                    <PropBreakdownPanel {...p} sel={{ ...sel, by: sel.by }} />
                  </Panel>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Pick an event on the left.</p>
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}

export default function ExplorerPage(props: PageProps<"/[appId]/events">) {
  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
      <Suspense fallback={<p>Loading…</p>}>
        <Explorer {...props} />
      </Suspense>
    </main>
  );
}
