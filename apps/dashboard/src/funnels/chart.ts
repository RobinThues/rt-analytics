// Funnel chart geometry (layout spec, "Funnel chart"): bar lengths on one scale for both periods, and
// the conversion chips between steps. Pixel positions follow from length and bar index in the component.
import { formatShare } from "@/lib/format";
import type { FunnelStepView } from "./steps";

export interface FunnelGeometry {
  bars: Array<{ step: number; length: number; prevLength: number | null }>;
  chips: Array<{ afterStep: number; label: string }>;
}

/** `size` is the bar length in px for the largest value of either period. */
export function funnelGeometry(
  view: readonly FunnelStepView[],
  opts: { compare: boolean; size: number },
): FunnelGeometry {
  const values = view.flatMap((v) => (opts.compare && v.prev !== null ? [v.cur, v.prev] : [v.cur]));
  const max = Math.max(0, ...values);
  const scale = (n: number) => (max > 0 ? (n / max) * opts.size : 0);
  return {
    bars: view.map((v) => ({
      step: v.step,
      length: scale(v.cur),
      prevLength: opts.compare && v.prev !== null ? scale(v.prev) : null,
    })),
    chips: view.slice(1).map((v) => ({
      afterStep: v.step - 1,
      label: `${v.fromPrev === null ? "–" : formatShare(v.fromPrev)} →`,
    })),
  };
}
