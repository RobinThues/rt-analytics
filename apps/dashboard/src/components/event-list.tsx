import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatChange, formatInt } from "@/lib/format";
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
  return (
    <Table data-testid="event-list" className="text-xs sm:text-sm">
      <TableHeader>
        <TableRow>
          <TableHead>Event</TableHead>
          <TableHead className="text-right">Count</TableHead>
          {compare && <TableHead className="text-right">Change</TableHead>}
          <TableHead>
            <span className="sr-only">Trend</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.name} data-state={r.name === selected ? "selected" : undefined}>
            <TableCell className="max-w-40 truncate">
              <Link href={hrefFor(r.name)} className={r.name === selected ? "font-semibold" : "underline"}>
                {r.name}
              </Link>
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatInt(r.total)}</TableCell>
            {compare && <TableCell className="text-right tabular-nums">{formatChange(r.change ?? null)}</TableCell>}
            <TableCell>
              <Sparkline points={r.spark} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
