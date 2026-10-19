// Shared start of every data page: validate the app, check the user, read settings and view state, and
// build the query context.
import { notFound } from "next/navigation";
import { requireUser } from "@/auth/session";
import { isLive } from "@/bq/query";
import { getSettings } from "@/config/data";
import type { AppSettings } from "@/config/settings";
import { listApps } from "@/discovery/data";
import { APP_ID_RE } from "@/discovery/sql";
import { readEnv } from "@/env";
import { buildContext, type QueryContext } from "@/queries/context";
import type { DateRange } from "@/time/range";
import { appToday } from "@/time/today";
import { parseViewState } from "@/view/state";

export type SearchParams = Record<string, string | string[] | undefined>;

export interface PageData {
  appId: string;
  settings: AppSettings;
  apps: string[];
  live: boolean;
  state: { range: DateRange; compare: boolean };
  today: string;
  ctx: QueryContext;
  sp: SearchParams;
  maxBytes: number;
}

/** The request as pages receive it. Pages create it once and pass the same object down. */
export type PageInput = { params: Promise<{ appId: string }>; searchParams: Promise<SearchParams> };

/** What every panel needs. */
export type PanelProps = { ctx: QueryContext; live: boolean; maxBytes: number };

/** The app list for pickers: the current app is always in it (it may have no recent events). */
export function appList(appId: string, ids: readonly string[]): string[] {
  return ids.includes(appId) ? [...ids].sort() : [...ids, appId].sort();
}

// One load per request: every data part of a page calls loadPage with the same input object. A WeakMap
// (not React cache) so it also dedupes in tests; each request has its own input object.
const loaded = new WeakMap<PageInput, Promise<PageData>>();

export function loadPage(input: PageInput): Promise<PageData> {
  let p = loaded.get(input);
  if (!p) {
    p = load(input.params, input.searchParams);
    loaded.set(input, p);
  }
  return p;
}

async function load(params: Promise<{ appId: string }>, searchParams: Promise<SearchParams>): Promise<PageData> {
  const { appId } = await params;
  if (!APP_ID_RE.test(appId)) notFound();
  await requireUser();
  const env = readEnv();
  const [settings, apps, live, sp] = await Promise.all([getSettings(appId), listApps(), isLive(), searchParams]);
  const today = appToday(settings.timezone, env);
  const state = parseViewState(sp, today);
  const ctx = buildContext({
    table: env.analyticsTable,
    appId,
    settings,
    range: state.range,
    compare: state.compare,
    today,
  });
  const appIds = apps.ok ? apps.rows.map((a) => a.app_id) : [];
  return {
    appId,
    settings,
    apps: appList(appId, appIds),
    live,
    state,
    today,
    ctx,
    sp,
    maxBytes: env.maxBytesPerQuery,
  };
}
