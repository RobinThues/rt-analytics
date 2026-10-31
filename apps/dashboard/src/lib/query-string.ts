/**
 * Rebuilds the view query string from the parsed state, so only known parameters are kept. `extra` holds
 * page parameters (explorer selection, funnel steps) that were validated by the page.
 */
export function viewQuery(
  state: { range: { from: string; to: string }; compare: boolean; interval?: string | null; scale?: string },
  extra: ReadonlyArray<readonly [string, string]> = [],
): string {
  const p = new URLSearchParams({ from: state.range.from, to: state.range.to });
  if (!state.compare) p.set("compare", "0");
  if (state.interval) p.set("interval", state.interval);
  if (state.scale === "log") p.set("scale", "log");
  for (const [k, v] of extra) p.append(k, v);
  return `?${p.toString()}`;
}
