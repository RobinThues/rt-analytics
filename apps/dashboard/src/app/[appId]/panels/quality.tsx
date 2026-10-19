import { KpiRow } from "@/components/kpi-row";
import { SlowPagesTable, TopErrorsTable } from "@/components/quality-tables";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInt, formatShare } from "@/lib/format";
import { toConsentShares, toVitals, type VitalName } from "@/overview/model";
import { splitQuality } from "@/queries/overview";
import type { PanelProps } from "../page-data";
import { loadQuality } from "./shared";

const VITALS = [
  { metric: "LCP", label: "LCP (p75)", format: (n: number) => `${formatInt(n)} ms` },
  { metric: "INP", label: "INP (p75)", format: (n: number) => `${formatInt(n)} ms` },
  { metric: "CLS", label: "CLS (p75)", format: (n: number) => n.toFixed(2) },
] as const satisfies ReadonlyArray<{ metric: VitalName; label: string; format: (n: number) => string }>;

export async function WebVitalsPanel({ ctx, live, maxBytes }: PanelProps) {
  const res = await loadQuality(ctx, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  const vitals = toVitals(splitQuality(res.rows).vitals, ctx.compare);
  return (
    <KpiRow
      cols={{ base: 2, sm: 3 }}
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
  const res = await loadQuality(ctx, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  const rows = splitQuality(res.rows).slowPages;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Not enough LCP samples (5 per page).</p>;
  return <SlowPagesTable rows={rows} />;
}

export async function TopErrorsPanel({ ctx, live, maxBytes }: PanelProps) {
  const res = await loadQuality(ctx, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  const rows = splitQuality(res.rows).errors;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No errors in this range.</p>;
  return <TopErrorsTable rows={rows} />;
}

export async function ConsentPanel({ ctx, live, maxBytes }: PanelProps) {
  const res = await loadQuality(ctx, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  const shares = toConsentShares(splitQuality(res.rows).consent);
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
