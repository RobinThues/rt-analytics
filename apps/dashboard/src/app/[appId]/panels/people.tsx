import { CoverageNote } from "@/components/coverage-note";
import { KpiTile } from "@/components/kpi-tile";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dataQuery } from "@/bq/query";
import { formatInt, formatShare } from "@/lib/format";
import { toKpis, toRetention } from "@/overview/model";
import { retentionQuery, type RetentionRow } from "@/queries/overview";
import type { PanelProps } from "../page-data";
import { loadKpis } from "./shared";

/** Returning visitors and retention: persistent ids only, with coverage (spec section 6). */
export async function PeoplePanel({ ctx, live, maxBytes }: PanelProps) {
  const kpis = await loadKpis(ctx, live);
  if (!kpis.ok) return <QueryError result={kpis} maxBytes={maxBytes} />;
  const k = toKpis(kpis.rows, ctx.days, ctx.compare);
  if (k.coverage.value <= 0) return <CoverageNote coverage={0} />;
  const res = await dataQuery<RetentionRow>(retentionQuery(ctx), ctx.appId, live);
  const cohorts = res.ok ? toRetention(res.rows) : [];
  const weeks = Math.max(0, ...cohorts.map((c) => c.shares.length));
  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-48">
        <KpiTile
          label="Returning people"
          value={formatInt(k.returningPeople.value)}
          change={k.returningPeople.change}
          testId="kpi-returning"
        />
      </div>
      <CoverageNote coverage={k.coverage.value} />
      <p className="text-sm text-muted-foreground">
        Returning: active on two or more days. Retention: people new in the range (not seen in the 28 days before), by
        the week of their first visit, share active in each later week.
      </p>
      {!res.ok ? (
        <QueryError result={res} maxBytes={maxBytes} />
      ) : cohorts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No new persistent people in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table data-testid="retention">
            <TableHeader>
              <TableRow>
                <TableHead>Week of</TableHead>
                <TableHead className="text-right">People</TableHead>
                {Array.from({ length: weeks }, (_, i) => (
                  <TableHead key={i} className="text-right">
                    Week {i}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cohorts.map((c) => (
                <TableRow key={c.cohort}>
                  <TableCell className="whitespace-nowrap">{c.cohort}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatInt(c.size)}</TableCell>
                  {Array.from({ length: weeks }, (_, i) => (
                    <TableCell key={i} className="text-right tabular-nums">
                      {i < c.shares.length ? formatShare(c.shares[i] ?? 0) : ""}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
