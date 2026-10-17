import { Change } from "@/components/change";

/** A stat tile: label, value and (when compare is on) the change against the previous period. */
export function KpiTile({
  label,
  value,
  change,
  testId,
}: {
  label: string;
  value: string;
  /** undefined: compare is off. null: nothing to compare with. */
  change: number | null | undefined;
  testId: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums" data-testid={testId}>
        {value}
      </p>
      {change !== undefined && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            <Change pct={change} />
          </span>{" "}
          vs previous period
        </p>
      )}
    </div>
  );
}
