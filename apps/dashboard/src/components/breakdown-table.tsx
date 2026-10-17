import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarLabel, rowBarWidth } from "@/components/bar-label";
import { Change } from "@/components/change";
import { formatDecimal, formatInt } from "@/lib/format";
import type { BreakdownView } from "@/overview/model";

/** Breakdown rows with pageviews and visitors per day (spec section 6); Other comes last, muted. */
export function BreakdownTable({
  rows,
  valueLabel,
  compare,
  testId,
}: {
  rows: readonly BreakdownView[];
  valueLabel: string;
  compare: boolean;
  testId: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data in this range.</p>;
  const top = rows.find((r) => !r.isOther)?.pageviews ?? 0;
  return (
    <Table
      data-testid={testId}
      className="table-fixed text-xs sm:text-sm [&_td]:px-1.5 [&_th]:px-1.5 sm:[&_td]:px-2 sm:[&_th]:px-2"
    >
      <TableHeader>
        <TableRow>
          <TableHead>{valueLabel}</TableHead>
          <TableHead className="w-16 text-right sm:w-20">Pageviews</TableHead>
          {compare && <TableHead className="w-16 text-right sm:w-20">Change</TableHead>}
          <TableHead className="w-20 text-right sm:w-24">Visitors/day</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.isOther ? "\u0000other" : r.label} className={r.isOther ? "text-muted-foreground" : ""}>
            <TableCell className="relative">
              <BarLabel width={r.isOther ? null : rowBarWidth(r.pageviews, top)} title={r.label}>
                {r.label}
              </BarLabel>
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatInt(r.pageviews)}</TableCell>
            {compare && (
              <TableCell className="text-right tabular-nums">
                <Change pct={r.pageviewsChange ?? null} />
              </TableCell>
            )}
            <TableCell className="text-right tabular-nums">{formatDecimal(r.visitorsPerDay)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
