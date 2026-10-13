import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createAnalyticsUnstarted } from "../core/analytics.js";
// Public types come from the core entry, so dist/react/index.d.ts references them instead of bundling
// a second copy. With two copies TypeScript cannot infer E from a typed instance.
import type { Analytics, AnalyticsConfig, EventMap } from "rt-analytics";

const AnalyticsContext = createContext<Analytics | null>(null);

export type AnalyticsProviderProps<E extends EventMap = EventMap> = { children: ReactNode } & (
  | (AnalyticsConfig & { instance?: undefined })
  /** A prebuilt instance (from createAnalytics). Config props are then ignored. Read once on mount. */
  | (Partial<AnalyticsConfig> & { instance: Analytics<E> })
);

interface ProvidedInstance {
  analytics: Analytics;
  /** Only for instances the provider created itself; a passed-in instance is already started. */
  start: (() => () => void) | null;
}

export function AnalyticsProvider<E extends EventMap = EventMap>(props: AnalyticsProviderProps<E>) {
  // The instance is chosen once; later prop changes are ignored. StrictMode runs this initializer
  // twice in dev. A created instance is unstarted, so the discarded one never attaches listeners;
  // the kept one starts in the effect below.
  const [provided] = useState<ProvidedInstance>(() => {
    if (props.instance !== undefined) return { analytics: props.instance as unknown as Analytics, start: null };
    const { children: _children, instance: _instance, ...config } = props;
    const { analytics, start } = createAnalyticsUnstarted(config);
    return { analytics, start };
  });
  useEffect(() => provided.start?.(), [provided]);

  return <AnalyticsContext.Provider value={provided.analytics}>{props.children}</AnalyticsContext.Provider>;
}

export function useAnalytics<E extends EventMap = EventMap>(): Analytics<E> {
  const analytics = useContext(AnalyticsContext);
  if (!analytics) throw new Error("useAnalytics must be used inside <AnalyticsProvider>");
  return analytics as Analytics<E>;
}
