import { createAnalytics } from "../core/analytics.js";
import { AnalyticsProvider } from "./provider.js";

type Events = { subscribe_click: { target: "app" | "copy" } };
const typed = createAnalytics<Events>({ appId: "t" });

export const typedInstanceWithoutAppId = <AnalyticsProvider instance={typed}>x</AnalyticsProvider>;
export const typedInstanceWithAppId = (
  <AnalyticsProvider appId="t" instance={typed}>
    x
  </AnalyticsProvider>
);
export const configOnly = <AnalyticsProvider appId="t">x</AnalyticsProvider>;
// @ts-expect-error appId is required without an instance
export const neither = <AnalyticsProvider>x</AnalyticsProvider>;
