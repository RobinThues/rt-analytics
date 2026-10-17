import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInt } from "@/lib/format";
import type { ErrorRow, SlowPageRow } from "@/queries/overview";

// Fixed layout with fixed number columns (visual style spec, "Tables"): the label column takes the rest
// and truncates, so the numbers stay readable at 390 px instead of being pushed out of the panel.

export function SlowPagesTable({ rows }: { rows: readonly SlowPageRow[] }) {
  return (
    <Table className="table-fixed text-xs sm:text-sm">
      <TableHeader>
        <TableRow>
          <TableHead>Page</TableHead>
          <TableHead className="w-20 text-right">LCP p75</TableHead>
          <TableHead className="w-16 text-right">Samples</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.page_path}>
            <TableCell className="truncate" title={r.page_path}>
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

export function TopErrorsTable({ rows }: { rows: readonly ErrorRow[] }) {
  return (
    <Table className="table-fixed text-xs sm:text-sm">
      <TableHeader>
        <TableRow>
          <TableHead>Message</TableHead>
          <TableHead className="w-14 text-right">Count</TableHead>
          <TableHead className="w-32 text-right">Last seen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.message}>
            <TableCell className="truncate" title={r.message}>
              {r.message}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatInt(r.occurrences)}</TableCell>
            <TableCell className="text-right tabular-nums">{r.last_seen}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
