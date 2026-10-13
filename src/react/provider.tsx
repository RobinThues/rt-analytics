import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createAnalyticsUnstarted, type Analytics } from "../core/analytics.js";
import type { AnalyticsConfig, EventMap } from "../core/types.js";

const AnalyticsContext = createContext<Analytics | null>(null);

export type AnalyticsProviderProps<E extends EventMap = EventMap> = { children: ReactNode } & (
  | (AnalyticsConfig & { instance?: undefined })
  /** A prebuilt instance (from createAnalytics). Config props are then ignored. */
  | (Partial<AnalyticsConfig> & { instance: Analytics<E> })
);

export function AnalyticsProvider<E extends EventMap = EventMap>(props: AnalyticsProviderProps<E>) {
  // StrictMode runs this initializer twice in dev. The instance is created unstarted, so the
  // discarded one never attaches listeners; the kept one starts in the effect below.
  const [created] = useState(() => {
    if (props.instance !== undefined) return null;
    const { children: _children, instance: _instance, ...config } = props;
    return createAnalyticsUnstarted(config);
  });
  useEffect(() => (created ? created.start() : undefined), [created]);

  const analytics = (props.instance ?? created!.analytics) as unknown as Analytics;
  return <AnalyticsContext.Provider value={analytics}>{props.children}</AnalyticsContext.Provider>;
}

export function useAnalytics<E extends EventMap = EventMap>(): Analytics<E> {
  const analytics = useContext(AnalyticsContext);
  if (!analytics) throw new Error("useAnalytics must be used inside <AnalyticsProvider>");
  return analytics as Analytics<E>;
}
