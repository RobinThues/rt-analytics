/** Thin moving bar at the top of the content area, shown while a same-page change is pending. */
export function ProgressLine() {
  return (
    <div
      data-testid="progress-line"
      aria-hidden
      className="pointer-events-none sticky top-0 z-20 hidden h-0.5 w-full overflow-hidden group-has-data-pending/content:block"
    >
      <div className="h-full w-1/3 animate-[progress_1.2s_ease-in-out_infinite] bg-chart-current" />
    </div>
  );
}
