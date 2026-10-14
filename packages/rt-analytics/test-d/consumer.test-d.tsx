// Type-checks the built package the way consumers see it (package exports → dist/*.d.ts).
// Run with `npm run typecheck:dist` after `npm run build`.
import { createAnalytics, type Analytics } from "rt-analytics";
import { AnalyticsProvider, useAnalytics } from "rt-analytics/react";

type Events = {
  subscribe_click: { target: "app" | "copy"; place: string; fields: string };
  place_selected: { source: "search" | "suggestion"; place: string };
};
const typed = createAnalytics<Events>({ appId: "t", cookieless: true });

export const typedInstance = <AnalyticsProvider instance={typed}>x</AnalyticsProvider>;
export const typedInstanceWithAppId = (
  <AnalyticsProvider appId="t" instance={typed}>
    x
  </AnalyticsProvider>
);
export const configOnly = <AnalyticsProvider appId="t">x</AnalyticsProvider>;
// @ts-expect-error appId is required without an instance
export const neither = <AnalyticsProvider>x</AnalyticsProvider>;

// The hook returns the same Analytics type the core entry exports.
export function useTyped(): Analytics<Events> {
  return useAnalytics<Events>();
}

import { createServerTracker, type ServerTracker } from "rt-analytics/next";
export const tracker: ServerTracker = createServerTracker({ appId: "t" });
export const pseudonym: string | null = tracker.pseudonymize("v");
export const done: Promise<void> = tracker.track("calendar_poll", { kind: "token" });
