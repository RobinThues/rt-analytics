import Link from "next/link";
import { dataQuery } from "@/bq/query";
import { KpiRow } from "@/components/kpi-row";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInt, formatShare } from "@/lib/format";
import { goalLines, goalQuery, goalTotals, type GoalDim, type GoalLine, type GoalRow } from "@/queries/goals";
import { change } from "@/queries/series";
import type { PanelProps } from "../page-data";

const TABLES: ReadonlyArray<{ dim: Exclude<GoalDim, "total">; title: string }> = [
  { dim: "source", title: "Source" },
  { dim: "entry_page", title: "Entry page" },
  { dim: "device", title: "Device" },
];

function GoalTable({
  title,
  testId,
  lines,
  compare,
}: {
  title: string;
  testId: string;
  lines: readonly GoalLine[];
  compare: boolean;
}) {
  return (
    <Table data-testid={testId} className="table-fixed text-xs sm:text-sm">
      <TableHeader>
        <TableRow>
          <TableHead>{title}</TableHead>
          <TableHead className="w-16 text-right">Sessions</TableHead>
          <TableHead className="w-12 text-right">Goal</TableHead>
          <TableHead className="w-12 text-right">Rate</TableHead>
          {compare && <TableHead className="w-12 text-right">Prev</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((l) => (
          <TableRow key={l.isOther ? "\u0000other" : l.label} className={l.isOther ? "text-muted-foreground" : ""}>
            <TableCell className="truncate" title={l.label}>
              {l.label}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatInt(l.sessions)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatInt(l.conversions)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatShare(l.rate)}</TableCell>
            {compare && (
              <TableCell className="text-right tabular-nums">
                {l.prevRate === null ? "–" : formatShare(l.prevRate)}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export async function GoalPanel({ ctx, live, maxBytes }: PanelProps) {
  const goal = ctx.goal;
  if (!goal) {
    return (
      <p className="text-sm text-muted-foreground">
        No goal set.{" "}
        <Link className="text-primary underline underline-offset-2" href={`/${ctx.appId}/settings`}>
          Pick one in Settings
        </Link>{" "}
        to see which source converts.
      </p>
    );
  }
  const res = await dataQuery<GoalRow>(goalQuery(ctx, goal), ctx.appId, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  const t = goalTotals(res.rows);
  if (t.sessions === 0) return <p className="text-sm text-muted-foreground">No sessions in this range.</p>;
  return (
    <div className="flex flex-col gap-4">
      <KpiRow
        cols={{ base: 2, sm: 3 }}
        cells={[
          {
            label: "Sessions",
            value: formatInt(t.sessions),
            change: ctx.compare ? change(t.sessions, t.prevSessions) : undefined,
            testId: "goal-sessions",
          },
          {
            label: goal.label,
            value: formatInt(t.conversions),
            change: ctx.compare ? change(t.conversions, t.prevConversions) : undefined,
            testId: "goal-conversions",
          },
          {
            label: "Conversion rate",
            value: formatShare(t.rate),
            change: ctx.compare ? change(t.rate, t.prevRate) : undefined,
            testId: "goal-rate",
          },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        {TABLES.map((table) => (
          <div key={table.dim} className="min-w-0">
            <GoalTable
              title={table.title}
              testId={`goal-${table.dim}`}
              lines={goalLines(res.rows, table.dim)}
              compare={ctx.compare}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
