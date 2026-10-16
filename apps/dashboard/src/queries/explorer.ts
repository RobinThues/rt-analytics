// Events explorer (spec section 7, "Events explorer"): any app event, one metric, at most one filter,
// breakdown by one prop. Event names, prop keys and values are always parameters.
import { BUILTIN_PREFIX, EVENTS } from "rt-analytics/schema";
import type { QuerySpec } from "@/bq/run-query";
import { eventsCte, toSpec, type Period, type QueryContext } from "./context";

export type Metric =
  { kind: "events" } | { kind: "sessions" } | { kind: "visitors" } | { kind: "distinct"; key: string };

export interface ExplorerSelection {
  event: string;
  metric: Metric;
  filter: { key: string; value: string } | null;
  by: string | null;
}

export interface EventListRow {
  period: Period;
  event_name: string;
  day: string;
  events: number;
}

/** `day` NULL is the range total of that period. */
export interface MetricRow {
  period: Period;
  day: string | null;
  n: number;
}

/** `value` NULL means Other (everything outside the top 20). */
export type BreakdownMetricRow = MetricRow & { value: string | null };

const PV = `'${EVENTS.pageview}'`;

export function eventListQuery(ctx: QueryContext): QuerySpec {
  const sql = `WITH ${eventsCte(ctx.table, ["event_name", "timestamp"])}
SELECT period, event_name, CAST(day AS STRING) AS day, COUNT(*) AS events
FROM evp
WHERE period IS NOT NULL AND NOT STARTS_WITH(event_name, '${BUILTIN_PREFIX}')
GROUP BY period, event_name, day`;
  return toSpec(sql, ctx.params);
}

const METRIC_SQL: Record<Metric["kind"], string> = {
  events: "COUNT(*)",
  sessions: "COUNT(DISTINCT pv_session)",
  visitors: "COUNT(DISTINCT visitor_id)",
  distinct: "COUNT(DISTINCT LAX_STRING(props[@metric_key]))",
};

/**
 * The selected event's rows with period and day (by the event's own day). For the sessions metric, only
 * sessions that have a pageview count (spec section 6, "Sessions").
 */
function selectionCtes(ctx: QueryContext, sel: ExplorerSelection): string {
  const sessions = sel.metric.kind === "sessions";
  return `${eventsCte(ctx.table, ["event_name", "timestamp", "visitor_id", "session_id", "props"])},
${sessions ? `pv_sessions AS (SELECT DISTINCT session_id FROM evp WHERE event_name = ${PV} AND session_id IS NOT NULL),` : ""}
sel AS (
  SELECT e.period, e.day, e.visitor_id, e.props${sessions ? ", ps.session_id AS pv_session" : ""}
  FROM evp e${sessions ? " LEFT JOIN pv_sessions ps USING (session_id)" : ""}
  WHERE e.event_name = @event AND e.period IS NOT NULL${sel.filter ? " AND LAX_STRING(e.props[@filter_key]) = @filter_value" : ""}
)`;
}

function selectionParams(ctx: QueryContext, sel: ExplorerSelection) {
  return {
    ...ctx.params,
    event: sel.event,
    ...(sel.metric.kind === "distinct" ? { metric_key: sel.metric.key } : {}),
    ...(sel.filter ? { filter_key: sel.filter.key, filter_value: sel.filter.value } : {}),
  };
}

export function eventSeriesQuery(ctx: QueryContext, sel: ExplorerSelection): QuerySpec {
  const sql = `WITH ${selectionCtes(ctx, sel)}
SELECT period, CAST(day AS STRING) AS day, ${METRIC_SQL[sel.metric.kind]} AS n
FROM sel
GROUP BY GROUPING SETS ((period, day), (period))`;
  return toSpec(sql, selectionParams(ctx, sel));
}

export function eventBreakdownQuery(ctx: QueryContext, sel: ExplorerSelection & { by: string }): QuerySpec {
  // Other is a bucket in SQL, not total minus top 20: distinct counts do not add up.
  const sql = `WITH ${selectionCtes(ctx, sel)},
valued AS (SELECT *, IFNULL(LAX_STRING(props[@by_key]), '(none)') AS by_value FROM sel),
top AS (SELECT by_value FROM valued WHERE period = 'cur' GROUP BY by_value ORDER BY COUNT(*) DESC, by_value LIMIT 20),
bucketed AS (SELECT v.*, t.by_value AS value FROM valued v LEFT JOIN top t USING (by_value))
SELECT period, value, CAST(day AS STRING) AS day, ${METRIC_SQL[sel.metric.kind]} AS n
FROM bucketed
GROUP BY GROUPING SETS ((period, value, day), (period, value))`;
  return toSpec(sql, { ...selectionParams(ctx, sel), by_key: sel.by });
}

export interface PropValueRow {
  key: string;
  value: string;
}

/**
 * Top 20 values of each of the event's prop keys in the current range, so the filter picker can offer
 * values for any key before it is applied. One scan for all keys.
 */
export function propValuesQuery(ctx: QueryContext, event: string, keys: readonly string[]): QuerySpec {
  const sql = `WITH ${eventsCte(ctx.table, ["event_name", "timestamp", "props"])},
counted AS (
  SELECT k AS key, LAX_STRING(props[k]) AS value, COUNT(*) AS n
  FROM evp, UNNEST(@value_keys) AS k
  WHERE event_name = @event AND period = 'cur' AND LAX_STRING(props[k]) IS NOT NULL
  GROUP BY key, value
),
ranked AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY key ORDER BY n DESC, value) AS rn FROM counted)
SELECT key, value FROM ranked WHERE rn <= 20
ORDER BY key, rn`;
  return toSpec(sql, { ...ctx.params, event, value_keys: [...keys] }, { value_keys: ["STRING"] });
}
