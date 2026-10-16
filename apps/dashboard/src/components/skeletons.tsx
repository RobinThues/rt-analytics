import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";

// Loading shapes for panels. Each takes about the size of what it stands for, so nothing jumps when the
// data arrives (layout spec, "Skeletons instead of Loading…").

export function BlockSkeleton({ className }: { className?: string }) {
  return <Skeleton data-testid="skeleton" className={cn("h-32 w-full", className)} />;
}

export function LineSkeleton({ className }: { className?: string }) {
  return <Skeleton data-testid="skeleton" className={cn("h-5 w-64 max-w-full", className)} />;
}

/** Six KPI tiles in the grid the KPI panel uses, plus the coverage note line. */
export function KpiSkeleton() {
  return (
    <div data-testid="skeleton" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[78px] w-full" />
        ))}
      </div>
      <Skeleton className="h-4 w-72 max-w-full" />
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

export function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div data-testid="skeleton" className="flex flex-col gap-2">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-7 w-full" />
      ))}
    </div>
  );
}
