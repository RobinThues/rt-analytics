"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePendingNavigation } from "@/lib/navigation";
import type { DateRange } from "@/time/range";
import {
  dateToDay,
  dayToDate,
  presetRange,
  RANGE_PRESETS,
  rangeError,
  selectedPreset,
  withView,
} from "@/view/range-ui";

/** Two months side by side from 640 px, one below (layout spec, "Range picker"). */
function useMonths(): 1 | 2 {
  const [months, setMonths] = useState<1 | 2>(1);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setMonths(mq.matches ? 2 : 1);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return months;
}

/**
 * One control for the date range: presets apply at once; in the calendar the first click sets the start
 * and the second click sets the end and applies. No intermediate range ever reaches the URL. `label` is
 * computed on the server so server and browser render the same text.
 */
export function RangePicker({ range, today, label }: { range: DateRange; today: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { pending, navigate } = usePendingNavigation();
  const months = useMonths();

  function apply(next: DateRange) {
    const problem = rangeError(next, today);
    if (problem) {
      setError(problem);
      setStart(null);
      return;
    }
    setOpen(false);
    navigate(window.location.pathname + withView(window.location.search, { range: next }));
  }

  function onDayClick(date: Date) {
    const day = dateToDay(date);
    if (start === null) {
      setStart(day);
      setError(null);
      return;
    }
    setStart(null);
    apply(day < start ? { from: day, to: start } : { from: start, to: day });
  }

  const selected = selectedPreset(range, today);
  const endMonth = dayToDate(range.to);
  const defaultMonth = months === 2 ? new Date(endMonth.getFullYear(), endMonth.getMonth() - 1, 1) : endMonth;

  return (
    <div data-pending={pending ? "" : undefined}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setStart(null);
          setError(null);
        }}
      >
        <PopoverTrigger render={<Button variant="outline" aria-label="Date range" />}>{label}</PopoverTrigger>
        <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)]">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-wrap gap-1 sm:flex-col">
              {RANGE_PRESETS.map((days) => (
                <Button
                  key={days}
                  variant="ghost"
                  size="sm"
                  aria-pressed={selected === days}
                  className={
                    selected === days
                      ? "justify-start bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent dark:hover:bg-sidebar-accent"
                      : "justify-start"
                  }
                  onClick={() => apply(presetRange(days, today))}
                >
                  Last {days} days
                </Button>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <Calendar
                mode="range"
                numberOfMonths={months}
                showOutsideDays={false}
                defaultMonth={defaultMonth}
                // Controlled: without onSelect react-day-picker takes `selected` only as the initial value.
                selected={
                  start
                    ? { from: dayToDate(start), to: undefined }
                    : { from: dayToDate(range.from), to: dayToDate(range.to) }
                }
                onSelect={() => {}}
                onDayClick={onDayClick}
                disabled={{ after: dayToDate(today) }}
                weekStartsOn={1}
              />
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {error ?? (start ? "Pick the last day." : "Pick the first day, then the last day.")}
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
