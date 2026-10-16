"use client";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { usePendingNavigation } from "@/lib/navigation";

type Props = { href: string; className?: string; children: ReactNode } & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "onClick"
>;

/**
 * A link for changes on the same page (another event, a saved funnel): the old content stays, dimmed,
 * until the new one is ready. New-tab and new-window clicks are left to the browser.
 */
export function PendingLink({ href, children, ...rest }: Props) {
  const { pending, navigate } = usePendingNavigation();
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || rest.target) return;
    e.preventDefault();
    navigate(href);
  }
  return (
    <a href={href} onClick={onClick} data-pending={pending ? "" : undefined} {...rest}>
      {children}
    </a>
  );
}
