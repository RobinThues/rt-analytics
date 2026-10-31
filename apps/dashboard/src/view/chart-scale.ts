// Linear or log y-axis for the trend charts (spec 2026-10-31-launch-package, part 4). Display only: the scale
// never reaches SQL, query params or cache keys. Pure, so the server, the client control and the chart share it.
export type ChartScale = "linear" | "log";

/** The `scale` URL parameter; linear is the default, so it never appears in the URL. */
export function parseScale(value: string | string[] | undefined): ChartScale {
  return value === "log" ? "log" : "linear";
}

/** 0, 1, 10, 100, ... up to the first power of ten at or above the largest value (at least 1). */
export function logTicks(values: readonly (number | null)[]): number[] {
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  const ticks = [0, 1];
  while (ticks[ticks.length - 1]! < max) ticks.push(ticks[ticks.length - 1]! * 10);
  return ticks;
}
