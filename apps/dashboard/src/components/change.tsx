import { changeParts } from "@/lib/format";

/**
 * A change against the previous period: a neutral arrow (text color, never green or red) and the rounded
 * percent (visual style spec, "KPI row"). The arrow is an SVG, so it does not depend on the font.
 */
export function Change({ pct }: { pct: number | null }) {
  const { dir, text } = changeParts(pct);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums">
      {dir !== "none" && (
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" className={dir === "down" ? "rotate-180" : ""}>
          <path d="M4 1 7.5 7h-7z" fill="currentColor" />
        </svg>
      )}
      {dir !== "none" && <span className="sr-only">{dir} </span>}
      {text}
    </span>
  );
}
