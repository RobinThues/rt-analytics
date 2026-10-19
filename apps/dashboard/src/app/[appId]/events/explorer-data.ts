// What every data part of the explorer page needs, loaded once per request (same rule as loadPage).
import { redirect } from "next/navigation";
import { buildCatalog, type Catalog } from "@/discovery/catalog";
import { listEvents, listPropKeys } from "@/discovery/data";
import { explorerParams, needsCanonicalRedirect, parseExplorer } from "@/explorer/state";
import { viewQuery } from "@/lib/query-string";
import type { ExplorerSelection } from "@/queries/explorer";
import { loadPage, type PageData, type PageInput } from "../page-data";

export interface ExplorerData {
  page: PageData;
  events: Awaited<ReturnType<typeof listEvents>>;
  catalog: Catalog | null;
  sel: ExplorerSelection | null;
  pageParams: Array<[string, string]>;
}

const loaded = new WeakMap<PageInput, Promise<ExplorerData>>();

export function loadExplorer(input: PageInput): Promise<ExplorerData> {
  let p = loaded.get(input);
  if (!p) {
    p = load(input);
    loaded.set(input, p);
  }
  return p;
}

async function load(input: PageInput): Promise<ExplorerData> {
  const page = await loadPage(input);
  const tz = page.settings.timezone;
  const [events, keys] = await Promise.all([listEvents(page.appId, tz), listPropKeys(page.appId, tz)]);
  const catalog = events.ok ? buildCatalog(events.rows, keys.ok ? keys.rows : []) : null;
  const sel = catalog ? parseExplorer(page.sp, catalog) : null;
  const pageParams = explorerParams(sel);
  // Old links with fk/fv (the v1 form) go to the canonical filter=key:value URL.
  if (needsCanonicalRedirect(page.sp)) redirect(`/${page.appId}/events${viewQuery(page.state, pageParams)}`);
  return { page, events, catalog, sel, pageParams };
}
