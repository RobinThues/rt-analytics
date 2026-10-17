"use client";
import { useRouter } from "next/navigation";
import { createContext, createElement, useContext, useTransition, type MouseEvent, type ReactNode } from "react";

type Navigation = { pending: boolean; navigate: (href: string, before?: () => void) => void };

const NavigationContext = createContext<Navigation | null>(null);

function useOwnNavigation(): Navigation {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = (href: string, before?: () => void) =>
    startTransition(() => {
      before?.();
      router.push(href, { scroll: false });
    });
  return { pending, navigate };
}

/**
 * One navigation transition for the whole app layout. While it is pending, a hidden `data-pending`
 * marker inside the layout dims the page body and shows the progress line, also for links rendered in
 * portals (phone drawer, app switcher) and for pages Next shows again from its cache (layout spec,
 * "Changes on the same page"; final review, revisits gave no feedback).
 */
export function PendingNavigationProvider({ children }: { children: ReactNode }) {
  const nav = useOwnNavigation();
  return createElement(
    NavigationContext.Provider,
    { value: nav },
    nav.pending ? createElement("span", { "data-pending": "", hidden: true }) : null,
    children,
  );
}

/**
 * Navigation inside a transition: the page keeps its current content while the new one loads, and
 * `pending` lets a control mark itself with `data-pending`. `before` runs inside the same transition,
 * for optimistic setters. Uses the layout's shared transition when there is one.
 */
export function usePendingNavigation(): Navigation {
  const shared = useContext(NavigationContext);
  const own = useOwnNavigation();
  return shared ?? own;
}

/** A plain left click without modifier keys: navigate in place. Anything else is left to the browser. */
export function isPlainClick(e: MouseEvent<HTMLAnchorElement>, target?: string): boolean {
  return !e.defaultPrevented && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && !target;
}
