import type { ReactNode } from "react";
import { ProgressLine } from "@/components/progress-line";

/**
 * Shell of every app page. The content area is a Tailwind group: a control with `data-pending` inside
 * it dims the page body and shows the progress line (layout spec, "Changes on the same page").
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="group/content min-w-0 flex-1">
      <ProgressLine />
      {children}
    </div>
  );
}
