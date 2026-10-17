import { SUMMARY_COLS } from "@/components/kpi-grid";
import { ChartSkeleton, KpiSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Neutral page skeleton while the first page of a session loads, in the overview's frame (layout spec). */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-5">
      <Skeleton className="mb-3 h-8 w-full" />
      <div className="grid gap-3">
        <KpiSkeleton cols={SUMMARY_COLS} count={6} coverage />
        <ChartSkeleton count={3} titles legend />
      </div>
    </main>
  );
}
