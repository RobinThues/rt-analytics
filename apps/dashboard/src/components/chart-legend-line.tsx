/**
 * One legend line above the charts of a place (visual style spec, "Charts"). Always one line high, with or
 * without compare, so the static skeleton above the data can match it.
 */
export function ChartLegendLine({ compare }: { compare: boolean }) {
  return (
    <div className="flex h-5 items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <svg width="18" height="6" aria-hidden="true">
          <line x1="0" y1="3" x2="18" y2="3" stroke="var(--chart-current)" strokeWidth="2" />
        </svg>
        This period
      </span>
      {compare && (
        <span className="flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden="true">
            <line x1="0" y1="3" x2="18" y2="3" stroke="var(--chart-previous)" strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          Previous period
        </span>
      )}
    </div>
  );
}
