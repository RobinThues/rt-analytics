"use client";
import { useOptimistic } from "react";
import { Button } from "@/components/ui/button";
import { usePendingNavigation } from "@/lib/navigation";
import type { ChartScale } from "@/view/chart-scale";
import { withView } from "@/view/range-ui";

const OPTIONS: ReadonlyArray<[ChartScale, string]> = [
  ["linear", "Linear"],
  ["log", "Log"],
];

const selectedClass =
  "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent dark:bg-sidebar-accent dark:hover:bg-sidebar-accent";

/**
 * Linear or log y-axis in all over-time charts of the page (spec 2026-10-31-launch-package, part 4); applies at
 * once like Compare, and a shared link keeps it.
 */
export function ScaleToggle({ scale }: { scale: ChartScale }) {
  const [current, setCurrent] = useOptimistic(scale);
  const { pending, navigate } = usePendingNavigation();
  function pick(next: ChartScale) {
    if (next === current) return;
    // The optimistic value is set inside the navigation's transition, so it holds until the page arrives.
    navigate(window.location.pathname + withView(window.location.search, { scale: next }), () => setCurrent(next));
  }
  return (
    <div role="group" aria-label="Chart scale" className="flex" data-pending={pending ? "" : undefined}>
      {OPTIONS.map(([value, label], i) => (
        <Button
          key={value}
          variant="outline"
          aria-pressed={current === value}
          className={[
            i === 0 ? "rounded-r-none" : "-ml-px rounded-l-none",
            current === value ? selectedClass : "",
          ].join(" ")}
          onClick={() => pick(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
