import type { ReactNode } from "react";

/** The page content below the top bar. It dims while a same-page change is pending (any `data-pending`
 * inside the `group/content` area of the app layout). */
export function PageBody({ children }: { children: ReactNode }) {
  return (
    <div data-testid="page-body" className="transition-opacity group-has-data-pending/content:opacity-50">
      {children}
    </div>
  );
}
