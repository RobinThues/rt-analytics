import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatChange, formatDecimal, formatInt } from "@/lib/format";
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
  return (
    <Table data-testid={testId}>
      <TableHeader>
        <TableRow>
          <TableHead>{valueLabel}</TableHead>
          <TableHead className="text-right">Pageviews</TableHead>
          {compare && <TableHead className="text-right">Change</TableHead>}
          <TableHead className="text-right">Visitors / day</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.isOther ? "\u0000other" : r.label} className={r.isOther ? "text-muted-foreground" : ""}>
            <TableCell className="max-w-48 truncate" title={r.label}>
              {r.label}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatInt(r.pageviews)}</TableCell>
            {compare && (
              <TableCell className="text-right tabular-nums">{formatChange(r.pageviewsChange ?? null)}</TableCell>
            )}
            <TableCell className="text-right tabular-nums">{formatDecimal(r.visitorsPerDay)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
