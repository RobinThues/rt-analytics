// Goal conversion per source, entry page and device (spec 2026-10-31-launch-package, part 5). A session converts
// when it has the goal event. Runs only for apps with a goal.
import type { QuerySpec } from "@/bq/run-query";
import type { Goal } from "@/config/settings";
import { eventsCte, SESSION_COLUMNS, sessionsCte, toSpec, type Period, type QueryContext } from "./context";
import { sourceExpr } from "./source";

export type GoalDim = "total" | "source" | "entry_page" | "device";

/** `value` NULL means Other (everything outside the top 10). Every dim has its own rows. */
export interface GoalRow {
  dim: GoalDim;
  period: Period;
  value: string | null;
  sessions: number;
  conversions: number;
}

const TOP_VALUES = 10;

export function goalQuery(ctx: QueryContext, goal: Goal): QuerySpec {
  const sql = `WITH ${eventsCte(ctx.table, [...SESSION_COLUMNS, "in_app", "device_type"])},
${sessionsCte({
  firstPvColumns: ["in_app", "device_type"],
  select: "COUNTIF(event_name = @goal_event) > 0 AS converted",
})},
items AS (
  SELECT 'total' AS dim, period, 'all' AS value, converted FROM sessions WHERE period IS NOT NULL
  UNION ALL
  SELECT 'source' AS dim, period, ${sourceExpr("first_pv")} AS value, converted FROM sessions WHERE period IS NOT NULL
  UNION ALL
  SELECT 'entry_page' AS dim, period, IFNULL(first_pv.page_path, '(none)') AS value, converted FROM sessions WHERE period IS NOT NULL
  UNION ALL
  SELECT 'device' AS dim, period, IFNULL(first_pv.device_type, '(none)') AS value, converted FROM sessions WHERE period IS NOT NULL
),
top AS (
  SELECT dim, value FROM (
    SELECT dim, value, ROW_NUMBER() OVER (PARTITION BY dim ORDER BY COUNT(*) DESC, value) AS rank
    FROM items WHERE period = 'cur' GROUP BY dim, value
  ) WHERE rank <= ${TOP_VALUES}
)
SELECT i.dim, i.period, t.value AS value, COUNT(*) AS sessions, COUNTIF(i.converted) AS conversions
FROM items i LEFT JOIN top t USING (dim, value)
GROUP BY i.dim, i.period, t.value`;
  return toSpec(
    "goals",
    sql,
    { ...ctx.params, goal_event: goal.event, own_hosts: [...ctx.hosts] },
    { own_hosts: ["STRING"] },
  );
}

export interface GoalLine {
  label: string;
  isOther: boolean;
  sessions: number;
  conversions: number;
  rate: number;
  /** null: no sessions in the previous period, or Compare is off. */
  prevRate: number | null;
}

const rateOf = (conversions: number, sessions: number) => (sessions > 0 ? conversions / sessions : 0);

/** One table's lines: most sessions first, Other last. A value only in the previous period goes into no line. */
export function goalLines(rows: readonly GoalRow[], dim: Exclude<GoalDim, "total">): GoalLine[] {
  const own = rows.filter((r) => r.dim === dim);
  const prev = new Map(own.filter((r) => r.period === "prev").map((r) => [r.value, r]));
  return own
    .filter((r) => r.period === "cur")
    .map((r) => {
      const p = prev.get(r.value);
      return {
        label: r.value ?? "Other",
        isOther: r.value === null,
        sessions: r.sessions,
        conversions: r.conversions,
        rate: rateOf(r.conversions, r.sessions),
        prevRate: p && p.sessions > 0 ? rateOf(p.conversions, p.sessions) : null,
      };
    })
    .sort((a, b) => Number(a.isOther) - Number(b.isOther) || b.sessions - a.sessions || a.label.localeCompare(b.label));
}

export interface GoalTotals {
  sessions: number;
  conversions: number;
  rate: number;
  prevSessions: number;
  prevConversions: number;
  prevRate: number;
}

/** A period without rows had no sessions, so its numbers are 0. */
export function goalTotals(rows: readonly GoalRow[]): GoalTotals {
  const of = (period: Period) => rows.find((r) => r.dim === "total" && r.period === period);
  const cur = of("cur");
  const prev = of("prev");
  return {
    sessions: cur?.sessions ?? 0,
    conversions: cur?.conversions ?? 0,
    rate: rateOf(cur?.conversions ?? 0, cur?.sessions ?? 0),
    prevSessions: prev?.sessions ?? 0,
    prevConversions: prev?.conversions ?? 0,
    prevRate: rateOf(prev?.conversions ?? 0, prev?.sessions ?? 0),
  };
}
