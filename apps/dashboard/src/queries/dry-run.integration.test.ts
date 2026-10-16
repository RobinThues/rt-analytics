// @vitest-environment node
// Opt-in: RTD_DRY_RUN=1 GCP_PROJECT_ID=robin-thues npx vitest run src/queries/dry-run.integration.test.ts
// Runs every query builder as a free BigQuery dry run against the demo app (90 days ending yesterday,
// compare on) with your gcloud application default credentials, and fails when the bytes estimate is
// over the cap (spec section 9).
import { BigQuery } from "@google-cloud/bigquery";
import { describe, expect, it } from "vitest";
import type { QuerySpec } from "@/bq/run-query";
import { readEnv } from "@/env";
import { addDays, todayIn } from "@/time/range";
import { buildContext, eventsCte, SESSION_COLUMNS, sessionsCte, toSpec } from "./context";

const enabled = process.env.RTD_DRY_RUN === "1";
const env = readEnv({ ...process.env, GCP_PROJECT_ID: process.env.GCP_PROJECT_ID ?? "robin-thues" });
const today = todayIn("Europe/Berlin", new Date());
const ctx = buildContext({
  table: env.analyticsTable,
  appId: "demo",
  settings: { timezone: "Europe/Berlin", hosts: ["demo.localhost"] },
  range: { from: addDays(today, -90), to: addDays(today, -1) },
  compare: true,
  today,
});

const CASES: Array<[string, QuerySpec]> = [
  [
    "periodOf + sessionsCte",
    toSpec(
      `WITH ${eventsCte(ctx.table, SESSION_COLUMNS)}, ${sessionsCte()}
SELECT period, COUNT(*) AS n FROM sessions GROUP BY period`,
      ctx.params,
    ),
  ],
];

describe.skipIf(!enabled)("dry runs against demo (90 days, compare on)", () => {
  const bq = new BigQuery({ projectId: env.gcp.projectId, location: "EU" });
  it.each(CASES)("%s", async (_name, spec) => {
    const [job] = await bq.createQueryJob({
      query: spec.sql,
      params: spec.params,
      ...(spec.types ? { types: spec.types } : {}),
      location: "EU",
      dryRun: true,
    });
    const bytes = Number(job.metadata.statistics.totalBytesProcessed);
    console.log(`${_name}: ${bytes} bytes`);
    expect(bytes).toBeLessThanOrEqual(env.maxBytesPerQuery);
  });
});
