import { DAY_SECONDS, TAGS } from "@/bq/cache-rules";
import { query } from "@/bq/query";
import { readEnv } from "@/env";
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
