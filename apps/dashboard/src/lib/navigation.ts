"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Same-page navigation inside a transition (layout spec, "Changes on the same page"): the page keeps
 * its current content while the new one loads, and `pending` tells the control to mark itself with
 * `data-pending` so the content area dims. `before` runs inside the same transition, for optimistic
 * setters.
 */
export function usePendingNavigation(): { pending: boolean; navigate: (href: string, before?: () => void) => void } {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = (href: string, before?: () => void) =>
    startTransition(() => {
      before?.();
      router.push(href, { scroll: false });
    });
  return { pending, navigate };
}
