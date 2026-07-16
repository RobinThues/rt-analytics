/**
 * Idempotent GCP setup for rt-analytics.
 * Usage: npm run setup:gcp [-- --project <gcp-project-id>]
 * Requires: gcloud CLI authenticated (`gcloud auth application-default login`).
 */
import { BigQuery } from "@google-cloud/bigquery";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DATASET = "analytics";
const TABLE = "events";
const LOCATION = "EU";
const SA_NAME = "rt-analytics-writer";
const KEY_FILE = "key.json";

const SCHEMA = [
  { name: "event_id", type: "STRING", mode: "REQUIRED" },
  { name: "app_id", type: "STRING", mode: "REQUIRED" },
  { name: "event_name", type: "STRING", mode: "REQUIRED" },
  { name: "timestamp", type: "TIMESTAMP", mode: "REQUIRED" },
  { name: "visitor_id", type: "STRING" },
  { name: "session_id", type: "STRING" },
  { name: "user_id", type: "STRING" },
  { name: "page_path", type: "STRING" },
  { name: "referrer", type: "STRING" },
  { name: "utm_source", type: "STRING" },
  { name: "utm_medium", type: "STRING" },
  { name: "utm_campaign", type: "STRING" },
  { name: "country", type: "STRING" },
  { name: "browser", type: "STRING" },
  { name: "os", type: "STRING" },
  { name: "device_type", type: "STRING" },
  { name: "viewport_w", type: "INT64" },
  { name: "viewport_h", type: "INT64" },
  { name: "props", type: "JSON" },
  { name: "consent_state", type: "STRING" },
  { name: "sdk_version", type: "STRING" },
];

function gcloud(...args: string[]): string {
  return execFileSync("gcloud", args, { encoding: "utf8" }).trim();
}

function resolveProject(): string {
  const flag = process.argv.indexOf("--project");
  if (flag !== -1 && process.argv[flag + 1]) return process.argv[flag + 1] as string;
  const fromConfig = gcloud("config", "get-value", "project");
  if (!fromConfig || fromConfig === "(unset)") {
    console.error("No GCP project. Pass --project <id> or run: gcloud config set project <id>");
    process.exit(1);
  }
  return fromConfig;
}

async function main(): Promise<void> {
  const projectId = resolveProject();
  console.log(`Project: ${projectId}`);
  const bq = new BigQuery({ projectId });

  // 1. Dataset
  const dataset = bq.dataset(DATASET);
  const [dsExists] = await dataset.exists();
  if (!dsExists) {
    await bq.createDataset(DATASET, { location: LOCATION });
    console.log(`Created dataset ${DATASET} (${LOCATION})`);
  } else {
    console.log(`Dataset ${DATASET} exists`);
  }

  // 2. Table
  const table = dataset.table(TABLE);
  const [tExists] = await table.exists();
  if (!tExists) {
    await dataset.createTable(TABLE, {
      schema: SCHEMA,
      timePartitioning: { type: "DAY", field: "timestamp" },
      clustering: { fields: ["app_id", "event_name"] },
    });
    console.log(`Created table ${TABLE} (partitioned by day, clustered by app_id, event_name)`);
  } else {
    console.log(`Table ${TABLE} exists`);
  }

  // 3. Views (CREATE OR REPLACE — safe upgrade path)
  const viewsDir = join(import.meta.dirname, "..", "sql", "views");
  for (const file of readdirSync(viewsDir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(viewsDir, file), "utf8")
      .replaceAll("{{PROJECT}}", projectId)
      .replaceAll("{{DATASET}}", DATASET);
    await bq.query({ query: sql, location: LOCATION });
    console.log(`Applied view ${file}`);
  }

  // 4. Service account (write-only access, scoped to the dataset)
  const saEmail = `${SA_NAME}@${projectId}.iam.gserviceaccount.com`;
  const existing = gcloud("iam", "service-accounts", "list", `--project=${projectId}`, `--filter=email:${saEmail}`, "--format=value(email)");
  if (!existing) {
    gcloud("iam", "service-accounts", "create", SA_NAME, `--project=${projectId}`, "--display-name=rt-analytics ingest writer");
    console.log(`Created service account ${saEmail}`);
  } else {
    console.log(`Service account ${saEmail} exists`);
  }

  // 5. Dataset-scoped WRITER access (equivalent to dataEditor, but only this dataset)
  const [meta] = await dataset.getMetadata();
  const access: { role?: string; userByEmail?: string }[] = meta.access ?? [];
  if (!access.some((a) => a.userByEmail === saEmail)) {
    access.push({ role: "WRITER", userByEmail: saEmail });
    await dataset.setMetadata({ access });
    console.log("Granted dataset WRITER to service account");
  } else {
    console.log("Dataset access already granted");
  }

  // 6. Key (only if key.json not present)
  if (!existsSync(KEY_FILE)) {
    gcloud("iam", "service-accounts", "keys", "create", KEY_FILE, `--iam-account=${saEmail}`, `--project=${projectId}`);
    console.log(`Created ${KEY_FILE} (gitignored)`);
  } else {
    console.log(`${KEY_FILE} already present — reusing`);
  }

  const keyOneLine = JSON.stringify(JSON.parse(readFileSync(KEY_FILE, "utf8")));
  const salt = randomBytes(16).toString("hex");

  console.log("\n=== Vercel env vars (per app; salt may be shared across apps) ===");
  console.log("ANALYTICS_GCP_CREDENTIALS:");
  console.log(keyOneLine);
  console.log("\nANALYTICS_DAILY_SALT (generated now; reuse the same value everywhere):");
  console.log(salt);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
