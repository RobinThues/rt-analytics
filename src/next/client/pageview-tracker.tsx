"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAnalytics } from "rt-analytics/react";

export function PageviewTracker(): null {
  const analytics = useAnalytics();
  const pathname = usePathname();
  // StrictMode runs effects twice in dev; refs survive that, so each path counts once.
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (lastTracked.current === pathname) return;
    lastTracked.current = pathname;
    analytics.page();
  }, [analytics, pathname]);

  return null;
}
