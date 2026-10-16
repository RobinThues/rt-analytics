import { BlockSkeleton } from "@/components/skeletons";

/** Neutral page skeleton while the first page of a session loads (no "Loading…" text, layout spec). */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
      <BlockSkeleton className="mb-6 h-24" />
      <div className="grid gap-4 lg:grid-cols-2">
        <BlockSkeleton className="h-48" />
        <BlockSkeleton className="h-48" />
      </div>
    </main>
  );
}
