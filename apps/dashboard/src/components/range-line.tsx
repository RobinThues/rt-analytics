import type { DateRange } from "@/time/range";

/** The exact range, its timezone and the compared range, under the page top bar. */
export function RangeLine({ range, timezone, prev }: { range: DateRange; timezone: string; prev: DateRange | null }) {
  return (
    <p className="text-sm text-muted-foreground" data-testid="range-line">
      {range.from} to {range.to} ({timezone}){prev && `, compared with ${prev.from} to ${prev.to}`}
    </p>
  );
}
