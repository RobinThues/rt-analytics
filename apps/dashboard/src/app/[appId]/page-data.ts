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
import { todayIn, type DateRange } from "@/time/range";
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

/** What every panel needs. */
export type PanelProps = { ctx: QueryContext; live: boolean; maxBytes: number };

export async function loadPage(
  params: Promise<{ appId: string }>,
  searchParams: Promise<SearchParams>,
): Promise<PageData> {
  const { appId } = await params;
  if (!APP_ID_RE.test(appId)) notFound();
  await requireUser();
  const env = readEnv();
  const [settings, apps, live, sp] = await Promise.all([getSettings(appId), listApps(), isLive(), searchParams]);
  const today = todayIn(settings.timezone, new Date());
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
    apps: appIds.includes(appId) ? appIds : [...appIds, appId].sort(),
    live,
    state,
    today,
    ctx,
    sp,
    maxBytes: env.maxBytesPerQuery,
  };
}
