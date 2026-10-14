// Usage: npm run demo:generate -- [--days 90] [--seed 42] [--project <id>] [--dataset analytics] [--replace] [--dry-run]
// Generates demo events (app_id "demo", dwd profile) for the given number of days ending yesterday (UTC) and
// loads them into <dataset>.events with a BigQuery load job (free). Uses your gcloud application default
// credentials. Refuses when older demo rows exist, unless --replace (deletes demo rows before today first).
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { BigQuery } from "@google-cloud/bigquery";
import { dwdProfile } from "./demo/dwd-profile.js";
import { planLoad } from "./demo/load-plan.js";
import { toNdjsonLine } from "./demo/ndjson.js";
import { generateDemoEvents } from "./demo/simulate.js";

const DAY_MS = 86_400_000;
const { values } = parseArgs({
  options: {
    days: { type: "string", default: "90" },
    seed: { type: "string", default: "42" },
    project: { type: "string" },
    dataset: { type: "string", default: "analytics" },
    replace: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

const days = Number(values.days);
const seed = Number(values.seed);
if (!Number.isInteger(days) || days < 1 || !Number.isInteger(seed)) {
  console.error("--days and --seed must be whole numbers, --days at least 1");
  process.exit(2);
}
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const from = new Date(today.getTime() - days * DAY_MS);
const rows = generateDemoEvents(dwdProfile, { from, days, seed });

const counts = new Map<string, number>();
for (const r of rows) counts.set(r.event_name, (counts.get(r.event_name) ?? 0) + 1);
const lastDay = new Date(today.getTime() - DAY_MS).toISOString().slice(0, 10);
console.log(`${rows.length} rows from ${from.toISOString().slice(0, 10)} to ${lastDay}`);
for (const [name, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${name.padEnd(16)} ${n}`);
if (values["dry-run"]) process.exit(0);

const project =
  values.project ?? execFileSync("gcloud", ["config", "get-value", "project"], { encoding: "utf8" }).trim();
const table = `\`${project}.${values.dataset}.events\``;
const bq = new BigQuery({ projectId: project, location: "EU" });
const params = { app: dwdProfile.appId, before: today };

const [countRows] = await bq.query({
  query: `SELECT COUNT(*) AS n FROM ${table} WHERE app_id = @app AND timestamp < @before`,
  params,
});
const existing = Number((countRows as Array<{ n: number }>)[0]?.n ?? 0);
const plan = planLoad(existing, values.replace);
if (plan === "refuse") {
  console.error(`${existing} demo rows before today already exist in ${table}. Run again with --replace.`);
  process.exit(1);
}
if (plan === "replace-then-load") {
  await bq.query({ query: `DELETE FROM ${table} WHERE app_id = @app AND timestamp < @before`, params });
  console.log(`deleted ${existing} old demo rows`);
}

const dir = mkdtempSync(join(tmpdir(), "rta-demo-"));
const file = join(dir, "events.ndjson");
try {
  writeFileSync(file, rows.map(toNdjsonLine).join("\n") + "\n");
  const [job] = await bq.dataset(values.dataset).table("events").load(file, {
    sourceFormat: "NEWLINE_DELIMITED_JSON",
    writeDisposition: "WRITE_APPEND",
  });
  const errors = job.status?.errors;
  if (errors?.length) throw new Error(JSON.stringify(errors));
  console.log(`loaded ${rows.length} rows into ${table}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
