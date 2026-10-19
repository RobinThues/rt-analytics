import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { defineConfig } from "@playwright/test";

// Three modes (spec 2026-10-19-e2e-bigquery-cost, part D), picked with RTD_E2E_MODE:
// - replay (default, `npm run e2e`): BigQuery answers come from e2e/fixtures, no GCP access, bills nothing.
// - record (`npm run e2e:record`): runs the replay set once against real BigQuery and rewrites the fixtures.
// - bq (`npm run e2e:bq`): the @bq tests against real BigQuery (dev service account).
// Every mode fixes "today" to the last demo day, so the demo data and the fixtures stay valid.
const mode = process.env.RTD_E2E_MODE ?? "replay";
if (mode !== "replay" && mode !== "record" && mode !== "bq") throw new Error(`Unknown RTD_E2E_MODE ${mode}`);

// next start loads env files in production mode; load the development files explicitly (spec section 9).
const appDir = dirname(fileURLToPath(import.meta.url));
const { combinedEnv } = nextEnv.loadEnvConfig(appDir, true);
const port = 3300;
const env = Object.fromEntries(
  Object.entries({
    ...combinedEnv,
    BETTER_AUTH_URL: `http://localhost:${port}`,
    DASHBOARD_JOB_SOURCE: "e2e",
    DASHBOARD_FIXED_TODAY: "2026-10-13",
    ...(mode === "replay" ? { DASHBOARD_FIXTURES: "replay", GCP_PROJECT_ID: "robin-thues" } : {}),
    ...(mode === "record" ? { DASHBOARD_FIXTURES: "record" } : {}),
  }).filter(([, v]) => v !== undefined),
) as Record<string, string>;
Object.assign(process.env, env);

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: `http://localhost:${port}` },
  // Real BigQuery runs one test at a time: the settings test changes the demo timezone, which would split the
  // cache for parallel tests; recording must not see funnels or settings that another test saves meanwhile.
  ...(mode === "replay" ? { grepInvert: /@bq/ } : {}),
  ...(mode === "record" ? { grepInvert: /@bq/, workers: 1, globalSetup: "./e2e/clear-fixtures.ts" } : {}),
  ...(mode === "bq" ? { grep: /@bq/, workers: 1 } : {}),
  webServer: {
    command: `npx next start -p ${port}`,
    url: `http://localhost:${port}/sign-in`,
    env,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
