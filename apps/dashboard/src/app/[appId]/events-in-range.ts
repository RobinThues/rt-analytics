// Temporary proof of the data path (spec PR 7); replaced by the overview page in Phase C.
import type { QuerySpec } from "@/bq/run-query";
import type { DashboardEnv } from "@/env";

export function eventsInRangeQuery(
  env: DashboardEnv,
  appId: string,
  bounds: { fromTs: string; toTs: string },
): QuerySpec {
  return {
    sql: `SELECT COUNT(*) AS events FROM ${env.analyticsTable}
WHERE app_id = @app_id AND timestamp >= TIMESTAMP(@from_ts) AND timestamp < TIMESTAMP(@to_ts)`,
    params: { app_id: appId, from_ts: bounds.fromTs, to_ts: bounds.toTs },
  };
}
