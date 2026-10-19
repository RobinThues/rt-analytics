// Saved funnels in dashboard_config (spec section 7): kind = funnel, value = { steps }.
import type { QuerySpec } from "@/bq/run-query";
import type { DashboardEnv } from "@/env";
import { isStep, MAX_STEPS, MIN_STEPS, type SavedFunnel } from "@/funnels/steps";

export type { SavedFunnel };

export const FUNNEL_ID_RE = /^[0-9a-f-]{36}$/;
export const MAX_NAME = 80;

export function listFunnelsQuery(env: DashboardEnv, appId: string): QuerySpec {
  return {
    name: "funnels_list",
    sql: `SELECT id, name, TO_JSON_STRING(value) AS value FROM ${env.configTable}
WHERE kind = 'funnel' AND app_id = @app_id
ORDER BY name, updated_at`,
    params: { app_id: appId },
  };
}

export function saveFunnelQuery(env: DashboardEnv, appId: string, funnel: SavedFunnel, email: string): QuerySpec {
  return {
    name: "funnel_save",
    sql: `MERGE ${env.configTable} T
USING (SELECT 'funnel' AS kind, @id AS id) S
ON T.kind = S.kind AND T.id = S.id
WHEN MATCHED THEN UPDATE SET name = @name, value = PARSE_JSON(@value), updated_at = CURRENT_TIMESTAMP(), updated_by = @email
WHEN NOT MATCHED THEN INSERT (kind, id, app_id, name, value, updated_at, updated_by)
  VALUES ('funnel', @id, @app_id, @name, PARSE_JSON(@value), CURRENT_TIMESTAMP(), @email)`,
    params: {
      id: funnel.id,
      app_id: appId,
      name: funnel.name,
      value: JSON.stringify({ steps: funnel.steps }),
      email,
    },
  };
}

export function deleteFunnelQuery(env: DashboardEnv, appId: string, id: string): QuerySpec {
  return {
    name: "funnel_delete",
    sql: `DELETE FROM ${env.configTable} WHERE kind = 'funnel' AND id = @id AND app_id = @app_id`,
    params: { id, app_id: appId },
  };
}

/** Never throws: a broken row is skipped instead of breaking the funnels page. */
export function parseSavedFunnel(row: { id: string; name: string | null; value: string }): SavedFunnel | null {
  if (!FUNNEL_ID_RE.test(row.id) || !row.name || row.name.length > MAX_NAME) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(row.value);
  } catch {
    return null;
  }
  const steps = (raw as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(steps) || steps.length < MIN_STEPS || steps.length > MAX_STEPS || !steps.every(isStep)) {
    return null;
  }
  return { id: row.id, name: row.name, steps: steps.map((s) => ({ event: s.event, filter: s.filter })) };
}
