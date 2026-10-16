import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FunnelStep, FunnelStepView } from "@/funnels/steps";
import { formatInt, formatShare } from "@/lib/format";

const share = (v: number | null) => (v === null ? "–" : formatShare(v));
const stepLabel = (s: FunnelStep) => (s.filter ? `${s.event} (${s.filter.key} = ${s.filter.value})` : s.event);

/** Sessions per step with conversion from the first and from the previous step. */
export function FunnelResult({
  steps,
  view,
  compare,
}: {
  steps: readonly FunnelStep[];
  view: readonly FunnelStepView[];
  compare: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <Table className="text-xs sm:text-sm">
        <TableHeader>
          <TableRow>
            <TableHead>Step</TableHead>
            <TableHead className="text-right">Sessions</TableHead>
            <TableHead className="text-right">From first</TableHead>
            <TableHead className="text-right">From previous</TableHead>
            {compare && <TableHead className="text-right">Previous period</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.map((v, i) => {
            const step = steps[i];
            return (
              <TableRow key={v.step} data-testid={`funnel-step-${v.step}`}>
                <TableCell className="min-w-40">
                  <p className="max-w-64 truncate" title={step ? stepLabel(step) : ""}>
                    {v.step}. {step ? stepLabel(step) : ""}
                  </p>
                  <div className="mt-1 h-1.5 w-full max-w-64 rounded-full bg-muted" aria-hidden>
                    <div
                      className="h-1.5 rounded-full bg-chart-current"
                      style={{ width: `${Math.round((v.fromFirst ?? 0) * 100)}%` }}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums" data-testid={`funnel-sessions-${v.step}`}>
                  {formatInt(v.cur)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{share(v.fromFirst)}</TableCell>
                <TableCell className="text-right tabular-nums">{share(v.fromPrev)}</TableCell>
                {compare && (
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatInt(v.prev ?? 0)} ({share(v.prevFromFirst)})
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
