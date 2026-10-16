// Session funnel (spec section 7): steps in order within one session. Step 1 is the first occurrence of
// event 1; step k is the first occurrence of event k strictly after step k-1. A session belongs to the
// period of its first event; later steps may happen up to one day past `to` (the read window).
import { EVENTS } from "rt-analytics/schema";
import type { QueryParam, QuerySpec } from "@/bq/run-query";
import type { FunnelStep } from "@/funnels/steps";
import { eventsCte, periodOf, toSpec, type QueryContext } from "./context";

function cond(step: FunnelStep, k: number): string {
  const event = `ev.event_name = @e${k}`;
  if (!step.filter) return event;
  if (step.event === EVENTS.pageview) return `${event} AND ev.page_path = @v${k}`;
  return `${event} AND LAX_STRING(ev.props[@k${k}]) = @v${k}`;
}

export function funnelQuery(ctx: QueryContext, steps: readonly FunnelStep[]): QuerySpec {
  const params: Record<string, QueryParam> = { ...ctx.params };
  steps.forEach((s, i) => {
    const k = i + 1;
    params[`e${k}`] = s.event;
    if (s.filter) {
      if (s.event !== EVENTS.pageview) params[`k${k}`] = s.filter.key;
      params[`v${k}`] = s.filter.value;
    }
  });
  const stepCtes = steps.map((s, i) => {
    const k = i + 1;
    return k === 1
      ? `s1 AS (
  SELECT session_id, ANY_VALUE(period) AS period, MIN(timestamp) AS t
  FROM ev WHERE period IS NOT NULL AND ${cond(s, 1)}
  GROUP BY session_id
)`
      : `s${k} AS (
  SELECT s${k - 1}.session_id, ANY_VALUE(s${k - 1}.period) AS period, MIN(ev.timestamp) AS t
  FROM s${k - 1} JOIN ev ON ev.session_id = s${k - 1}.session_id AND ev.timestamp > s${k - 1}.t
  WHERE ${cond(s, k)}
  GROUP BY s${k - 1}.session_id
)`;
  });
  const counts = steps
    .map((_, i) => `SELECT period, ${i + 1} AS step, COUNT(*) AS sessions FROM s${i + 1} GROUP BY period`)
    .join("\nUNION ALL\n");
  const sql = `WITH ${eventsCte(ctx.table, ["event_name", "timestamp", "session_id", "page_path", "props"])},
sessions AS (
  SELECT session_id, MIN(timestamp) AS start_ts FROM evp
  WHERE session_id IS NOT NULL
  GROUP BY session_id
  HAVING COUNTIF(event_name = '${EVENTS.pageview}') > 0
),
ev AS (
  SELECT e.session_id, e.timestamp, e.event_name, e.page_path, e.props, ${periodOf("s.start_ts")} AS period
  FROM evp e JOIN sessions s USING (session_id)
),
${stepCtes.join(",\n")}
${counts}`;
  return toSpec(sql, params);
}
