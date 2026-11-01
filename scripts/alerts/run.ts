/**
 * One alert check for all configured apps (spec 2026-10-31-launch-package, part 3). Runs in GitHub Actions.
 * Usage: npx tsx scripts/alerts/run.ts [--dry]  (--dry only prints what it would do, with numbers: local use only)
 * Exit code 1: a problem started and no email was sent, so GitHub's "run failed" email is the alert. Also on any crash.
 */
import { BigQuery } from "@google-cloud/bigquery";
import { ALERT_APPS, BQ_LOCATION, CLEAR_AFTER_RUNS, MAX_BYTES_PER_RUN, PROJECT_ID } from "./config";
import { METRICS_SQL, toMetrics, type MetricRow } from "./metrics";
import { emailText, publicLines, sendEmail, type AppChanges } from "./notify";
import { evaluate, transition } from "./rules";
import { readOpenProblems, saveOpenProblems, sameProblems } from "./state";

const dry = process.argv.includes("--dry");
const bq = new BigQuery({ projectId: PROJECT_ID });
const now = new Date().toISOString();
const openByApp = await readOpenProblems(bq);
const changes: AppChanges[] = [];
const saves: Array<() => Promise<void>> = [];

for (const { appId, thresholds } of ALERT_APPS) {
  const [rows] = await bq.query({
    query: METRICS_SQL,
    params: { app_id: appId, now },
    location: BQ_LOCATION,
    maximumBytesBilled: String(MAX_BYTES_PER_RUN),
    labels: { rtd_source: "alerts" },
  });
  const firing = evaluate(toMetrics(rows as MetricRow[]), thresholds);
  const previous = openByApp.get(appId) ?? [];
  const step = transition(firing, previous, now, CLEAR_AFTER_RUNS);
  if (dry) console.log(appId, JSON.stringify(firing), JSON.stringify(step.open));
  if (step.started.length > 0 || step.ended.length > 0) {
    changes.push({ appId, started: step.started, ended: step.ended });
  }
  if (!sameProblems(previous, step.open)) saves.push(() => saveOpenProblems(bq, appId, step.open));
}

if (dry) process.exit(0);

// The message goes out before the state is saved: a crash in between sends it twice, and never loses it.
for (const line of publicLines(changes)) console.log(line);
const apiKey = process.env.RESEND_API_KEY;
let alertByFailedRun = false;
if (changes.length > 0) {
  if (apiKey) {
    await sendEmail(emailText(changes), {
      apiKey,
      to: process.env.ALERT_EMAIL_TO ?? "",
      from: process.env.ALERT_EMAIL_FROM ?? "",
    });
  } else {
    alertByFailedRun = changes.some((c) => c.started.length > 0);
  }
}
for (const save of saves) await save();
if (alertByFailedRun) {
  console.error("A problem started. Open the dashboard for the numbers.");
  process.exit(1);
}
