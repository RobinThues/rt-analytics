// The alert rules (spec 2026-10-31-launch-package, part 3). Pure: numbers in, firing rules out, and the state
// machine that turns them into one message per problem. Used by the job and by the backtest.

export type RuleId =
  "error_share" | "route_failures" | "silent_all" | "silent_pageviews" | "traffic_spike" | "traffic_drop";

export interface Thresholds {
  errorShare: { share: number; minErrorSessions: number };
  routeFailures: { minFailures: number };
  silentAll: { minutes: number };
  silentPageviews: { minBaseline: number };
  trafficSpike: { factor: number; minPageviews: number };
  trafficDrop: { share: number; minBaseline: number };
}

/** One app's numbers for the last 60 minutes. */
export interface Metrics {
  pageviews: number;
  sessions: number;
  errorSessions: number;
  /** Failures per route, from SUM(count). */
  failures: Readonly<Record<string, number>>;
  /** Minutes since the last event of any kind, or null when there is none in the read window. */
  minutesSinceLastEvent: number | null;
  /** Pageviews in the same 60 minutes on each of the previous 7 days. */
  baselinePageviews: readonly number[];
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A firing rule, with the numbers for the private email. Logs get only `key`. */
export interface Firing {
  /** The rule, plus the route for route_failures: each route is its own problem. */
  key: string;
  rule: RuleId;
  detail: string;
}

export function evaluate(m: Metrics, t: Thresholds): Firing[] {
  const out: Firing[] = [];
  const base = median(m.baselinePageviews);
  const share = m.sessions > 0 ? m.errorSessions / m.sessions : 0;

  if (m.errorSessions >= t.errorShare.minErrorSessions && share >= t.errorShare.share) {
    out.push({
      key: "error_share",
      rule: "error_share",
      detail: `${m.errorSessions} of ${m.sessions} sessions had an error in the last hour (${Math.round(share * 100)} %).`,
    });
  }
  for (const [route, failures] of Object.entries(m.failures)) {
    if (failures >= t.routeFailures.minFailures) {
      out.push({
        key: `route_failures:${route}`,
        rule: "route_failures",
        detail: `${route} failed ${failures} times in the last hour.`,
      });
    }
  }
  const silent = m.minutesSinceLastEvent === null || m.minutesSinceLastEvent >= t.silentAll.minutes;
  if (silent) {
    out.push({
      key: "silent_all",
      rule: "silent_all",
      detail:
        m.minutesSinceLastEvent === null
          ? "No events at all in the read window."
          : `No events of any kind for ${Math.round(m.minutesSinceLastEvent)} minutes.`,
    });
  }
  // silent_all already says it when nothing arrives, so this one is about browsers only.
  if (!silent && m.pageviews === 0 && base >= t.silentPageviews.minBaseline) {
    out.push({
      key: "silent_pageviews",
      rule: "silent_pageviews",
      detail: `0 pageviews in the last hour, while server events still arrive. This hour normally has ${base}.`,
    });
  }
  if (m.pageviews >= t.trafficSpike.minPageviews && m.pageviews >= base * t.trafficSpike.factor) {
    out.push({
      key: "traffic_spike",
      rule: "traffic_spike",
      detail: `${m.pageviews} pageviews in the last hour. This hour normally has ${base}.`,
    });
  }
  if (m.pageviews > 0 && base >= t.trafficDrop.minBaseline && m.pageviews < base * t.trafficDrop.share) {
    out.push({
      key: "traffic_drop",
      rule: "traffic_drop",
      detail: `${m.pageviews} pageviews in the last hour. This hour normally has ${base}.`,
    });
  }
  return out;
}

/** The stored state of a problem that is open. A key without state is not firing. */
export interface OpenProblem {
  key: string;
  since: string;
  /** Runs in a row without the rule firing. */
  cleanRuns: number;
}

export interface Transition {
  /** Problems that started on this run: one message each. */
  started: Firing[];
  /** Problems that ended on this run. */
  ended: OpenProblem[];
  /** The state to store for the next run. */
  open: OpenProblem[];
}

/** A rule fires at once and clears after `clearAfterRuns` clean runs in a row, so a noisy value doesn't flap. */
export function transition(
  firing: readonly Firing[],
  previous: readonly OpenProblem[],
  now: string,
  clearAfterRuns: number,
): Transition {
  const firingKeys = new Set(firing.map((f) => f.key));
  const previousKeys = new Set(previous.map((p) => p.key));
  const started = firing.filter((f) => !previousKeys.has(f.key));
  const ended: OpenProblem[] = [];
  const open: OpenProblem[] = started.map((f) => ({ key: f.key, since: now, cleanRuns: 0 }));
  for (const p of previous) {
    if (firingKeys.has(p.key)) {
      open.push({ ...p, cleanRuns: 0 });
    } else if (p.cleanRuns + 1 >= clearAfterRuns) {
      ended.push(p);
    } else {
      open.push({ ...p, cleanRuns: p.cleanRuns + 1 });
    }
  }
  return { started, ended, open };
}
