import { DAY_SECONDS, TAGS } from "@/bq/cache-rules";
import { query } from "@/bq/query";
import { readEnv } from "@/env";
import { appListQuery, eventNamesQuery, isUsablePropKey, propKeysQuery } from "./sql";

// Discovery is cached for a day and is not skipped by Live (spec section 5); Refresh updates it.
const opts = (tags: string[]) => ({ tags, ttl: DAY_SECONDS, live: false });

export const listApps = () => query<{ app_id: string }>(appListQuery(readEnv()), opts([TAGS.apps]));

export const listEvents = (appId: string) =>
  query<{ event_name: string; events: number; with_visitor: number; with_session: number }>(
    eventNamesQuery(readEnv(), appId),
    opts([TAGS.discovery(appId)]),
  );

export async function listPropKeys(appId: string) {
  const res = await query<{ event_name: string; prop_key: string; n: number }>(
    propKeysQuery(readEnv(), appId),
    opts([TAGS.discovery(appId)]),
  );
  return res.ok ? { ...res, rows: res.rows.filter((r) => isUsablePropKey(r.prop_key)) } : res;
}
