// The period model shared by every data query (spec section 6). One query reads one window
// [read_from, read_to) and labels each event or session 'cur', 'prev' or NULL in SQL, so the range and the
// previous period come from the same scan. All params depend only on the range, today's date and settings,
// never on the time of day, so cached entries stay valid all day.
import { DAILY_VISITOR_PREFIX, EVENTS, type EventRow } from "rt-analytics/schema";
import type { QueryName, QueryParam, QuerySpec } from "@/bq/run-query";
import type { AppSettings } from "@/config/settings";
import { addDays, dayStart, previousRange, rangeDays, type DateRange } from "@/time/range";

export type Period = "cur" | "prev";
export type EventColumn = keyof EventRow & string;

export interface PeriodParams {
  app_id: string;
  tz: string;
  from_ts: string;
  to_ts: string;
  prev_from_ts: string;
  prev_to_ts: string;
  prev_last_day_start: string;
  today_start: string;
  partial_today: boolean;
  compare: boolean;
  read_from_ts: string;
  read_to_ts: string;
}

export interface QueryContext {
  /** Backquoted events table from readEnv(). */
  table: string;
  appId: string;
  tz: string;
  hosts: readonly string[];
  range: DateRange;
  prev: DateRange;
  compare: boolean;
  today: string;
  days: number;
  params: PeriodParams;
}

export function buildContext(input: {
  table: string;
  appId: string;
  settings: AppSettings;
  range: DateRange;
  compare: boolean;
  today: string;
}): QueryContext {
  const { table, appId, settings, range, compare, today } = input;
  const tz = settings.timezone;
  const prev = previousRange(range);
  const start = (day: string) => dayStart(day, tz);
  return {
    table,
    appId,
    tz,
    hosts: settings.hosts,
    range,
    prev,
    compare,
    today,
    days: rangeDays(range),
    params: {
      app_id: appId,
      tz,
      from_ts: start(range.from),
      to_ts: start(addDays(range.to, 1)),
      prev_from_ts: start(prev.from),
      prev_to_ts: start(addDays(prev.to, 1)),
      prev_last_day_start: start(prev.to),
      today_start: start(range.to),
      partial_today: range.to === today,
      compare,
      read_from_ts: start(addDays(compare ? prev.from : range.from, -1)),
      read_to_ts: start(addDays(range.to, 2)),
    },
  };
}

// When the range includes today, the previous period's last day is cut at the same time of day.
const PREV_END = `IF(@partial_today,
    TIMESTAMP_ADD(TIMESTAMP(@prev_last_day_start), INTERVAL TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), TIMESTAMP(@today_start), SECOND) SECOND),
    TIMESTAMP(@prev_to_ts))`;

/** SQL expression: 'cur', 'prev' or NULL for the timestamp expression `ts`. */
export function periodOf(ts: string): string {
  return `CASE
    WHEN ${ts} >= TIMESTAMP(@from_ts) AND ${ts} < TIMESTAMP(@to_ts) THEN 'cur'
    WHEN @compare AND ${ts} >= TIMESTAMP(@prev_from_ts) AND ${ts} < ${PREV_END} THEN 'prev'
  END`;
}

/** evp: the app's events in the read window, with the event's own period and local day. */
export function eventsCte(table: string, columns: readonly EventColumn[]): string {
  return `evp AS (
  SELECT ${columns.join(", ")}, ${periodOf("timestamp")} AS period, DATE(timestamp, @tz) AS day
  FROM ${table}
  WHERE app_id = @app_id AND timestamp >= TIMESTAMP(@read_from_ts) AND timestamp < TIMESTAMP(@read_to_ts)
)`;
}

/** Columns sessionsCte() needs in evp. */
export const SESSION_COLUMNS = [
  "event_name",
  "timestamp",
  "session_id",
  "visitor_id",
  "user_id",
  "page_path",
  "referrer",
  "utm_source",
  "utm_medium",
  "utm_campaign",
] as const satisfies readonly EventColumn[];

/** Persistent identity (spec section 6, "Identity kinds"). `p` is an optional table alias with a dot. */
export const persistentCond = (p = "") =>
  `(${p}user_id IS NOT NULL OR (${p}visitor_id IS NOT NULL AND NOT STARTS_WITH(${p}visitor_id, '${DAILY_VISITOR_PREFIX}')))`;

/** sessions: a session_id with at least one pageview; it belongs to the period and day of its first event. */
export function sessionsCte(): string {
  return `sessions AS (
  SELECT *, ${periodOf("start_ts")} AS period, DATE(start_ts, @tz) AS day
  FROM (
    SELECT
      session_id,
      MIN(timestamp) AS start_ts,
      COUNTIF(event_name = '${EVENTS.pageview}') AS pageviews,
      MAX(visitor_id) AS visitor_id,
      LOGICAL_OR(${persistentCond()}) AS persistent,
      ARRAY_AGG(STRUCT(page_path, referrer, utm_source, utm_medium, utm_campaign)
        ORDER BY IF(event_name = '${EVENTS.pageview}', 0, 1), timestamp LIMIT 1)[OFFSET(0)] AS first_pv
    FROM evp
    WHERE session_id IS NOT NULL
    GROUP BY session_id
    HAVING COUNTIF(event_name = '${EVENTS.pageview}') > 0
  )
)`;
}

/** Keeps only the params the SQL references, so unrelated values never split the cache key. */
export function toSpec(
  name: QueryName,
  sql: string,
  params: Record<string, QueryParam> | PeriodParams,
  types?: Record<string, string | string[]>,
): QuerySpec {
  const used = Object.entries(params).filter(([param]) => new RegExp(`@${param}\\b`).test(sql));
  return { name, sql, params: Object.fromEntries(used), ...(types ? { types } : {}) };
}
