/** The per-app data pages. Settings is separate (no date range). */
export type AppPage = "overview" | "events" | "funnels";

export const PAGE_PATHS: Record<AppPage, "" | "/events" | "/funnels"> = {
  overview: "",
  events: "/events",
  funnels: "/funnels",
};

export const isAppPage = (v: unknown): v is AppPage => typeof v === "string" && Object.hasOwn(PAGE_PATHS, v);
