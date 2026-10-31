// Per-app settings in dashboard_config (spec section 7, "Settings").
import type { QuerySpec } from "@/bq/run-query";
import type { DashboardEnv } from "@/env";

export type Goal = { event: string; label: string };
export type AppSettings = { timezone: string; hosts: string[]; goal?: Goal };
export const DEFAULT_SETTINGS: AppSettings = { timezone: "Europe/Berlin", hosts: [] };

/** An app event: the ingest's name rule without the `$` of built-in events. */
const GOAL_EVENT_RE = /^[a-z0-9_]{1,64}$/i;
const MAX_GOAL_LABEL = 60;

/** A goal from the settings form or storage, or undefined. The label falls back to the event name. */
export function parseGoal(raw: unknown): Goal | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { event, label } = raw as { event?: unknown; label?: unknown };
  if (typeof event !== "string" || !GOAL_EVENT_RE.test(event)) return undefined;
  const text = typeof label === "string" ? label.trim().slice(0, MAX_GOAL_LABEL) : "";
  return { event, label: text || event };
}

const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

let zones: Set<string> | null = null;

/** Only the canonical IANA names Intl lists, plus UTC. Exact case, so the stored value is what BigQuery gets. */
export function isTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string") return false;
  zones ??= new Set(Intl.supportedValuesOf("timeZone"));
  return tz === "UTC" || zones.has(tz);
}

const MAX_HOSTS = 20;

/** Splits the settings textarea; invalid entries are reported so the form can refuse them. */
export function parseHostList(input: string): { hosts: string[]; invalid: string[] } {
  const hosts: string[] = [];
  const invalid: string[] = [];
  for (const raw of input.split(/[\s,]+/)) {
    const h = raw.trim().toLowerCase();
    if (h.length === 0) continue;
    if (HOST_RE.test(h)) hosts.push(h);
    else invalid.push(raw.trim());
  }
  return { hosts: hosts.slice(0, MAX_HOSTS), invalid };
}

/** The events a goal can use: those with a session id, sorted; the current goal stays selectable when it is quiet. */
export function goalEventOptions(
  events: ReadonlyArray<{ event_name: string; with_session: number }>,
  current: string | undefined,
): string[] {
  const names = new Set(events.filter((e) => e.with_session > 0).map((e) => e.event_name));
  if (current) names.add(current);
  return [...names].sort();
}

/** Never throws: bad stored values fall back to defaults so an app's queries keep working. */
export function parseSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS;
  const r = raw as { timezone?: unknown; hosts?: unknown; goal?: unknown };
  if (!isTimezone(r.timezone)) return DEFAULT_SETTINGS;
  const hosts = Array.isArray(r.hosts)
    ? r.hosts
        .filter((h): h is string => typeof h === "string")
        .map((h) => h.trim().toLowerCase())
        .filter((h) => HOST_RE.test(h))
        .slice(0, MAX_HOSTS)
    : [];
  const goal = parseGoal(r.goal);
  return { timezone: r.timezone, hosts, ...(goal ? { goal } : {}) };
}

export function readSettingsQuery(env: DashboardEnv, appId: string): QuerySpec {
  return {
    name: "settings_read",
    sql: `SELECT TO_JSON_STRING(value) AS value FROM ${env.configTable}
WHERE kind = 'app_settings' AND id = @app_id
LIMIT 1`,
    params: { app_id: appId },
  };
}

export function saveSettingsQuery(env: DashboardEnv, appId: string, settings: AppSettings, email: string): QuerySpec {
  return {
    name: "settings_save",
    sql: `MERGE ${env.configTable} T
USING (SELECT 'app_settings' AS kind, @app_id AS id) S
ON T.kind = S.kind AND T.id = S.id
WHEN MATCHED THEN UPDATE SET value = PARSE_JSON(@value), updated_at = CURRENT_TIMESTAMP(), updated_by = @email
WHEN NOT MATCHED THEN INSERT (kind, id, app_id, name, value, updated_at, updated_by)
  VALUES ('app_settings', @app_id, @app_id, NULL, PARSE_JSON(@value), CURRENT_TIMESTAMP(), @email)`,
    params: { app_id: appId, value: JSON.stringify(settings), email },
  };
}
