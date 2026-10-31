/**
 * Runs the alert rules over past days, to set their values. One BigQuery job, read-only.
 * Usage: npx tsx scripts/alerts/backtest.ts [--app <id>] [--from YYYY-MM-DD]
 * It works per full hour, so it is a little coarser than the real job, which looks at the last 60 minutes every 15.
 * Route failures are not in old rows, so that rule can't be tested here.
 */
import { BigQuery } from "@google-cloud/bigquery";
import { ALERT_APPS, BQ_LOCATION, CLEAR_AFTER_RUNS, EVENTS_TABLE, PROJECT_ID, WETTER_THRESHOLDS } from "./config";
import { evaluate, transition, type OpenProblem } from "./rules";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const appId = flag("--app") ?? ALERT_APPS[0]!.appId;
const from = flag("--from") ?? "2026-10-13";
const thresholds = ALERT_APPS.find((a) => a.appId === appId)?.thresholds ?? WETTER_THRESHOLDS;
const HOUR = 3_600_000;

interface HourRow {
  hour: { value: string };
  events: number;
  pageviews: number;
  sessions: number;
  error_sessions: number;
}

const [result] = await new BigQuery({ projectId: PROJECT_ID }).query({
  query: `SELECT TIMESTAMP_TRUNC(timestamp, HOUR) AS hour, COUNT(*) AS events, COUNTIF(event_name = '$pageview') AS pageviews,
  COUNT(DISTINCT IF(event_name = '$pageview', session_id, NULL)) AS sessions,
  COUNT(DISTINCT IF(event_name = '$error', session_id, NULL)) AS error_sessions
FROM ${EVENTS_TABLE}
WHERE app_id = @app_id AND timestamp >= TIMESTAMP(@from)
GROUP BY hour ORDER BY hour`,
  params: { app_id: appId, from },
  location: BQ_LOCATION,
  maximumBytesBilled: String(500 * 1024 * 1024),
});
const rows = result as HourRow[];

const byHour = new Map(rows.map((r) => [Date.parse(r.hour.value), r]));
const start = Date.parse(rows[0]!.hour.value);
const end = Date.parse(rows[rows.length - 1]!.hour.value);
const local = (ms: number) =>
  new Date(ms).toLocaleString("sv-SE", { timeZone: "Europe/Berlin", hour12: false }).slice(0, 16);

let open: OpenProblem[] = [];
let lastEvent = start;
let starts = 0;
for (let at = start; at <= end; at += HOUR) {
  const r = byHour.get(at);
  if (r && r.events > 0) lastEvent = at;
  const firing = evaluate(
    {
      pageviews: r?.pageviews ?? 0,
      sessions: r?.sessions ?? 0,
      errorSessions: r?.error_sessions ?? 0,
      failures: {},
      // Hour rows only: 0 when the hour has events, else the hours since the last one with events.
      minutesSinceLastEvent: (at - lastEvent) / 60_000,
      baselinePageviews: [1, 2, 3, 4, 5, 6, 7].map((d) => byHour.get(at - d * 24 * HOUR)?.pageviews ?? 0),
    },
    thresholds,
  );
  // 4 clean runs of 15 minutes are 1 hour, and this loop has one run per hour.
  const step = transition(firing, open, new Date(at).toISOString(), Math.ceil(CLEAR_AFTER_RUNS / 4));
  for (const f of step.started) {
    starts += 1;
    console.log(`${local(at)}  START  ${f.key.padEnd(18)} ${f.detail}`);
  }
  for (const p of step.ended) console.log(`${local(at)}  end    ${p.key}`);
  open = step.open;
}
console.log(`\n${starts} problems started in ${Math.round((end - start) / HOUR / 24)} days.`);
