"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAnalytics } from "rt-analytics/react";

export function PageviewTracker(): null {
  const analytics = useAnalytics();
  const pathname = usePathname();

  useEffect(() => {
    analytics.page();
  }, [analytics, pathname]);

  return null;
}
