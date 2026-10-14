// Per-app settings in dashboard_config (spec section 7, "Settings").
import type { QuerySpec } from "@/bq/run-query";
import type { DashboardEnv } from "@/env";

export type AppSettings = { timezone: string; hosts: string[] };
export const DEFAULT_SETTINGS: AppSettings = { timezone: "Europe/Berlin", hosts: [] };

const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export function isTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Never throws: bad stored values fall back to defaults so an app's queries keep working. */
export function parseSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS;
  const r = raw as { timezone?: unknown; hosts?: unknown };
  if (!isTimezone(r.timezone)) return DEFAULT_SETTINGS;
  const hosts = Array.isArray(r.hosts)
    ? r.hosts
        .filter((h): h is string => typeof h === "string")
        .map((h) => h.trim().toLowerCase())
        .filter((h) => HOST_RE.test(h))
        .slice(0, 20)
    : [];
  return { timezone: r.timezone, hosts };
}

export function readSettingsQuery(env: DashboardEnv, appId: string): QuerySpec {
  return {
    sql: `SELECT TO_JSON_STRING(value) AS value FROM ${env.configTable}
WHERE kind = 'app_settings' AND id = @app_id
LIMIT 1`,
    params: { app_id: appId },
  };
}

export function saveSettingsQuery(env: DashboardEnv, appId: string, settings: AppSettings, email: string): QuerySpec {
  return {
    sql: `MERGE ${env.configTable} T
USING (SELECT 'app_settings' AS kind, @app_id AS id) S
ON T.kind = S.kind AND T.id = S.id
WHEN MATCHED THEN UPDATE SET value = PARSE_JSON(@value), updated_at = CURRENT_TIMESTAMP(), updated_by = @email
WHEN NOT MATCHED THEN INSERT (kind, id, app_id, name, value, updated_at, updated_by)
  VALUES ('app_settings', @app_id, @app_id, NULL, PARSE_JSON(@value), CURRENT_TIMESTAMP(), @email)`,
    params: { app_id: appId, value: JSON.stringify(settings), email },
  };
}
