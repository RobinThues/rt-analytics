const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** Decimal byte units, as BigQuery bills them: 1_000_000_000 -> "1 GB". */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${Number(value.toFixed(1))} ${UNITS[unit]}`;
}

const intFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compactFormat = new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 2 });

/** 1234.4 -> "1,234" */
export const formatInt = (n: number) => intFormat.format(n);

/** 10 -> "10.0" (per-day averages) */
export const formatDecimal = (n: number) => decimalFormat.format(n);

/** 0.14 -> "14 %" */
export const formatShare = (share: number) => `${intFormat.format(share * 100)} %`;

/** Change as a direction and the rounded percent; null means there is nothing to compare with ("new"). */
export function changeParts(pct: number | null): { dir: "up" | "down" | "none"; text: string } {
  if (pct === null) return { dir: "none", text: "new" };
  const rounded = Math.round(pct);
  const abs = Math.abs(rounded);
  // From 1,000 % on the short form ("1.2K %"), so the text fits the fixed Change column.
  // No-break space, so "12 %" never wraps between number and sign.
  const text = `${(abs >= 1000 ? compactFormat : intFormat).format(abs)} %`;
  if (rounded === 0) return { dir: "none", text };
  return { dir: rounded > 0 ? "up" : "down", text };
}

// en-GB short month names, fixed: server and browser ICU data can differ ("Sep" vs "Sept"), and a
// difference would break hydration of client components that format days.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

/** "5 Oct" for a calendar day (YYYY-MM-DD). Pure string work, so no timezone can shift it. */
export const formatShortDay = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
