/** Rebuilds the view query string from the parsed state, so only known parameters are kept. */
export function viewQuery(state: { range: { from: string; to: string }; compare: boolean }): string {
  const p = new URLSearchParams({ from: state.range.from, to: state.range.to });
  if (!state.compare) p.set("compare", "0");
  return `?${p.toString()}`;
}
