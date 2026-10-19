import { DAY_SECONDS, TAGS } from "@/bq/cache-rules";
import { query } from "@/bq/query";
import { readEnv } from "@/env";
import { todayEnd } from "@/time/today";
import { appListQuery, eventNamesQuery, isUsablePropKey, propKeysQuery } from "./sql";

// Discovery is cached for a day and is not skipped by Live (spec section 5); Refresh updates it. The windows
// end at the app's today (`tz` is the app's timezone; the app list has no app, so it uses UTC).
const opts = (tags: string[]) => ({ tags, ttl: DAY_SECONDS, live: false });

export const listApps = () => query<{ app_id: string }>(appListQuery(readEnv(), todayEnd("UTC")), opts([TAGS.apps]));

export const listEvents = (appId: string, tz: string) =>
  query<{ event_name: string; events: number; with_visitor: number; with_session: number }>(
    eventNamesQuery(readEnv(), appId, todayEnd(tz)),
    opts([TAGS.discovery(appId)]),
  );

export async function listPropKeys(appId: string, tz: string) {
  const res = await query<{ event_name: string; prop_key: string; n: number }>(
    propKeysQuery(readEnv(), appId, todayEnd(tz)),
    opts([TAGS.discovery(appId)]),
  );
  return res.ok ? { ...res, rows: res.rows.filter((r) => isUsablePropKey(r.prop_key)) } : res;
}
