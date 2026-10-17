import { Change } from "@/components/change";
import { kpiCellClass, kpiGridClass, type KpiCols } from "./kpi-grid";

export type KpiCellData = {
  label: string;
  value: string;
  /** undefined: compare is off. null: nothing to compare with. */
  change: number | null | undefined;
  testId: string;
};

/**
 * KPI numbers as plain cells split by thin lines, no box per number (visual style spec, "KPI row"). Every
 * cell is exactly three lines at any width; with compare off the third line stays empty, because the
 * static skeleton cannot know about compare.
 */
export function KpiRow({ cols, cells }: { cols: KpiCols; cells: readonly KpiCellData[] }) {
  return (
    <div className={`grid ${kpiGridClass(cols)}`}>
      {cells.map((c, i) => (
        <div key={c.testId} className={`flex min-w-0 flex-col ${kpiCellClass(i, cells.length, cols)}`}>
          <p className="truncate text-xs whitespace-nowrap text-muted-foreground" title={c.label}>
            {c.label}
          </p>
          <p
            className="truncate text-2xl leading-tight font-semibold tracking-tight whitespace-nowrap tabular-nums"
            data-testid={c.testId}
            title={c.value}
          >
            {c.value}
          </p>
          {c.change === undefined ? (
            <p aria-hidden="true" className="h-4 truncate whitespace-nowrap" />
          ) : (
            <p className="h-4 truncate text-xs leading-4 whitespace-nowrap text-muted-foreground">
              <span className="font-medium text-foreground">
                <Change pct={c.change} />
              </span>{" "}
              vs previous period
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
