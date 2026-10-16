import { DAY_SECONDS, TAGS } from "@/bq/cache-rules";
import { query } from "@/bq/query";
import { readEnv } from "@/env";
import { listFunnelsQuery, parseSavedFunnel, type SavedFunnel } from "./funnels";
import { parseSettings, readSettingsQuery, type AppSettings } from "./settings";

/** Cached for a day under rtd:config; saveSettings invalidates it. Live and Refresh do not touch it. */
export async function getSettings(appId: string): Promise<AppSettings> {
  const res = await query<{ value: string }>(readSettingsQuery(readEnv(), appId), {
    tags: [TAGS.config],
    ttl: DAY_SECONDS,
    live: false,
  });
  const raw = res.ok && res.rows[0] ? (JSON.parse(res.rows[0].value) as unknown) : null;
  return parseSettings(raw);
}

/** Saved funnels of an app, cached under rtd:config. `failed` lets the page say so instead of "none". */
export async function getFunnels(appId: string): Promise<{ funnels: SavedFunnel[]; failed: boolean }> {
  const res = await query<{ id: string; name: string | null; value: string }>(listFunnelsQuery(readEnv(), appId), {
    tags: [TAGS.config],
    ttl: DAY_SECONDS,
    live: false,
  });
  if (!res.ok) return { funnels: [], failed: true };
  return { funnels: res.rows.flatMap((r) => parseSavedFunnel(r) ?? []), failed: false };
}
