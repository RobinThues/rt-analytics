import { PendingLink } from "@/components/pending-link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarLabel, rowBarWidth } from "@/components/bar-label";
import { Change } from "@/components/change";
import { formatInt } from "@/lib/format";
import { Sparkline, type SparkPoint } from "./sparkline";

/** Every discovered event with its count in the range, the change and a small trend line. */
export function EventList({
  rows,
  hrefFor,
  selected,
  compare,
}: {
  rows: ReadonlyArray<{ name: string; total: number; change: number | null | undefined; spark: SparkPoint[] }>;
  hrefFor: (event: string) => string;
  selected: string | null;
  compare: boolean;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No app events in the last 30 days.</p>;
  const top = rows[0]?.total ?? 0;
  return (
    <Table data-testid="event-list" className="table-fixed text-xs sm:text-sm">
      <TableHeader>
        <TableRow>
          <TableHead>Event</TableHead>
          <TableHead className="w-16 text-right sm:w-20">Count</TableHead>
          {compare && <TableHead className="w-16 text-right sm:w-20">Change</TableHead>}
          <TableHead className="w-24">
            <span className="sr-only">Trend</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.name} data-state={r.name === selected ? "selected" : undefined}>
            <TableCell className="relative">
              <BarLabel width={rowBarWidth(r.total, top)} title={r.name}>
                <PendingLink href={hrefFor(r.name)} className={r.name === selected ? "font-semibold" : "underline"}>
                  {r.name}
                </PendingLink>
              </BarLabel>
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatInt(r.total)}</TableCell>
            {compare && (
              <TableCell className="text-right tabular-nums">
                <Change pct={r.change ?? null} />
              </TableCell>
            )}
            <TableCell>
              <Sparkline points={r.spark} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
