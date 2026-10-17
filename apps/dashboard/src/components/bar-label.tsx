import type { ReactNode } from "react";

/** A row's value as a share of the top row's, for the light bar behind its label; null: no bar. */
export function rowBarWidth(value: number, top: number): string | null {
  if (top <= 0) return null;
  return `${Math.max(0, Math.min(100, (value / top) * 100)).toFixed(1)}%`;
}

/**
 * Label cell content of a breakdown-style table: a light bar in the data blue behind a truncated label
 * (visual style spec, "Tables"). The label cell must be `relative`, so the bar is inset 3 px from the
 * whole row, not only from the text line.
 */
export function BarLabel({ width, title, children }: { width: string | null; title?: string; children: ReactNode }) {
  return (
    <>
      {width !== null && (
        <span
          aria-hidden="true"
          data-testid="row-bar"
          className="absolute inset-y-[3px] left-0 rounded-sm bg-chart-bar"
          style={{ width }}
        />
      )}
      <span className="relative block truncate pl-1.5" title={title}>
        {children}
      </span>
    </>
  );
}
