import { createContext, useContext, useState, type ReactNode } from "react";
import { createAnalytics, type Analytics } from "../core/analytics.js";
import type { AnalyticsConfig, EventMap } from "../core/types.js";

const AnalyticsContext = createContext<Analytics | null>(null);

export interface AnalyticsProviderProps extends AnalyticsConfig {
  children: ReactNode;
  /** Escape hatch for tests/advanced use: supply a prebuilt instance. */
  instance?: Analytics;
}

export function AnalyticsProvider({ children, instance, ...config }: AnalyticsProviderProps) {
  const [analytics] = useState<Analytics>(() => instance ?? createAnalytics(config));
  return <AnalyticsContext.Provider value={analytics}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics<E extends EventMap = EventMap>(): Analytics<E> {
  const analytics = useContext(AnalyticsContext);
  if (!analytics) throw new Error("useAnalytics must be used inside <AnalyticsProvider>");
  return analytics as Analytics<E>;
}
