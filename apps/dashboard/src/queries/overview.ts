// Overview panels (spec section 7, "Overview"): built-in events only. Every builder reads one window and
// labels rows by period (see context.ts), so one query answers the range and the previous period.
import { EVENTS } from "rt-analytics/schema";
import type { QuerySpec } from "@/bq/run-query";
import { dayStart, addDays } from "@/time/range";
import {
  eventsCte,
  persistentCond,
  SESSION_COLUMNS,
  sessionsCte,
  toSpec,
  type EventColumn,
  type Period,
  type QueryContext,
} from "./context";

export interface KpiRow {
  period: Period;
  visitor_days: number;
  persistent_people: number;
  returning_people: number;
  sessions: number;
  persistent_sessions: number;
  bounced_sessions: number;
  pageviews: number;
  errors: number;
}

export interface TrafficRow {
  period: Period;
  day: string;
  visitors: number;
  sessions: number;
  pageviews: number;
  errors: number;
}

export type BreakdownDim = "page" | "entry_page" | "source" | "utm" | "country" | "device" | "browser" | "os";
export const DIMS: readonly BreakdownDim[] = [
  "page",
  "entry_page",
  "source",
  "utm",
  "country",
  "device",
  "browser",
  "os",
];

/** `value` NULL means Other (everything outside the top 20). */
export interface BreakdownRow {
  period: Period;
  value: string | null;
  pageviews: number;
  visitor_days: number;
}

export interface VitalRow {
  period: Period;
  metric: "LCP" | "INP" | "CLS";
  p75: number;
  samples: number;
}

export interface SlowPageRow {
  page_path: string;
  p75: number;
  samples: number;
}

export interface ErrorRow {
  message: string;
  occurrences: number;
  last_seen: string;
}

export interface ConsentRow {
  period: Period;
  consent_state: string;
  pageviews: number;
}

export interface RetentionRow {
  cohort: string;
  week_n: number;
  people: number;
}

const PV = `'${EVENTS.pageview}'`;
const ERR = `'${EVENTS.error}'`;
const VITAL = `'${EVENTS.webVital}'`;

export function kpisQuery(ctx: QueryContext): QuerySpec {
  const sql = `WITH ${eventsCte(ctx.table, SESSION_COLUMNS)},
${sessionsCte()},
periods AS (SELECT period FROM UNNEST(IF(@compare, ['cur', 'prev'], ['cur'])) AS period),
daily AS (
  SELECT period, day, COUNT(DISTINCT visitor_id) AS v
  FROM evp WHERE period IS NOT NULL AND visitor_id IS NOT NULL
  GROUP BY period, day
),
visitors AS (SELECT period, SUM(v) AS visitor_days FROM daily GROUP BY period),
persons AS (
  SELECT period, COALESCE(user_id, visitor_id) AS person, COUNT(DISTINCT day) AS days
  FROM evp WHERE period IS NOT NULL AND ${persistentCond()}
  GROUP BY period, person
),
people AS (
  SELECT period, COUNT(*) AS persistent_people, COUNTIF(days >= 2) AS returning_people
  FROM persons GROUP BY period
),
sess AS (
  SELECT period, COUNT(*) AS sessions, COUNTIF(persistent) AS persistent_sessions,
    COUNTIF(pageviews = 1) AS bounced_sessions
  FROM sessions WHERE period IS NOT NULL GROUP BY period
),
counts AS (
  SELECT period, COUNTIF(event_name = ${PV}) AS pageviews, COUNTIF(event_name = ${ERR}) AS errors
  FROM evp WHERE period IS NOT NULL GROUP BY period
)
SELECT
  period,
  IFNULL(visitor_days, 0) AS visitor_days,
  IFNULL(persistent_people, 0) AS persistent_people,
  IFNULL(returning_people, 0) AS returning_people,
  IFNULL(sessions, 0) AS sessions,
  IFNULL(persistent_sessions, 0) AS persistent_sessions,
  IFNULL(bounced_sessions, 0) AS bounced_sessions,
  IFNULL(pageviews, 0) AS pageviews,
  IFNULL(errors, 0) AS errors
FROM periods
LEFT JOIN visitors USING (period)
LEFT JOIN people USING (period)
LEFT JOIN sess USING (period)
LEFT JOIN counts USING (period)`;
  return toSpec(sql, ctx.params);
}

export function trafficQuery(ctx: QueryContext): QuerySpec {
  const sql = `WITH ${eventsCte(ctx.table, SESSION_COLUMNS)},
${sessionsCte()},
ev AS (
  SELECT period, day, COUNT(DISTINCT visitor_id) AS visitors,
    COUNTIF(event_name = ${PV}) AS pageviews, COUNTIF(event_name = ${ERR}) AS errors
  FROM evp WHERE period IS NOT NULL GROUP BY period, day
),
ss AS (SELECT period, day, COUNT(*) AS sessions FROM sessions WHERE period IS NOT NULL GROUP BY period, day)
SELECT period, CAST(day AS STRING) AS day,
  IFNULL(visitors, 0) AS visitors, IFNULL(sessions, 0) AS sessions,
  IFNULL(pageviews, 0) AS pageviews, IFNULL(errors, 0) AS errors
FROM ev FULL JOIN ss USING (period, day)
ORDER BY period, day`;
  return toSpec(sql, ctx.params);
}

const HOST = "LOWER(NET.HOST(first_pv.referrer))";

/** Fixed SQL per dimension (no input). Event level counts pageview events; session level counts sessions. */
const DIM_SQL: Record<BreakdownDim, { level: "event"; column: EventColumn } | { level: "session"; expr: string }> = {
  page: { level: "event", column: "page_path" },
  country: { level: "event", column: "country" },
  device: { level: "event", column: "device_type" },
  browser: { level: "event", column: "browser" },
  os: { level: "event", column: "os" },
  entry_page: { level: "session", expr: "first_pv.page_path" },
  source: {
    level: "session",
    expr: `IF(IFNULL(${HOST}, '') = '' OR ${HOST} IN UNNEST(@own_hosts), 'direct', ${HOST})`,
  },
  utm: {
    level: "session",
    expr: `IF(COALESCE(first_pv.utm_source, first_pv.utm_medium, first_pv.utm_campaign) IS NULL, '(none)',
      CONCAT(IFNULL(first_pv.utm_source, '-'), ' / ', IFNULL(first_pv.utm_medium, '-'), ' / ', IFNULL(first_pv.utm_campaign, '-')))`,
  },
};

export function breakdownQuery(ctx: QueryContext, dim: BreakdownDim): QuerySpec {
  const d = DIM_SQL[dim];
  const head =
    d.level === "event"
      ? `${eventsCte(ctx.table, ["event_name", "timestamp", "visitor_id", d.column])},
items AS (
  SELECT period, day, IFNULL(${d.column}, '(none)') AS value, visitor_id, 1 AS pv
  FROM evp WHERE event_name = ${PV} AND period IS NOT NULL
)`
      : `${eventsCte(ctx.table, SESSION_COLUMNS)},
${sessionsCte()},
items AS (
  SELECT period, day, IFNULL(${d.expr}, '(none)') AS value, visitor_id, pageviews AS pv
  FROM sessions WHERE period IS NOT NULL
)`;
  // Other is a bucket computed in SQL, not total minus top 20: distinct counts do not add up.
  const sql = `WITH ${head},
top AS (SELECT value FROM items WHERE period = 'cur' GROUP BY value ORDER BY SUM(pv) DESC, value LIMIT 20),
bucketed AS (SELECT r.period, r.day, t.value AS value, r.visitor_id, r.pv FROM items r LEFT JOIN top t USING (value)),
daily AS (
  SELECT period, value, day, SUM(pv) AS pv, COUNT(DISTINCT visitor_id) AS v
  FROM bucketed GROUP BY period, value, day
)
SELECT period, value, SUM(pv) AS pageviews, SUM(v) AS visitor_days
FROM daily GROUP BY period, value`;
  return dim === "source"
    ? toSpec(sql, { ...ctx.params, own_hosts: [...ctx.hosts] }, { own_hosts: ["STRING"] })
    : toSpec(sql, ctx.params);
}

export function webVitalsQuery(ctx: QueryContext): QuerySpec {
  const sql = `WITH ${eventsCte(ctx.table, ["event_name", "timestamp", "props"])}
SELECT period, LAX_STRING(props.metric) AS metric,
  APPROX_QUANTILES(LAX_FLOAT64(props.value), 100)[OFFSET(75)] AS p75, COUNT(*) AS samples
FROM evp
WHERE event_name = ${VITAL} AND period IS NOT NULL AND LAX_STRING(props.metric) IN ('LCP', 'INP', 'CLS')
GROUP BY period, metric`;
  return toSpec(sql, ctx.params);
}

export function slowPagesQuery(ctx: QueryContext): QuerySpec {
  const sql = `WITH ${eventsCte(ctx.table, ["event_name", "timestamp", "page_path", "props"])}
SELECT IFNULL(page_path, '(none)') AS page_path,
  APPROX_QUANTILES(LAX_FLOAT64(props.value), 100)[OFFSET(75)] AS p75, COUNT(*) AS samples
FROM evp
WHERE event_name = ${VITAL} AND period = 'cur' AND LAX_STRING(props.metric) = 'LCP'
GROUP BY page_path
HAVING COUNT(*) >= 5
ORDER BY p75 DESC
LIMIT 10`;
  return toSpec(sql, ctx.params);
}

export function topErrorsQuery(ctx: QueryContext): QuerySpec {
  const sql = `WITH ${eventsCte(ctx.table, ["event_name", "timestamp", "props"])}
SELECT IFNULL(LAX_STRING(props.message), '(no message)') AS message, COUNT(*) AS occurrences,
  FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', MAX(timestamp), @tz) AS last_seen
FROM evp
WHERE event_name = ${ERR} AND period = 'cur'
GROUP BY message
ORDER BY occurrences DESC, message
LIMIT 10`;
  return toSpec(sql, ctx.params);
}

export function consentQuery(ctx: QueryContext): QuerySpec {
  const sql = `WITH ${eventsCte(ctx.table, ["event_name", "timestamp", "consent_state"])}
SELECT period, IFNULL(consent_state, 'unknown') AS consent_state, COUNT(*) AS pageviews
FROM evp
WHERE event_name = ${PV} AND period IS NOT NULL
GROUP BY period, consent_state`;
  return toSpec(sql, ctx.params);
}

/**
 * Weekly cohorts of persistent people new in the range (no event in the 28 days before `from`). No
 * previous period. DATE_DIFF(..., WEEK) counts Sunday weeks, so the day difference is divided by 7.
 */
export function retentionQuery(ctx: QueryContext): QuerySpec {
  const sql = `WITH persistent AS (
  SELECT COALESCE(user_id, visitor_id) AS person, timestamp
  FROM ${ctx.table}
  WHERE app_id = @app_id AND timestamp >= TIMESTAMP(@lookback_ts) AND timestamp < TIMESTAMP(@to_ts)
    AND ${persistentCond()}
),
new_people AS (
  SELECT person, DATE_TRUNC(DATE(MIN(timestamp), @tz), WEEK(MONDAY)) AS cohort_week
  FROM persistent GROUP BY person
  HAVING MIN(timestamp) >= TIMESTAMP(@from_ts)
),
activity AS (
  SELECT DISTINCT person, DATE_TRUNC(DATE(timestamp, @tz), WEEK(MONDAY)) AS week
  FROM persistent WHERE timestamp >= TIMESTAMP(@from_ts)
)
SELECT CAST(n.cohort_week AS STRING) AS cohort, DIV(DATE_DIFF(a.week, n.cohort_week, DAY), 7) AS week_n,
  COUNT(DISTINCT a.person) AS people
FROM new_people n JOIN activity a USING (person)
GROUP BY 1, 2
ORDER BY 1, 2`;
  return toSpec(sql, { ...ctx.params, lookback_ts: dayStart(addDays(ctx.range.from, -28), ctx.tz) });
}
