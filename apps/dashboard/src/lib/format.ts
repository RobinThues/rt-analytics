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

/** 1234.4 -> "1,234" */
export const formatInt = (n: number) => intFormat.format(n);

/** 10 -> "10.0" (per-day averages) */
export const formatDecimal = (n: number) => decimalFormat.format(n);

/** 0.14 -> "14 %" */
export const formatShare = (share: number) => `${intFormat.format(share * 100)} %`;

/** Change in percent with a sign; null means there is nothing to compare with. */
export function formatChange(pct: number | null): string {
  if (pct === null) return "new";
  const rounded = Math.round(pct);
  if (rounded === 0) return "0 %";
  return `${rounded > 0 ? "+" : "−"}${intFormat.format(Math.abs(rounded))} %`;
}

/** "5 Oct" for a calendar day (YYYY-MM-DD); read as UTC so the server's timezone cannot shift it. */
export const formatShortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
