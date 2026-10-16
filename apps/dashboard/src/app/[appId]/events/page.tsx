import { Suspense, type ReactNode } from "react";
import { dataQuery } from "@/bq/query";
import { PageBar } from "@/components/page-bar";
import { EventList } from "@/components/event-list";
import { ExplorerControls } from "@/components/explorer-controls";
import { KpiTile } from "@/components/kpi-tile";
import { PageBody } from "@/components/page-body";
import { Panel } from "@/components/panel";
import { QueryError } from "@/components/query-error";
import { BlockSkeleton, TableSkeleton } from "@/components/skeletons";
import { TrendChart } from "@/components/trend-chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Catalog } from "@/discovery/catalog";
import { toEventList, metricTotals, toPropBreakdown, valuesByKey } from "@/explorer/model";
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
import type { PageInput, PanelProps } from "../page-data";
import { loadExplorer, type ExplorerData } from "./explorer-data";

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
      // A plain object with only the selected event: the server catalog has no prototype (event names come
      // from the ingest), and such objects cannot cross to a client component.
      catalog={{
        events: catalog.events.filter((e) => e.name === sel.event),
        keys: { [sel.event]: catalog.keys[sel.event] ?? [] },
      }}
      sel={sel}
      values={values?.ok ? valuesByKey(values.rows) : []}
    />
  );
}

/** A data part of the explorer page: the explorer data, inside a Suspense keyed by the app. */
async function ExplorerPart({
  input,
  fallback,
  children,
}: {
  input: PageInput;
  fallback: ReactNode;
  children: (x: ExplorerData, p: PanelProps) => ReactNode;
}) {
  const x = await loadExplorer(input);
  const p = { ctx: x.page.ctx, live: x.page.live, maxBytes: x.page.maxBytes };
  return (
    <Suspense key={x.page.appId} fallback={fallback}>
      {children(x, p)}
    </Suspense>
  );
}

function SelectionColumn({ x, p }: { x: ExplorerData; p: PanelProps }) {
  const { catalog, sel, pageParams } = x;
  if (!sel || !catalog) return <p className="text-sm text-muted-foreground">Pick an event on the left.</p>;
  const qsBase = [...new URLSearchParams(viewQuery(x.page.state).slice(1))] as Array<[string, string]>;
  const event = catalog.events.find((e) => e.name === sel.event);
  return (
    <>
      <Panel title={sel.event} description={metricLabel(sel.metric)}>
        <div className="flex flex-col gap-4">
          {event && !event.withVisitor && !event.withSession && (
            <p className="text-sm text-muted-foreground">Server event: no visitor or session metrics.</p>
          )}
          {/* key: the form fields are uncontrolled, so a new selection must remount them. */}
          <ControlsPanel key={JSON.stringify(pageParams)} {...p} catalog={catalog} sel={sel} qsBase={qsBase} />
          <SeriesPanel {...p} sel={sel} />
        </div>
      </Panel>
      {sel.by && (
        <Panel title={`By ${sel.by}`} description="Top 20 values in the range, the rest as Other.">
          <PropBreakdownPanel {...p} sel={{ ...sel, by: sel.by }} />
        </Panel>
      )}
    </>
  );
}

// A synchronous page: the "Events" frame renders at once; the right column depends on the URL and on
// discovery, so it is one untitled skeleton until the selection is known (layout spec).
export default function ExplorerPage({ params, searchParams }: PageProps<"/[appId]/events">) {
  const input: PageInput = { params, searchParams };
  const list = <TableSkeleton rows={4} />;
  const column = <BlockSkeleton className="h-[460px]" />;
  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
      <PageBar title="Events" page="events" input={input} />
      <PageBody>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Panel title="Events" description="App events seen in the last 30 days." fallback={list}>
            <ExplorerPart input={input} fallback={list}>
              {(x, p) =>
                x.catalog ? (
                  <EventListPanel
                    {...p}
                    catalog={x.catalog}
                    selected={x.sel?.event ?? null}
                    hrefBase={`/${x.page.appId}/events${viewQuery(x.page.state)}`}
                  />
                ) : (
                  !x.events.ok && <QueryError result={x.events} maxBytes={p.maxBytes} />
                )
              }
            </ExplorerPart>
          </Panel>
          <div className="flex min-w-0 flex-col gap-4">
            <Suspense fallback={column}>
              <ExplorerPart input={input} fallback={column}>
                {(x, p) => <SelectionColumn x={x} p={p} />}
              </ExplorerPart>
            </Suspense>
          </div>
        </div>
      </PageBody>
    </main>
  );
}
