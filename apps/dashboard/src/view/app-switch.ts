// Links in the sidebar (layout spec, option A): another app or another page keeps only the range.
// Page parameters (event, steps, funnel, …) belong to one app and one page, so they are dropped.
import { PAGE_PATHS, type AppPage } from "@/lib/pages";

const KEPT = ["from", "to", "compare"] as const;
const SEGMENTS = new Set<string>([...Object.values(PAGE_PATHS), "/settings"]);

function rangeOnly(search: string): string {
  const current = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out = new URLSearchParams();
  for (const k of KEPT) {
    const v = current.get(k);
    if (v !== null) out.set(k, v);
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

/** The same page under another app. `pathname` is `/<app>` plus an optional page segment. */
export function appSwitchHref(pathname: string, targetApp: string, search: string): string {
  const rest = pathname.replace(/^\/[^/]+/, "");
  const segment = SEGMENTS.has(rest) ? rest : "";
  return `/${targetApp}${segment}${rangeOnly(search)}`;
}

export function pageHref(appId: string, page: AppPage | "settings", search: string): string {
  const segment = page === "settings" ? "/settings" : PAGE_PATHS[page];
  return `/${appId}${segment}${rangeOnly(search)}`;
}
