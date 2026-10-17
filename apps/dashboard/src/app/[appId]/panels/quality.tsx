import { KpiRow } from "@/components/kpi-row";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dataQuery } from "@/bq/query";
import { formatInt, formatShare } from "@/lib/format";
import { toConsentShares, toVitals, type VitalName } from "@/overview/model";
import {
  consentQuery,
  slowPagesQuery,
  topErrorsQuery,
  webVitalsQuery,
  type ConsentRow,
  type ErrorRow,
  type SlowPageRow,
  type VitalRow,
} from "@/queries/overview";
import type { PanelProps } from "../page-data";

const VITALS = [
  { metric: "LCP", label: "LCP (p75)", format: (n: number) => `${formatInt(n)} ms` },
  { metric: "INP", label: "INP (p75)", format: (n: number) => `${formatInt(n)} ms` },
  { metric: "CLS", label: "CLS (p75)", format: (n: number) => n.toFixed(2) },
] as const satisfies ReadonlyArray<{ metric: VitalName; label: string; format: (n: number) => string }>;

export async function WebVitalsPanel({ ctx, live, maxBytes }: PanelProps) {
  const res = await dataQuery<VitalRow>(webVitalsQuery(ctx), ctx.appId, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  const vitals = toVitals(res.rows, ctx.compare);
  return (
    <KpiRow
      cols={{ base: 3 }}
      cells={VITALS.map((v) => {
        const { value, change } = vitals[v.metric];
        return {
          label: v.label,
          value: value === null ? "–" : v.format(value),
          change,
          testId: `vital-${v.metric.toLowerCase()}`,
        };
      })}
    />
  );
}

export async function SlowPagesPanel({ ctx, live, maxBytes }: PanelProps) {
  const res = await dataQuery<SlowPageRow>(slowPagesQuery(ctx), ctx.appId, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  if (res.rows.length === 0)
    return <p className="text-sm text-muted-foreground">Not enough LCP samples (5 per page).</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Page</TableHead>
          <TableHead className="text-right">LCP p75</TableHead>
          <TableHead className="text-right">Samples</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {res.rows.map((r) => (
          <TableRow key={r.page_path}>
            <TableCell className="max-w-48 truncate" title={r.page_path}>
              {r.page_path}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatInt(r.p75)} ms</TableCell>
            <TableCell className="text-right tabular-nums">{formatInt(r.samples)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export async function TopErrorsPanel({ ctx, live, maxBytes }: PanelProps) {
  const res = await dataQuery<ErrorRow>(topErrorsQuery(ctx), ctx.appId, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  if (res.rows.length === 0) return <p className="text-sm text-muted-foreground">No errors in this range.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Message</TableHead>
          <TableHead className="text-right">Count</TableHead>
          <TableHead className="text-right">Last seen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {res.rows.map((r) => (
          <TableRow key={r.message}>
            <TableCell className="max-w-64 truncate" title={r.message}>
              {r.message}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatInt(r.occurrences)}</TableCell>
            <TableCell className="text-right tabular-nums whitespace-nowrap">{r.last_seen}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export async function ConsentPanel({ ctx, live, maxBytes }: PanelProps) {
  const res = await dataQuery<ConsentRow>(consentQuery(ctx), ctx.appId, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  const shares = toConsentShares(res.rows);
  if (shares.length === 0) return <p className="text-sm text-muted-foreground">No data in this range.</p>;
  return (
    <Table data-testid="consent-split" className="text-xs sm:text-sm">
      <TableHeader>
        <TableRow>
          <TableHead>Consent</TableHead>
          <TableHead className="text-right">Pageviews</TableHead>
          {ctx.compare && <TableHead className="text-right">Previous</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {shares.map((s) => (
          <TableRow key={s.state}>
            <TableCell>{s.state}</TableCell>
            <TableCell className="text-right tabular-nums">{formatShare(s.share)}</TableCell>
            {ctx.compare && (
              <TableCell className="text-right tabular-nums">
                {s.prevShare === null ? "–" : formatShare(s.prevShare)}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
