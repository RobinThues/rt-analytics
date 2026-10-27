"use client";
import { useOptimistic } from "react";
import { Button } from "@/components/ui/button";
import { usePendingNavigation } from "@/lib/navigation";
import { MAX_HOURLY_DAYS, type Interval } from "@/view/interval";
import { withView } from "@/view/range-ui";

const OPTIONS: ReadonlyArray<[Interval, string]> = [
  ["day", "Daily"],
  ["hour", "Hourly"],
];

const selectedClass =
  "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent dark:bg-sidebar-accent dark:hover:bg-sidebar-accent";

/**
 * Daily or hourly points in the over-time charts (spec 2026-10-27-hourly-charts); applies at once like
 * Compare. Hourly stays visible for long ranges but is unavailable (aria-disabled, so its title still shows).
 */
export function IntervalToggle({ interval, hourlyAllowed }: { interval: Interval; hourlyAllowed: boolean }) {
  const [current, setCurrent] = useOptimistic(interval);
  const { pending, navigate } = usePendingNavigation();
  function pick(next: Interval) {
    if (next === current || (next === "hour" && !hourlyAllowed)) return;
    // The optimistic value is set inside the navigation's transition, so it holds until the page arrives.
    navigate(window.location.pathname + withView(window.location.search, { interval: next }), () => setCurrent(next));
  }
  return (
    <div role="group" aria-label="Chart interval" className="flex" data-pending={pending ? "" : undefined}>
      {OPTIONS.map(([value, label], i) => {
        const unavailable = value === "hour" && !hourlyAllowed;
        return (
          <Button
            key={value}
            variant="outline"
            aria-pressed={current === value}
            aria-disabled={unavailable || undefined}
            title={unavailable ? `Hourly charts work for ranges up to ${MAX_HOURLY_DAYS} days.` : undefined}
            className={[
              i === 0 ? "rounded-r-none" : "-ml-px rounded-l-none",
              current === value ? selectedClass : "",
              unavailable ? "cursor-not-allowed opacity-50 hover:bg-background dark:hover:bg-input/30" : "",
            ].join(" ")}
            onClick={() => pick(value)}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}
