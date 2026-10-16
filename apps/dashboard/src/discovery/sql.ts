import { BUILTIN_PREFIX } from "rt-analytics/schema";
import type { QuerySpec } from "@/bq/run-query";
import type { DashboardEnv } from "@/env";

/** Same rule as the ingest handler's app id validation. */
export const APP_ID_RE = /^[a-z0-9_-]{1,32}$/i;

/** The one query without an app_id filter: which apps exist (spec section 5, Discovery). */
export function appListQuery(env: DashboardEnv): QuerySpec {
  return {
    sql: `SELECT app_id FROM (
  SELECT DISTINCT app_id FROM ${env.analyticsTable}
  WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
  UNION DISTINCT
  SELECT app_id FROM ${env.configTable}
) ORDER BY app_id`,
    params: {},
  };
}

export function eventNamesQuery(env: DashboardEnv, appId: string): QuerySpec {
  return {
    sql: `SELECT event_name, COUNT(*) AS events,
  COUNTIF(visitor_id IS NOT NULL) AS with_visitor, COUNTIF(session_id IS NOT NULL) AS with_session
FROM ${env.analyticsTable}
WHERE app_id = @app_id
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
  AND NOT STARTS_WITH(event_name, '${BUILTIN_PREFIX}')
GROUP BY event_name
ORDER BY events DESC`,
    params: { app_id: appId },
  };
}

export function propKeysQuery(env: DashboardEnv, appId: string): QuerySpec {
  return {
    sql: `SELECT event_name, k AS prop_key, COUNT(*) AS n
FROM ${env.analyticsTable}, UNNEST(JSON_KEYS(props, 1)) AS k
WHERE app_id = @app_id
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
  AND NOT STARTS_WITH(event_name, '${BUILTIN_PREFIX}')
  AND props IS NOT NULL
  AND JSON_TYPE(props[k]) IN ('string', 'number', 'boolean')
GROUP BY event_name, prop_key
ORDER BY event_name, n DESC`,
    params: { app_id: appId },
  };
}

/** JSON_KEYS quotes keys it cannot express as a plain path (e.g. "a.b"); those are skipped. */
export function isUsablePropKey(key: string): boolean {
  return key.length > 0 && key.length <= 128 && !key.startsWith('"');
}
