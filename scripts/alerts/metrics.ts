// The one query behind the alert rules. It reads the last 8 days of one app, but only the built-in events the rules
// need (the table is clustered by app and event), plus today for the time of the last event of any kind.
import { EVENTS_TABLE } from "./config";
import type { Metrics } from "./rules";

export const METRICS_SQL = `WITH rel AS (
  SELECT event_name, session_id, props, DIV(TIMESTAMP_DIFF(TIMESTAMP(@now), timestamp, MINUTE), 60 * 24) AS days_ago,
    MOD(TIMESTAMP_DIFF(TIMESTAMP(@now), timestamp, MINUTE), 60 * 24) AS minutes_into_day
  FROM ${EVENTS_TABLE}
  WHERE app_id = @app_id AND event_name IN ('$pageview', '$error', '$route_failure')
    AND timestamp >= TIMESTAMP_SUB(TIMESTAMP(@now), INTERVAL 8 DAY) AND timestamp < TIMESTAMP(@now)
),
hour_rows AS (SELECT * FROM rel WHERE minutes_into_day < 60)
SELECT 'baseline' AS kind, days_ago, NULL AS route, COUNT(*) AS n, NULL AS sessions, NULL AS error_sessions
FROM hour_rows WHERE event_name = '$pageview' AND days_ago BETWEEN 1 AND 7 GROUP BY days_ago
UNION ALL
SELECT 'current', 0, NULL, COUNTIF(event_name = '$pageview'),
  COUNT(DISTINCT IF(event_name = '$pageview', session_id, NULL)),
  COUNT(DISTINCT IF(event_name = '$error', session_id, NULL))
FROM hour_rows WHERE days_ago = 0
UNION ALL
SELECT 'failure', 0, IFNULL(LAX_STRING(props.route), '(no route)'), SUM(IFNULL(LAX_INT64(props.count), 1)), NULL, NULL
FROM hour_rows WHERE days_ago = 0 AND event_name = '$route_failure' GROUP BY 3
UNION ALL
SELECT 'last_event', 0, NULL, TIMESTAMP_DIFF(TIMESTAMP(@now), MAX(timestamp), MINUTE), NULL, NULL
FROM ${EVENTS_TABLE}
WHERE app_id = @app_id AND timestamp >= TIMESTAMP_SUB(TIMESTAMP(@now), INTERVAL 1 DAY) AND timestamp < TIMESTAMP(@now)`;

export interface MetricRow {
  kind: "baseline" | "current" | "failure" | "last_event";
  days_ago: number;
  route: string | null;
  n: number | null;
  sessions: number | null;
  error_sessions: number | null;
}

/** A day with no row had no pageviews in that hour, so it counts as 0 in the baseline. */
export function toMetrics(rows: readonly MetricRow[]): Metrics {
  const current = rows.find((r) => r.kind === "current");
  const failures: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const r of rows) if (r.kind === "failure" && r.route !== null) failures[r.route] = r.n ?? 0;
  const baseline = rows.filter((r) => r.kind === "baseline");
  const baselinePageviews = [1, 2, 3, 4, 5, 6, 7].map((d) => baseline.find((r) => r.days_ago === d)?.n ?? 0);
  return {
    pageviews: current?.n ?? 0,
    sessions: current?.sessions ?? 0,
    errorSessions: current?.error_sessions ?? 0,
    failures,
    minutesSinceLastEvent: rows.find((r) => r.kind === "last_event")?.n ?? null,
    baselinePageviews,
  };
}
