/** Decides what the demo loader does, so a second run never duplicates the demo history. */
export function planLoad(existingDemoRows: number, replace: boolean): "load" | "replace-then-load" | "refuse" {
  if (existingDemoRows === 0) return "load";
  return replace ? "replace-then-load" : "refuse";
}
