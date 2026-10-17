"use client";
import { useOptimistic } from "react";
import { usePendingNavigation } from "@/lib/navigation";
import { withView } from "@/view/range-ui";

/** Compare with the previous period; applies at once (layout spec, "Range picker"). */
export function CompareToggle({ compare }: { compare: boolean }) {
  const [checked, setChecked] = useOptimistic(compare);
  const { pending, navigate } = usePendingNavigation();
  function toggle(next: boolean) {
    // The optimistic value is set inside the navigation's transition, so it holds until the page arrives.
    navigate(window.location.pathname + withView(window.location.search, { compare: next }), () => setChecked(next));
  }
  return (
    <label className="flex items-center gap-1.5 text-sm" data-pending={pending ? "" : undefined}>
      <input type="checkbox" className="accent-primary" checked={checked} onChange={(e) => toggle(e.target.checked)} />
      Compare
    </label>
  );
}
