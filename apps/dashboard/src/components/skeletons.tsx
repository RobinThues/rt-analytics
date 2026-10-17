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

/** One chart, or `count` charts in the overview's three-column chart grid. */
export function ChartSkeleton({ height = 220, count = 1 }: { height?: number; count?: number }) {
  if (count === 1) return <Skeleton data-testid="skeleton" className="w-full" style={{ height }} />;
  return (
    <div data-testid="skeleton" className="grid gap-6 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="w-full" style={{ height }} />
      ))}
    </div>
  );
}

/** A header and `rows` rows at the table's own heights (32 px header, 30 px rows). */
export function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div data-testid="skeleton" className="flex flex-col">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-[30px] py-[5px]">
          <Skeleton className="h-5 w-full" />
        </div>
      ))}
    </div>
  );
}
