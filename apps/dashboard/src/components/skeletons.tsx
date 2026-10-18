import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";
import { kpiCellClass, kpiGridClass, type KpiCols } from "./kpi-grid";

// Loading shapes for panels. Each takes about the size of what it stands for, so nothing jumps when the
// data arrives (layout spec, "Skeletons instead of Loading…").

export function BlockSkeleton({ className }: { className?: string }) {
  return <Skeleton data-testid="skeleton" className={cn("h-32 w-full", className)} />;
}

export function LineSkeleton({ className }: { className?: string }) {
  return <Skeleton data-testid="skeleton" className={cn("h-5 w-64 max-w-full", className)} />;
}

/** `count` KPI cells in the grid and with the lines `KpiRow` uses, plus the coverage note when asked. */
export function KpiSkeleton({ cols, count, coverage }: { cols: KpiCols; count: number; coverage: boolean }) {
  return (
    <div data-testid="skeleton" className="flex flex-col gap-3">
      <div className={`grid ${kpiGridClass(cols)}`}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className={`flex min-w-0 flex-col ${kpiCellClass(i, count, cols)}`}>
            <Skeleton className="h-4 w-24 max-w-full" />
            <Skeleton className="h-7.5 w-16 max-w-full" />
            <Skeleton className="h-4 w-32 max-w-full" />
          </div>
        ))}
      </div>
      {coverage && <Skeleton className="h-10 w-full sm:h-5 sm:w-72" />}
    </div>
  );
}

/**
 * One chart, or `count` charts in the overview's three-column chart grid; `legend` adds the legend line
 * above and `titles` a title line above each chart, at the same sizes as the loaded charts.
 */
export function ChartSkeleton({
  height = 160,
  count = 1,
  titles = false,
  legend = false,
}: {
  height?: number;
  count?: number;
  titles?: boolean;
  legend?: boolean;
}) {
  const chart = (key: number) => (
    <div key={key} className="min-w-0">
      {titles && <Skeleton className="mb-2 h-5 w-20" />}
      <Skeleton className="w-full" style={{ height }} />
    </div>
  );
  return (
    <div data-testid="skeleton" className="flex flex-col gap-2">
      {legend && <Skeleton className="h-5 w-48" />}
      {count === 1 ? (
        chart(0)
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">{Array.from({ length: count }, (_, i) => chart(i))}</div>
      )}
    </div>
  );
}

/**
 * A header and `rows` rows at the heights of a text-xs sm:text-sm table (32 px header; rows 27 px on phones,
 * 31 px from sm on, border included). `sparklines`: rows with a 24 px sparkline, 35 px everywhere.
 */
export function TableSkeleton({ rows, sparklines = false }: { rows: number; sparklines?: boolean }) {
  return (
    <div data-testid="skeleton" className="flex flex-col">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={sparklines ? "h-[35px] py-[5px]" : "h-[27px] py-[5px] sm:h-[31px]"}>
          <Skeleton className={sparklines ? "h-6 w-full" : "h-4 w-full sm:h-5"} />
        </div>
      ))}
    </div>
  );
}
