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
