import { cn } from "cn";

/** The rt-analytics mark: three rising bars in the brand violet (visual style spec, "Mark"). */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn("size-[1.1em] shrink-0", className)}>
      <rect x="1" y="9" width="3.6" height="6" rx="0.8" fill="var(--primary)" />
      <rect x="6.2" y="5" width="3.6" height="10" rx="0.8" fill="var(--primary)" />
      <rect x="11.4" y="1" width="3.6" height="14" rx="0.8" fill="var(--primary)" />
    </svg>
  );
}

/** The mark plus "rt-analytics" in the text color; size follows the font size. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <Mark />
      rt-analytics
    </span>
  );
}
