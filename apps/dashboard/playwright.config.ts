import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { defineConfig } from "@playwright/test";

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
  }).filter(([, v]) => v !== undefined),
) as Record<string, string>;
Object.assign(process.env, env);

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `npx next start -p ${port}`,
    url: `http://localhost:${port}/sign-in`,
    env,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
