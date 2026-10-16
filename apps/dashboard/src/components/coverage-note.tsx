import { formatShare } from "@/lib/format";

/** Persistent-only numbers say how much of the traffic they are based on (spec section 6, "Coverage"). */
export function CoverageNote({ coverage, sessions }: { coverage: number; sessions?: number }) {
  if (sessions === 0) return <p className="text-sm text-muted-foreground">No sessions in this range.</p>;
  if (coverage <= 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No visitor in this range has a persistent ID (all cookieless), so returning visitors and retention cannot be
        shown.
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      Based on {formatShare(coverage)} of sessions (visitors who accepted cookies).
    </p>
  );
}
