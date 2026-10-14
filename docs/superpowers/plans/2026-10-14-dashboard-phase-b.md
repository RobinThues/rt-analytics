# Dashboard Phase B (GCP and dashboard shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed, signed-in dashboard shell: keyless BigQuery access via Vercel OIDC, Google sign-in with an allowlist, the cached query layer with Live/Refresh and a byte cap, discovery, the app picker, per-app settings and the shared header, verified end to end against the demo data.

**Architecture:** `apps/dashboard` is a Next.js 16.4 App Router app (`cacheComponents: true`). Pure modules (`env`, `auth/validate-user`, `bq/run-query`, `discovery/sql`, `time`, `view`, `config/settings`) carry the logic and are unit-tested; thin Next.js files (routes, pages, server actions, `proxy.ts`, `instrumentation.ts`) wire them. BigQuery is reached through one function, `query()`, which picks the uncached or the `'use cache: remote'` path. GCP resources come from `npm run setup:gcp -- --dashboard`.

**Tech Stack:** Next.js 16.4, React 19.3, TypeScript 6.0.3, Tailwind 4.3, shadcn/ui 4.21, Better Auth 1.7.7 (stateless), @google-cloud/bigquery 9.3, google-auth-library 11.3, @vercel/oidc 4.0.1, Vitest 5 + happy-dom + Testing Library, Playwright 1.64.

**Spec:** [docs/superpowers/specs/2026-10-14-dashboard-design.md](../specs/2026-10-14-dashboard-design.md) (sections 2, 3, 4, 5, 6 "Time", 7 "Settings", 9, 10, 11 PRs 5–7). Read it first.

## Global Constraints

- TypeScript `6.0.3`; Node 24 for the app (`engines` `>=24` in `apps/dashboard/package.json`).
- Every dependency at its latest stable version (`npm view <pkg> version --prefer-online`) at install time; versions in the spec table are the floor.
- No user input in SQL text: everything goes through query parameters; table names come only from validated env values.
- Every query on `analytics.events` filters a `timestamp` range; every query except the app list filters `app_id`.
- No request-time values (now) in query parameters; use `CURRENT_TIMESTAMP()` in SQL.
- All cache tags start with `rtd:`.
- `maximumBytesBilled` on every query, from `DASHBOARD_MAX_BYTES_PER_QUERY` (default 1 000 000 000).
- Secrets never in git; `.env*` stays ignored. Sensitive Vercel variables only for production.
- Commits without attribution trailers; author from Robin's git config.
- External actions (GCP IAM, Vercel project, deploys, env vars) only after Robin's OK (Tasks 9 and 11).
- Throw-away commands go into files under `claude-tmp-helpers/`.

## Review Focus

1. **A signed-in user whose email is removed from the allowlist keeps access** (stateless session cookie lives for days): owner Task 4, pinned by the `getUser` test that rejects a valid session for a non-allowlisted email.
2. **Test login reachable in a deployment** (`DASHBOARD_TEST_LOGIN=1` copied into Vercel by mistake): owner Task 3/4, pinned by `assertSafeTestLogin` tests and the plugin test that returns 404 when the guard fails.
3. **A failed BigQuery query gets cached for an hour** (transient error shown until TTL ends): owner Task 5, pinned by the test that the cached runner throws on failure instead of returning an error value.
4. **A prop key or app id with SQL characters reaches the SQL text**: owner Task 6/7, pinned by builder tests asserting the value appears only in `params`.
5. **Settings form with an unknown timezone or junk hostnames breaks every later query for that app**: owner Task 7, pinned by `parseSettings` tests (invalid values fall back to defaults, never throw at read time).

---

### Task 1: `setup:gcp --dashboard` (PR 5, branch `feat/gcp-dashboard` from `main`)

**Files:**
- Create: `scripts/gcp-dashboard.ts`, `scripts/gcp-dashboard.test.ts`
- Modify: `scripts/setup-gcp.ts` (dispatch to the dashboard setup when `--dashboard` is given)

**Interfaces:**
- Produces: `wifConfig(team: string, project: string, projectNumber: string)` returning `{ poolId: "vercel"; providerId: "vercel"; issuer: string; allowedAudience: string; attributeCondition: string; principalSet: string; stsAudience: string }`; `DASHBOARD_SA = "rt-analytics-dashboard"`; `CONFIG_DATASET = "analytics_dashboard"`; `CONFIG_SCHEMA`; `setupDashboard(projectId: string, opts: { team: string; project: string })`.

- [ ] **Step 1.1: Failing test**

`scripts/gcp-dashboard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CONFIG_SCHEMA, wifConfig } from "./gcp-dashboard.js";

describe("wifConfig", () => {
  const c = wifConfig("robinthues-projects", "rt-analytics-dashboard", "123456789");

  it("trusts only the Vercel team issuer and its default audience", () => {
    expect(c.issuer).toBe("https://oidc.vercel.com/robinthues-projects");
    expect(c.allowedAudience).toBe("https://vercel.com/robinthues-projects");
  });

  it("allows only production and development of the dashboard project", () => {
    expect(c.attributeCondition).toBe(
      'assertion.sub in ["owner:robinthues-projects:project:rt-analytics-dashboard:environment:production", ' +
        '"owner:robinthues-projects:project:rt-analytics-dashboard:environment:development"]',
    );
  });

  it("builds the STS audience and principal set from the project number", () => {
    expect(c.stsAudience).toBe(
      "//iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/vercel/providers/vercel",
    );
    expect(c.principalSet).toBe(
      "principalSet://iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/vercel/*",
    );
  });

  it("rejects slugs that could break the condition", () => {
    expect(() => wifConfig('a"b', "p", "1")).toThrow();
    expect(() => wifConfig("t", "p q", "1")).toThrow();
    expect(() => wifConfig("t", "p", "12x")).toThrow();
  });
});

describe("CONFIG_SCHEMA", () => {
  it("matches the spec's dashboard_config table", () => {
    expect(CONFIG_SCHEMA.map((f) => `${f.name}:${f.type}:${f.mode}`)).toEqual([
      "kind:STRING:REQUIRED",
      "id:STRING:REQUIRED",
      "app_id:STRING:REQUIRED",
      "name:STRING:NULLABLE",
      "value:JSON:REQUIRED",
      "updated_at:TIMESTAMP:REQUIRED",
      "updated_by:STRING:REQUIRED",
    ]);
  });
});
```

Run: `npx vitest run scripts/gcp-dashboard.test.ts` → FAIL (module missing).

- [ ] **Step 1.2: Implement `scripts/gcp-dashboard.ts`**

```ts
// Dashboard part of `npm run setup:gcp -- --dashboard --vercel-team <slug> --vercel-project <name>`.
// Creates the analytics_dashboard dataset, the keyless rt-analytics-dashboard service account and a workload
// identity pool that trusts only the dashboard's Vercel project (production and development). Idempotent.
import { execFileSync } from "node:child_process";
import { BigQuery } from "@google-cloud/bigquery";

export const DASHBOARD_SA = "rt-analytics-dashboard";
export const CONFIG_DATASET = "analytics_dashboard";
const ANALYTICS_DATASET = "analytics";
const LOCATION = "EU";
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;

export const CONFIG_SCHEMA = [
  { name: "kind", type: "STRING", mode: "REQUIRED" },
  { name: "id", type: "STRING", mode: "REQUIRED" },
  { name: "app_id", type: "STRING", mode: "REQUIRED" },
  { name: "name", type: "STRING", mode: "NULLABLE" },
  { name: "value", type: "JSON", mode: "REQUIRED" },
  { name: "updated_at", type: "TIMESTAMP", mode: "REQUIRED" },
  { name: "updated_by", type: "STRING", mode: "REQUIRED" },
] as const;

export function wifConfig(team: string, project: string, projectNumber: string) {
  if (!SLUG_RE.test(team) || !SLUG_RE.test(project)) throw new Error("Vercel team and project must be slugs");
  if (!/^\d+$/.test(projectNumber)) throw new Error("GCP project number must be digits");
  const poolId = "vercel";
  const providerId = "vercel";
  const pool = `projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}`;
  const sub = (env: string) => `"owner:${team}:project:${project}:environment:${env}"`;
  return {
    poolId,
    providerId,
    issuer: `https://oidc.vercel.com/${team}`,
    allowedAudience: `https://vercel.com/${team}`,
    attributeCondition: `assertion.sub in [${sub("production")}, ${sub("development")}]`,
    stsAudience: `//iam.googleapis.com/${pool}/providers/${providerId}`,
    principalSet: `principalSet://iam.googleapis.com/${pool}/*`,
  } as const;
}

function gcloud(...args: string[]): string {
  return execFileSync("gcloud", args, { encoding: "utf8" }).trim();
}

function tryGcloud(...args: string[]): string | null {
  try {
    return gcloud(...args);
  } catch {
    return null;
  }
}

type AccessEntry = { role?: string; userByEmail?: string };

async function grantDataset(bq: BigQuery, datasetId: string, role: "READER" | "WRITER", email: string) {
  const dataset = bq.dataset(datasetId);
  const [meta] = await dataset.getMetadata();
  const access: AccessEntry[] = meta.access ?? [];
  if (access.some((a) => a.userByEmail === email && a.role === role)) {
    console.log(`${datasetId}: ${role} already granted`);
    return;
  }
  access.push({ role, userByEmail: email });
  await dataset.setMetadata({ access });
  console.log(`${datasetId}: granted ${role} to ${email}`);
}

export async function setupDashboard(projectId: string, opts: { team: string; project: string }): Promise<void> {
  const projectNumber = gcloud("projects", "describe", projectId, "--format=value(projectNumber)");
  const wif = wifConfig(opts.team, opts.project, projectNumber);
  const saEmail = `${DASHBOARD_SA}@${projectId}.iam.gserviceaccount.com`;
  const bq = new BigQuery({ projectId });

  // 1. APIs for token exchange and impersonation
  gcloud("services", "enable", "iam.googleapis.com", "sts.googleapis.com", "iamcredentials.googleapis.com", `--project=${projectId}`);
  console.log("APIs enabled: iam, sts, iamcredentials");

  // 2. Config dataset and table
  const dataset = bq.dataset(CONFIG_DATASET);
  if (!(await dataset.exists())[0]) {
    await bq.createDataset(CONFIG_DATASET, { location: LOCATION });
    console.log(`Created dataset ${CONFIG_DATASET} (${LOCATION})`);
  }
  if (!(await dataset.table("dashboard_config").exists())[0]) {
    await dataset.createTable("dashboard_config", { schema: [...CONFIG_SCHEMA] });
    console.log("Created table dashboard_config");
  }

  // 3. Service account without keys
  if (!tryGcloud("iam", "service-accounts", "describe", saEmail, `--project=${projectId}`)) {
    gcloud("iam", "service-accounts", "create", DASHBOARD_SA, `--project=${projectId}`, "--display-name=rt-analytics dashboard (keyless)");
    console.log(`Created service account ${saEmail}`);
  }

  // 4. Permissions: run queries; read analytics; read and write analytics_dashboard
  gcloud(
    "projects", "add-iam-policy-binding", projectId,
    `--member=serviceAccount:${saEmail}`, "--role=roles/bigquery.jobUser", "--condition=None", "--quiet",
  );
  console.log("Granted roles/bigquery.jobUser on the project");
  await grantDataset(bq, ANALYTICS_DATASET, "READER", saEmail);
  await grantDataset(bq, CONFIG_DATASET, "WRITER", saEmail);

  // 5. Workload identity pool and Vercel OIDC provider
  if (!tryGcloud("iam", "workload-identity-pools", "describe", wif.poolId, "--location=global", `--project=${projectId}`)) {
    gcloud("iam", "workload-identity-pools", "create", wif.poolId, "--location=global", "--display-name=Vercel", `--project=${projectId}`);
    console.log(`Created workload identity pool ${wif.poolId}`);
  }
  const providerArgs = [
    `--workload-identity-pool=${wif.poolId}`, "--location=global", `--project=${projectId}`,
    `--issuer-uri=${wif.issuer}`, `--allowed-audiences=${wif.allowedAudience}`,
    "--attribute-mapping=google.subject=assertion.sub", `--attribute-condition=${wif.attributeCondition}`,
  ];
  const providerExists = tryGcloud(
    "iam", "workload-identity-pools", "providers", "describe", wif.providerId,
    `--workload-identity-pool=${wif.poolId}`, "--location=global", `--project=${projectId}`,
  );
  gcloud("iam", "workload-identity-pools", "providers", providerExists ? "update-oidc" : "create-oidc", wif.providerId, ...providerArgs);
  console.log(`${providerExists ? "Updated" : "Created"} OIDC provider ${wif.providerId} (${wif.issuer})`);

  // 6. Let the pool's identities impersonate the service account
  gcloud(
    "iam", "service-accounts", "add-iam-policy-binding", saEmail, `--project=${projectId}`,
    "--role=roles/iam.workloadIdentityUser", `--member=${wif.principalSet}`, "--quiet",
  );
  console.log("Granted roles/iam.workloadIdentityUser to the pool");

  console.log("\nSet these (non-secret) variables in the dashboard's Vercel project (production and development):");
  console.log(`  GCP_PROJECT_ID=${projectId}`);
  console.log(`  GCP_PROJECT_NUMBER=${projectNumber}`);
  console.log(`  GCP_SERVICE_ACCOUNT_EMAIL=${saEmail}`);
  console.log(`  GCP_WORKLOAD_IDENTITY_POOL_ID=${wif.poolId}`);
  console.log(`  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=${wif.providerId}`);
}
```

Run Prettier on the file afterwards (the long `gcloud(...)` calls are written compactly above).

- [ ] **Step 1.3: Wire the flag**

In `scripts/setup-gcp.ts`, at the start of `main()` after `resolveProject()`:

```ts
  if (process.argv.includes("--dashboard")) {
    const team = flagValue("--vercel-team");
    const project = flagValue("--vercel-project") ?? "rt-analytics-dashboard";
    if (!team) {
      console.error("--dashboard needs --vercel-team <slug> (and optionally --vercel-project <name>)");
      process.exit(2);
    }
    await setupDashboard(projectId, { team, project });
    return;
  }
```

Import `setupDashboard` from `./gcp-dashboard.js`. Update the usage comment at the top of `setup-gcp.ts` with the new flags.

- [ ] **Step 1.4: Verify and commit**

```bash
npx vitest run scripts && npx eslint scripts && npx prettier --check scripts && npm run typecheck
git add scripts && git commit -m "feat(setup): setup:gcp --dashboard (config dataset, keyless service account, Vercel OIDC pool)"
```

Expected: all green. Nothing is run against GCP in this task (Task 9).

---

### Task 2: Dashboard scaffold (PR 6, branch `feat/dashboard-part-1` from `feat/gcp-dashboard`)

**Files:**
- Create: `apps/dashboard/**` from `create-next-app`, `apps/dashboard/vitest.config.ts`, `apps/dashboard/vitest.setup.ts`, `apps/dashboard/src/lib/smoke.test.ts`
- Modify: `apps/dashboard/package.json`, `apps/dashboard/next.config.ts`, `apps/dashboard/tsconfig.json`, root `.prettierignore`

- [ ] **Step 2.1: Generate**

```bash
git switch -c feat/dashboard-part-1
npx create-next-app@16.4.0 apps/dashboard --ts --tailwind --eslint --app --src-dir --cache-components \
  --import-alias "@/*" --use-npm --skip-install --disable-git --no-agent-feedback --yes
rm -f apps/dashboard/package-lock.json
```

- [ ] **Step 2.2: Workspace integration**

`apps/dashboard/package.json`: `"name": "rt-analytics-dashboard"`, `"private": true`, `"engines": { "node": ">=24" }`, scripts:

```json
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "e2e": "playwright test"
```

Dependencies (latest stable at install time): `next`, `react`, `react-dom`, `rt-analytics: "*"`, `better-auth`, `zod`, `@google-cloud/bigquery`, `google-auth-library`, `@vercel/oidc`. Dev: `typescript: "6.0.3"`, `@types/node` (24), `@types/react`, `@types/react-dom`, `tailwindcss`, `@tailwindcss/postcss`, `eslint`, `eslint-config-next`, `vitest`, `happy-dom`, `@testing-library/react`, `@testing-library/jest-dom`, `@vitejs/plugin-react`, `vite-tsconfig-paths`, `@playwright/test`, `@next/env`. Then `npm install` at the root.

`next.config.ts` must contain `cacheComponents: true` (the flag `--cache-components` sets it; check).

`vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

`vitest.setup.ts`: `import "@testing-library/jest-dom/vitest";`

`src/lib/smoke.test.ts`: `it("runs", () => expect(1 + 1).toBe(2));`

Root `.prettierignore`: add `next-env.d.ts`. Delete the generated `README.md` content and replace with three lines (what it is, `npm run dev -w rt-analytics-dashboard`, link to the spec). Keep `AGENTS.md` from the template.

- [ ] **Step 2.3: shadcn/ui**

```bash
cd apps/dashboard && npx shadcn@latest init --yes --base-color neutral && npx shadcn@latest add button card badge input label select table skeleton separator && cd ../..
```

Expected: `components.json`, `src/components/ui/*`, `src/lib/utils.ts`, CSS variables in `src/app/globals.css`.

- [ ] **Step 2.4: Verify and commit**

```bash
npm install
npm run lint -w rt-analytics-dashboard && npm run typecheck -w rt-analytics-dashboard && npm test -w rt-analytics-dashboard && npm run build -w rt-analytics-dashboard
npx prettier --check apps/dashboard
git add -A && git commit -m "feat(dashboard): Next.js 16 app scaffold (Tailwind, shadcn/ui, Vitest, cacheComponents)"
```

---

### Task 3: Environment (PR 6)

**Files:** Create `apps/dashboard/src/env.ts`, `apps/dashboard/src/env.test.ts`

**Interfaces:**
- Produces:
  - `interface DashboardEnv { allowedEmails: readonly string[]; cacheTtlSeconds: number; maxBytesPerQuery: number; gcp: GcpEnv; analyticsTable: string; configTable: string; testLogin: { enabled: boolean; secret: string | null } }`
  - `interface GcpEnv { projectId: string; projectNumber: string | null; serviceAccountEmail: string | null; poolId: string | null; providerId: string | null }`
  - `parseCacheTtl(raw?: string): number`, `parseMaxBytes(raw?: string): number`, `parseAllowedEmails(raw?: string): string[]`, `testLoginState(env): { enabled; secret }`, `assertSafeTestLogin(env): void`, `readEnv(env = process.env): DashboardEnv`

- [ ] **Step 3.1: Failing tests**

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertSafeTestLogin, parseAllowedEmails, parseCacheTtl, parseMaxBytes, readEnv, testLoginState } from "./env";

const secret = "s".repeat(32);

describe("parseCacheTtl", () => {
  it("defaults to 3600", () => expect(parseCacheTtl(undefined)).toBe(3600));
  it("accepts 0 and whole numbers", () => {
    expect(parseCacheTtl("0")).toBe(0);
    expect(parseCacheTtl("120")).toBe(120);
  });
  it("rejects junk", () => {
    for (const bad of ["-1", "1.5", "abc", "Infinity", ""]) expect(() => parseCacheTtl(bad)).toThrow();
  });
});

describe("parseMaxBytes", () => {
  it("defaults to 1 GB", () => expect(parseMaxBytes(undefined)).toBe(1_000_000_000));
  it("rejects 0 and junk", () => {
    for (const bad of ["0", "-5", "x"]) expect(() => parseMaxBytes(bad)).toThrow();
  });
});

describe("parseAllowedEmails", () => {
  it("lowercases, trims and drops empties", () => {
    expect(parseAllowedEmails(" A@B.de, ,c@d.com ")).toEqual(["a@b.de", "c@d.com"]);
  });
  it("is empty when unset", () => expect(parseAllowedEmails(undefined)).toEqual([]));
});

describe("test login guard", () => {
  it("is enabled only with flag, long secret and outside deployments", () => {
    expect(testLoginState({ DASHBOARD_TEST_LOGIN: "1", DASHBOARD_TEST_LOGIN_SECRET: secret })).toEqual({ enabled: true, secret });
    expect(testLoginState({ DASHBOARD_TEST_LOGIN: "1", DASHBOARD_TEST_LOGIN_SECRET: secret, VERCEL_ENV: "development" }).enabled).toBe(true);
    expect(testLoginState({ DASHBOARD_TEST_LOGIN: "1", DASHBOARD_TEST_LOGIN_SECRET: "short" }).enabled).toBe(false);
    expect(testLoginState({ DASHBOARD_TEST_LOGIN_SECRET: secret }).enabled).toBe(false);
    expect(testLoginState({ DASHBOARD_TEST_LOGIN: "1", DASHBOARD_TEST_LOGIN_SECRET: secret, VERCEL_ENV: "preview" }).enabled).toBe(false);
  });

  it("refuses to start a deployment with the test login flag (Review Focus 2)", () => {
    expect(() => assertSafeTestLogin({ DASHBOARD_TEST_LOGIN: "1", VERCEL_ENV: "production" })).toThrow();
    expect(() => assertSafeTestLogin({ DASHBOARD_TEST_LOGIN: "1", VERCEL_ENV: "preview" })).toThrow();
    expect(() => assertSafeTestLogin({ DASHBOARD_TEST_LOGIN: "1" })).not.toThrow();
    expect(() => assertSafeTestLogin({ VERCEL_ENV: "production" })).not.toThrow();
  });
});

describe("readEnv", () => {
  it("builds validated table names", () => {
    const env = readEnv({ GCP_PROJECT_ID: "robin-thues" });
    expect(env.analyticsTable).toBe("`robin-thues.analytics.events`");
    expect(env.configTable).toBe("`robin-thues.analytics_dashboard.dashboard_config`");
  });
  it("rejects unsafe dataset or project names", () => {
    expect(() => readEnv({ GCP_PROJECT_ID: "x`; DROP" })).toThrow();
    expect(() => readEnv({ GCP_PROJECT_ID: "p", ANALYTICS_DATASET: "a.b" })).toThrow();
  });
  it("needs a project id", () => expect(() => readEnv({})).toThrow());
});
```

Run: `npm test -w rt-analytics-dashboard -- src/env.test.ts` → FAIL.

- [ ] **Step 3.2: Implement `src/env.ts`**

```ts
// Reads and validates the dashboard's environment (spec section 10). Throws on invalid values so a
// misconfigured deployment fails at startup instead of on the first query.
type Env = Record<string, string | undefined>;

export interface GcpEnv {
  projectId: string;
  projectNumber: string | null;
  serviceAccountEmail: string | null;
  poolId: string | null;
  providerId: string | null;
}

export interface DashboardEnv {
  allowedEmails: readonly string[];
  cacheTtlSeconds: number;
  maxBytesPerQuery: number;
  gcp: GcpEnv;
  /** Backquoted, validated table references for SQL. */
  analyticsTable: string;
  configTable: string;
  testLogin: { enabled: boolean; secret: string | null };
}

const PROJECT_RE = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/;
const DATASET_RE = /^[A-Za-z0-9_]{1,1024}$/;

function wholeNumber(raw: string, name: string, min: number): number {
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a whole number`);
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min) throw new Error(`${name} must be at least ${min}`);
  return n;
}

export function parseCacheTtl(raw?: string): number {
  return raw === undefined ? 3600 : wholeNumber(raw, "DASHBOARD_CACHE_TTL_SECONDS", 0);
}

export function parseMaxBytes(raw?: string): number {
  return raw === undefined ? 1_000_000_000 : wholeNumber(raw, "DASHBOARD_MAX_BYTES_PER_QUERY", 1);
}

export function parseAllowedEmails(raw?: string): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

const inDeployment = (env: Env) => env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";

export function testLoginState(env: Env): { enabled: boolean; secret: string | null } {
  const secret = env.DASHBOARD_TEST_LOGIN_SECRET ?? null;
  const enabled = env.DASHBOARD_TEST_LOGIN === "1" && secret !== null && secret.length >= 32 && !inDeployment(env);
  return { enabled, secret: enabled ? secret : null };
}

/** Called from instrumentation.ts: a deployment with the test login flag must not start. */
export function assertSafeTestLogin(env: Env): void {
  if (env.DASHBOARD_TEST_LOGIN === "1" && inDeployment(env)) {
    throw new Error("DASHBOARD_TEST_LOGIN must never be set in a Vercel deployment");
  }
}

const orNull = (v: string | undefined) => (v && v.length > 0 ? v : null);

export function readEnv(env: Env = process.env): DashboardEnv {
  const projectId = env.GCP_PROJECT_ID ?? "";
  if (!PROJECT_RE.test(projectId)) throw new Error("GCP_PROJECT_ID is missing or not a valid project id");
  const analyticsDataset = env.ANALYTICS_DATASET ?? "analytics";
  const configDataset = env.DASHBOARD_CONFIG_DATASET ?? "analytics_dashboard";
  if (!DATASET_RE.test(analyticsDataset) || !DATASET_RE.test(configDataset)) {
    throw new Error("ANALYTICS_DATASET and DASHBOARD_CONFIG_DATASET may only contain letters, digits and _");
  }
  return {
    allowedEmails: parseAllowedEmails(env.DASHBOARD_ALLOWED_EMAILS),
    cacheTtlSeconds: parseCacheTtl(env.DASHBOARD_CACHE_TTL_SECONDS),
    maxBytesPerQuery: parseMaxBytes(env.DASHBOARD_MAX_BYTES_PER_QUERY),
    gcp: {
      projectId,
      projectNumber: orNull(env.GCP_PROJECT_NUMBER),
      serviceAccountEmail: orNull(env.GCP_SERVICE_ACCOUNT_EMAIL),
      poolId: orNull(env.GCP_WORKLOAD_IDENTITY_POOL_ID),
      providerId: orNull(env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID),
    },
    analyticsTable: `\`${projectId}.${analyticsDataset}.events\``,
    configTable: `\`${projectId}.${configDataset}.dashboard_config\``,
    testLogin: testLoginState(env),
  };
}
```

Note: `PROJECT_RE` rejects `"p"` (too short); the `readEnv` "rejects unsafe dataset" test uses `"p"` as project and must fail for the project or the dataset; both are errors, which is what the test asserts.

- [ ] **Step 3.3: Run, commit**

`npm test -w rt-analytics-dashboard -- src/env.test.ts` → PASS. `git commit -m "feat(dashboard): validated environment (TTL, byte cap, allowlist, test-login guard)"`

---

### Task 4: Auth (PR 6)

**Files:**
- Create: `src/auth/validate-user.ts` (+ `.test.ts`), `src/auth/test-login.ts`, `src/auth/auth.ts`, `src/auth/auth.test.ts`, `src/auth/session.ts`, `src/auth/client.ts`, `src/app/api/auth/[...all]/route.ts`, `src/app/sign-in/page.tsx`, `src/app/sign-in/sign-in-button.tsx`, `src/proxy.ts`, `src/proxy.test.ts`, `src/instrumentation.ts`

**Interfaces:**
- Consumes: `readEnv`, `DashboardEnv`, `assertSafeTestLogin` (Task 3).
- Produces: `isAllowedEmail(email: unknown, allowed: readonly string[]): boolean`; `validateUser(data, opts: { allowed: readonly string[]; testLogin: boolean }): void | { error: string; errorDescription?: string }`; `createAuth(env: DashboardEnv)` and `auth` (singleton); `getUser(): Promise<SessionUser | null>`; `requireUser(): Promise<SessionUser>`; `type SessionUser = { email: string; name: string }`; test-login endpoint `POST /api/auth/test-login` (header `x-test-login-secret`, body `{ email }`).

- [ ] **Step 4.1: Failing tests for the rules**

`src/auth/validate-user.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isAllowedEmail, validateUser } from "./validate-user";

const allowed = ["robin@example.com"];
const google = (email: string, emailVerified: boolean) => ({
  user: { email, emailVerified },
  source: { method: "oauth", action: "create-user", oauth: { providerId: "google" } },
});

describe("isAllowedEmail", () => {
  it("compares lowercase and rejects non-strings", () => {
    expect(isAllowedEmail("Robin@Example.com", allowed)).toBe(true);
    expect(isAllowedEmail("x@example.com", allowed)).toBe(false);
    expect(isAllowedEmail(undefined, allowed)).toBe(false);
    expect(isAllowedEmail("robin@example.com", [])).toBe(false);
  });
});

describe("validateUser", () => {
  it("accepts a verified, allowlisted Google user", () => {
    expect(validateUser(google("robin@example.com", true), { allowed, testLogin: false })).toBeUndefined();
  });
  it("rejects unverified or unknown Google users", () => {
    expect(validateUser(google("robin@example.com", false), { allowed, testLogin: false })).toMatchObject({ error: "email_not_verified" });
    expect(validateUser(google("other@example.com", true), { allowed, testLogin: false })).toMatchObject({ error: "not_allowed" });
  });
  it("rejects other providers and methods", () => {
    const github = { user: { email: "robin@example.com", emailVerified: true }, source: { method: "oauth", action: "sign-in", oauth: { providerId: "github" } } };
    expect(validateUser(github, { allowed, testLogin: false })).toMatchObject({ error: "method_not_allowed" });
    const pw = { user: { email: "robin@example.com" }, source: { method: "email-password", action: "create-user" } };
    expect(validateUser(pw, { allowed, testLogin: false })).toMatchObject({ error: "method_not_allowed" });
  });
  it("accepts the test method only while the test login is enabled", () => {
    const test = { user: { email: "robin@example.com", emailVerified: true }, source: { method: "test", action: "create-user" } };
    expect(validateUser(test, { allowed, testLogin: true })).toBeUndefined();
    expect(validateUser(test, { allowed, testLogin: false })).toMatchObject({ error: "method_not_allowed" });
  });
});
```

Run → FAIL.

- [ ] **Step 4.2: Implement `src/auth/validate-user.ts`**

```ts
// Allowlist rules for Better Auth's user.validateUserInfo hook (spec section 4).
export function isAllowedEmail(email: unknown, allowed: readonly string[]): boolean {
  return typeof email === "string" && allowed.includes(email.trim().toLowerCase());
}

interface ValidationInput {
  user: { email?: unknown; emailVerified?: unknown };
  source: { method: string; oauth?: { providerId: string } };
}

export function validateUser(
  data: ValidationInput,
  opts: { allowed: readonly string[]; testLogin: boolean },
): void | { error: string; errorDescription?: string } {
  const { method, oauth } = data.source;
  const viaGoogle = method === "oauth" && oauth?.providerId === "google";
  const viaTest = method === "test" && opts.testLogin;
  if (!viaGoogle && !viaTest) return { error: "method_not_allowed", errorDescription: "Sign in with Google." };
  if (viaGoogle && data.user.emailVerified !== true) {
    return { error: "email_not_verified", errorDescription: "Your Google email is not verified." };
  }
  if (!isAllowedEmail(data.user.email, opts.allowed)) {
    return { error: "not_allowed", errorDescription: "This account has no access." };
  }
}
```

Run → PASS.

- [ ] **Step 4.3: Test-login plugin, auth config, and an in-process auth test**

`src/auth/test-login.ts`:

```ts
// Test-only sign-in for Playwright (spec section 4). A Better Auth plugin endpoint, because Better Auth only
// creates users inside its own endpoint context when validateUserInfo is set.
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { isAllowedEmail } from "./validate-user";

export function testLoginPlugin(opts: { enabled: boolean; secret: string | null; allowed: readonly string[] }) {
  return {
    id: "rtd-test-login",
    endpoints: {
      testLogin: createAuthEndpoint(
        "/test-login",
        { method: "POST", body: z.object({ email: z.string() }) },
        async (ctx) => {
          if (!opts.enabled || !opts.secret) throw new APIError("NOT_FOUND");
          if (ctx.headers?.get("x-test-login-secret") !== opts.secret) throw new APIError("FORBIDDEN");
          const email = ctx.body.email.trim().toLowerCase();
          if (!isAllowedEmail(email, opts.allowed)) throw new APIError("FORBIDDEN");
          const found = await ctx.context.internalAdapter.findUserByEmail(email);
          const user =
            found?.user ??
            (await ctx.context.internalAdapter.createUser({ email, name: email, emailVerified: true }, { method: "test" }));
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
```

`src/auth/auth.ts`:

```ts
// Better Auth in stateless mode (no database): session and OAuth state live in encrypted cookies.
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { readEnv, type DashboardEnv } from "@/env";
import { testLoginPlugin } from "./test-login";
import { validateUser } from "./validate-user";

export function createAuth(env: DashboardEnv, vars: Record<string, string | undefined> = process.env) {
  return betterAuth({
    baseURL: vars.BETTER_AUTH_URL,
    secret: vars.BETTER_AUTH_SECRET,
    socialProviders: {
      google: { clientId: vars.GOOGLE_CLIENT_ID ?? "", clientSecret: vars.GOOGLE_CLIENT_SECRET ?? "" },
    },
    session: { cookieCache: { enabled: true, maxAge: 7 * 24 * 60 * 60, strategy: "jwe", refreshCache: true } },
    account: { storeStateStrategy: "cookie", storeAccountCookie: true },
    user: {
      validateUserInfo: (data) => validateUser(data, { allowed: env.allowedEmails, testLogin: env.testLogin.enabled }),
    },
    plugins: [testLoginPlugin({ ...env.testLogin, allowed: env.allowedEmails }), nextCookies()],
  });
}

export const auth = createAuth(readEnv());
```

`src/auth/auth.test.ts` (node environment, no network):

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readEnv } from "@/env";
import { createAuth } from "./auth";

const secret = "t".repeat(32);
const vars = {
  GCP_PROJECT_ID: "robin-thues",
  DASHBOARD_ALLOWED_EMAILS: "robin@example.com",
  DASHBOARD_TEST_LOGIN: "1",
  DASHBOARD_TEST_LOGIN_SECRET: secret,
  BETTER_AUTH_SECRET: "b".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

async function login(auth: ReturnType<typeof createAuth>, email: string, key = secret) {
  return auth.handler(
    new Request("http://localhost:3000/api/auth/test-login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-login-secret": key },
      body: JSON.stringify({ email }),
    }),
  );
}

describe("test login", () => {
  it("creates a session cookie for an allowlisted email", async () => {
    const auth = createAuth(readEnv(vars), vars);
    const res = await login(auth, "robin@example.com");
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    expect(cookies).toContain("session_token");
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookies }) });
    expect(session?.user.email).toBe("robin@example.com");
  });

  it("refuses a wrong secret or a non-allowlisted email", async () => {
    const auth = createAuth(readEnv(vars), vars);
    expect((await login(auth, "robin@example.com", "x".repeat(32))).status).toBe(403);
    expect((await login(auth, "other@example.com")).status).toBe(403);
  });

  it("does not exist when the guard fails (Review Focus 2)", async () => {
    const prod = { ...vars, VERCEL_ENV: "production" };
    const auth = createAuth(readEnv(prod), prod);
    expect((await login(auth, "robin@example.com")).status).toBe(404);
  });
});
```

Run: `npm test -w rt-analytics-dashboard -- src/auth` → PASS. If Better Auth rejects the plugin body schema or the cookie names differ, fix the plugin (not the test's intent) and ledger a ruling.

- [ ] **Step 4.4: Session helpers (Review Focus 1)**

`src/auth/session.ts`:

```ts
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { readEnv } from "@/env";
import { auth } from "./auth";
import { isAllowedEmail } from "./validate-user";

export type SessionUser = { email: string; name: string };

/** Pure part, tested: a session only counts while its email is still on the allowlist. */
export function userFromSession(
  session: { user: { email: string; name: string } } | null,
  allowed: readonly string[],
): SessionUser | null {
  if (!session || !isAllowedEmail(session.user.email, allowed)) return null;
  return { email: session.user.email.toLowerCase(), name: session.user.name };
}

export async function getUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return userFromSession(session, readEnv().allowedEmails);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
}
```

Add to `validate-user.test.ts` a `userFromSession` block (import from `./session` would pull Next server modules; so move `userFromSession` into `validate-user.ts` and re-export it from `session.ts`):

```ts
describe("userFromSession", () => {
  it("drops a valid session whose email left the allowlist", () => {
    const s = { user: { email: "robin@example.com", name: "R" } };
    expect(userFromSession(s, ["robin@example.com"])).toEqual({ email: "robin@example.com", name: "R" });
    expect(userFromSession(s, ["someone@else.com"])).toBeNull();
    expect(userFromSession(null, ["robin@example.com"])).toBeNull();
  });
});
```

- [ ] **Step 4.5: Routes, proxy, instrumentation, sign-in page**

`src/app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/auth/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

`src/proxy.ts`:

```ts
// Cheap redirect for visitors without a session cookie. Not the security boundary: requireUser() checks
// the session and the allowlist on every page and server action.
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/sign-in", request.url));
}

export const config = {
  matcher: ["/((?!api/auth|sign-in|_next/static|_next/image|favicon.ico).*)"],
};
```

`src/proxy.test.ts` (node environment): a request without cookies to `/demo` → 307 to `/sign-in`; with `cookie: better-auth.session_token=x` → passes (`x-middleware-next` header or status 200). Use `new NextRequest("http://localhost:3000/demo", { headers })`.

`src/instrumentation.ts`:

```ts
import { assertSafeTestLogin } from "./env";

export function register() {
  assertSafeTestLogin(process.env);
}
```

`src/auth/client.ts`:

```ts
"use client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
```

`src/app/sign-in/sign-in-button.tsx` (client): a shadcn `Button` that calls `authClient.signIn.social({ provider: "google", callbackURL: "/" })`.

`src/app/sign-in/page.tsx` (server): heading "rt-analytics", one line "Sign in with your Google account.", the button, and an error line when `searchParams.error` is set (Better Auth redirects back with `?error=not_allowed` etc.; map known codes to the texts from `validateUser`, show "Sign-in failed." otherwise). Wrap the `searchParams` read in `<Suspense>` (cacheComponents).

- [ ] **Step 4.6: Verify and commit**

```bash
npm test -w rt-analytics-dashboard && npm run lint -w rt-analytics-dashboard && npm run typecheck -w rt-analytics-dashboard && npm run build -w rt-analytics-dashboard
git add -A && git commit -m "feat(dashboard): Better Auth (stateless Google sign-in, allowlist, test login), proxy, instrumentation"
```

---

### Task 5: BigQuery client and query layer (PR 6)

**Files:** Create `src/bq/client.ts`, `src/bq/run-query.ts` (+ `.test.ts`), `src/bq/cache.ts` (+ `.test.ts` for the pure parts), `src/bq/query.ts`

**Interfaces:**
- Consumes: `DashboardEnv`, `readEnv`.
- Produces:
  - `interface QuerySpec { sql: string; params: Record<string, string | number | boolean | string[] | null>; types?: Record<string, string> }`
  - `type QueryResult<T> = { ok: true; rows: T[] } | { ok: false; error: "bytes-cap" | "failed"; message: string }`
  - `interface QueryClient { query(options: Record<string, unknown>): Promise<[unknown[], ...unknown[]]> }`
  - `runQuery<T>(client: QueryClient, spec: QuerySpec, maxBytes: number): Promise<QueryResult<T>>`, `toPlain(value: unknown): unknown`
  - `TAGS = { data: (appId) => "rtd:bq:<appId>", discovery: (appId) => "rtd:discovery:<appId>", apps: "rtd:apps", config: "rtd:config" }`
  - `cacheProfile(ttl: number): { stale: number; revalidate: number; expire: number }`, `usesCache(opts: { live: boolean; ttl: number }): boolean`
  - `query<T>(spec: QuerySpec, opts: { tags: string[]; ttl: number; live: boolean }): Promise<QueryResult<T>>`
  - `createBigQuery(env: DashboardEnv): BigQuery`
  - `LIVE_COOKIE = "rtd_live"`, `isLive(): Promise<boolean>` (reads the cookie, in `query.ts`)

- [ ] **Step 5.1: Failing tests for `runQuery` and `toPlain`**

`src/bq/run-query.test.ts` (node):

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { runQuery, toPlain, type QueryClient } from "./run-query";

const spec = { sql: "SELECT 1 AS n", params: { app_id: "demo" } };
const client = (impl: QueryClient["query"]): QueryClient => ({ query: impl });

describe("runQuery", () => {
  it("passes params, EU location and the byte cap", async () => {
    let seen: Record<string, unknown> = {};
    const res = await runQuery(client(async (o) => { seen = o; return [[{ n: 1 }]]; }), spec, 1000);
    expect(res).toEqual({ ok: true, rows: [{ n: 1 }] });
    expect(seen).toMatchObject({ query: "SELECT 1 AS n", params: { app_id: "demo" }, location: "EU", maximumBytesBilled: "1000" });
  });

  it("classifies the byte cap error", async () => {
    const err = Object.assign(new Error("Query exceeded limit for bytes billed: 1000."), { errors: [{ reason: "bytesBilledLimitExceeded" }] });
    const res = await runQuery(client(async () => { throw err; }), spec, 1000);
    expect(res).toMatchObject({ ok: false, error: "bytes-cap" });
  });

  it("returns other errors as failed, never throws", async () => {
    const res = await runQuery(client(async () => { throw new Error("boom"); }), spec, 1000);
    expect(res).toEqual({ ok: false, error: "failed", message: "boom" });
  });
});

describe("toPlain", () => {
  it("unwraps BigQuery value objects and Big numbers", () => {
    class BigQueryDate { constructor(public value: string) {} }
    const big = { toNumber: () => 12.5, constructor: { name: "Big" } };
    expect(toPlain({ d: new BigQueryDate("2026-10-01"), n: big, s: "x", a: [new BigQueryDate("2026-10-02")], z: null })).toEqual({
      d: "2026-10-01", n: 12.5, s: "x", a: ["2026-10-02"], z: null,
    });
  });
  it("turns Date into an ISO string", () => {
    expect(toPlain(new Date("2026-10-01T00:00:00Z"))).toBe("2026-10-01T00:00:00.000Z");
  });
});
```

Run → FAIL.

- [ ] **Step 5.2: Implement `src/bq/run-query.ts`**

```ts
// The only place that runs SQL. Never throws: panels get a result they can render (spec section 5).
export interface QuerySpec {
  sql: string;
  params: Record<string, string | number | boolean | string[] | null>;
  types?: Record<string, string>;
}

export type QueryResult<T> = { ok: true; rows: T[] } | { ok: false; error: "bytes-cap" | "failed"; message: string };

export interface QueryClient {
  query(options: Record<string, unknown>): Promise<[unknown[], ...unknown[]]>;
}

/** Converts BigQuery's value classes (dates, timestamps, Big.js numbers) to plain JSON for cache and React. */
export function toPlain(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  const v = value as Record<string, unknown> & { toNumber?: () => number };
  if (typeof v.toNumber === "function") return v.toNumber();
  if (typeof v.value === "string" && Object.keys(v).length === 1) return v.value;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)]));
}

function isBytesCap(err: unknown): boolean {
  const e = err as { errors?: Array<{ reason?: string }>; message?: string };
  return e.errors?.some((x) => x.reason === "bytesBilledLimitExceeded") === true || /bytes billed/i.test(e.message ?? "");
}

export async function runQuery<T>(client: QueryClient, spec: QuerySpec, maxBytes: number): Promise<QueryResult<T>> {
  try {
    const [rows] = await client.query({
      query: spec.sql,
      params: spec.params,
      ...(spec.types ? { types: spec.types } : {}),
      location: "EU",
      maximumBytesBilled: String(maxBytes),
    });
    return { ok: true, rows: rows.map((r) => toPlain(r) as T) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: isBytesCap(err) ? "bytes-cap" : "failed", message };
  }
}
```

Note: the `BigQueryDate` test class has a single `value` key, like the real classes; `Big` is detected by `toNumber`. Run → PASS.

- [ ] **Step 5.3: Cache helpers, tests first (Review Focus 3)**

`src/bq/cache.test.ts` (node):

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cacheProfile, TAGS, usesCache } from "./cache-rules";

describe("cache rules", () => {
  it("sets stale, revalidate and expire explicitly", () => {
    expect(cacheProfile(3600)).toEqual({ stale: 300, revalidate: 3600, expire: 7200 });
    expect(cacheProfile(60)).toEqual({ stale: 60, revalidate: 60, expire: 120 });
  });
  it("skips the cache for Live and for TTL 0", () => {
    expect(usesCache({ live: false, ttl: 3600 })).toBe(true);
    expect(usesCache({ live: true, ttl: 3600 })).toBe(false);
    expect(usesCache({ live: false, ttl: 0 })).toBe(false);
  });
  it("prefixes every tag with rtd:", () => {
    expect([TAGS.data("demo"), TAGS.discovery("demo"), TAGS.apps, TAGS.config].every((t) => t.startsWith("rtd:"))).toBe(true);
  });
});
```

`src/bq/cache-rules.ts` (pure, no Next imports):

```ts
export const TAGS = {
  data: (appId: string) => `rtd:bq:${appId}`,
  discovery: (appId: string) => `rtd:discovery:${appId}`,
  apps: "rtd:apps",
  config: "rtd:config",
} as const;

export const DAY_SECONDS = 86_400;

export function cacheProfile(ttl: number) {
  return { stale: Math.min(300, ttl), revalidate: ttl, expire: 2 * ttl };
}

export function usesCache(opts: { live: boolean; ttl: number }): boolean {
  return !opts.live && opts.ttl > 0;
}
```

`src/bq/client.ts`:

```ts
// Keyless BigQuery access (spec section 2): Vercel OIDC token -> GCP STS -> short-lived token of the
// rt-analytics-dashboard service account. Without the GCP_* identity variables (local tests), the client
// falls back to Application Default Credentials (your gcloud login).
import { BigQuery } from "@google-cloud/bigquery";
import { getVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient } from "google-auth-library";
import type { DashboardEnv } from "@/env";

export function createBigQuery(env: DashboardEnv): BigQuery {
  const { projectId, projectNumber, serviceAccountEmail, poolId, providerId } = env.gcp;
  if (!projectNumber || !serviceAccountEmail || !poolId || !providerId) {
    return new BigQuery({ projectId, location: "EU" });
  }
  const authClient = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
  });
  if (!authClient) throw new Error("Could not build the GCP external account client");
  return new BigQuery({ projectId, location: "EU", authClient });
}
```

`src/bq/query.ts`:

```ts
// query(): the uncached path (Live, TTL 0, writes) or the shared 'use cache: remote' path (spec section 5).
import { cacheLife, cacheTag } from "next/cache";
import { cookies } from "next/headers";
import { readEnv } from "@/env";
import { cacheProfile, usesCache } from "./cache-rules";
import { createBigQuery } from "./client";
import { runQuery, type QueryResult, type QuerySpec } from "./run-query";

export const LIVE_COOKIE = "rtd_live";

export async function isLive(): Promise<boolean> {
  return (await cookies()).get(LIVE_COOKIE)?.value === "1";
}

function runNow<T>(spec: QuerySpec): Promise<QueryResult<T>> {
  const env = readEnv();
  return runQuery<T>(createBigQuery(env), spec, env.maxBytesPerQuery);
}

/** Failures throw so they are never stored in the cache. */
async function runCached(spec: QuerySpec, tags: string[], ttl: number): Promise<unknown[]> {
  "use cache: remote";
  cacheTag(...tags);
  cacheLife(cacheProfile(ttl));
  const res = await runNow<unknown>(spec);
  if (!res.ok) throw new Error(`${res.error}|${res.message}`);
  return res.rows;
}

export async function query<T>(spec: QuerySpec, opts: { tags: string[]; ttl: number; live: boolean }): Promise<QueryResult<T>> {
  if (!usesCache(opts)) return runNow<T>(spec);
  try {
    return { ok: true, rows: (await runCached(spec, opts.tags, opts.ttl)) as T[] };
  } catch (err) {
    const [code, ...rest] = (err instanceof Error ? err.message : String(err)).split("|");
    return { ok: false, error: code === "bytes-cap" ? "bytes-cap" : "failed", message: rest.join("|") || String(err) };
  }
}

/** Uncached, for DML writes (config). */
export const execute = runNow;
```

- [ ] **Step 5.4: Verify and commit**

`npm test -w rt-analytics-dashboard && npm run typecheck -w rt-analytics-dashboard && npm run lint -w rt-analytics-dashboard`, then `git commit -m "feat(dashboard): BigQuery client (Vercel OIDC), runQuery with byte cap, cached query path"`.

---

### Task 6: Discovery and the app picker (PR 6, the proof query)

**Files:** Create `src/discovery/sql.ts` (+ `.test.ts`), `src/discovery/data.ts`, `src/app/page.tsx` (replace template), `src/app/loading.tsx`, `src/components/query-error.tsx`

**Interfaces:**
- Consumes: `QuerySpec`, `query`, `TAGS`, `DAY_SECONDS`, `readEnv`, `requireUser`.
- Produces: `APP_ID_RE = /^[a-z0-9_-]{1,32}$/i` (same rule as the ingest); `appListQuery(env)`, `eventNamesQuery(env, appId)`, `propKeysQuery(env, appId)`; `isUsablePropKey(key: string): boolean`; `listApps(): Promise<QueryResult<{ app_id: string }>>`, `listEvents(appId)`, `listPropKeys(appId)`; `<QueryError result />`.

- [ ] **Step 6.1: Failing tests (Review Focus 4)**

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readEnv } from "@/env";
import { APP_ID_RE, appListQuery, eventNamesQuery, isUsablePropKey, propKeysQuery } from "./sql";

const env = readEnv({ GCP_PROJECT_ID: "robin-thues" });

describe("discovery SQL", () => {
  it("app list reads 7 days plus configured apps, no app filter", () => {
    const q = appListQuery(env);
    expect(q.sql).toContain("`robin-thues.analytics.events`");
    expect(q.sql).toContain("INTERVAL 7 DAY");
    expect(q.sql).toContain("`robin-thues.analytics_dashboard.dashboard_config`");
    expect(q.params).toEqual({});
  });

  it("event names: 30 days, app filter as a parameter, no $ events, id counts", () => {
    const evil = "x' OR 1=1 --";
    const q = eventNamesQuery(env, evil);
    expect(q.sql).not.toContain(evil);
    expect(q.params).toEqual({ app_id: evil });
    expect(q.sql).toContain("app_id = @app_id");
    expect(q.sql).toContain("INTERVAL 30 DAY");
    expect(q.sql).toContain("NOT STARTS_WITH(event_name, '$')");
    expect(q.sql).toContain("COUNTIF(visitor_id IS NOT NULL)");
  });

  it("prop keys: 7 days, scalar values only", () => {
    const q = propKeysQuery(env, "demo");
    expect(q.sql).toContain("UNNEST(JSON_KEYS(props, 1))");
    expect(q.sql).toContain("JSON_TYPE(props[k]) IN ('string', 'number', 'boolean')");
    expect(q.sql).toContain("INTERVAL 7 DAY");
  });

  it("app ids follow the ingest rule", () => {
    expect(APP_ID_RE.test("wetter-in-kalender")).toBe(true);
    expect(APP_ID_RE.test("demo")).toBe(true);
    expect(APP_ID_RE.test("a b")).toBe(false);
    expect(APP_ID_RE.test("x".repeat(33))).toBe(false);
  });

  it("usable prop keys: not quoted, at most 128 characters", () => {
    expect(isUsablePropKey("place")).toBe(true);
    expect(isUsablePropKey("my-key")).toBe(true);
    expect(isUsablePropKey('"a.b"')).toBe(false);
    expect(isUsablePropKey("k".repeat(129))).toBe(false);
    expect(isUsablePropKey("")).toBe(false);
  });
});
```

- [ ] **Step 6.2: Implement `src/discovery/sql.ts`**

```ts
import type { DashboardEnv } from "@/env";
import type { QuerySpec } from "@/bq/run-query";

/** Same rule as the ingest handler's app id validation. */
export const APP_ID_RE = /^[a-z0-9_-]{1,32}$/i;

export function appListQuery(env: DashboardEnv): QuerySpec {
  return {
    sql: `SELECT app_id FROM (
  SELECT DISTINCT app_id FROM ${env.analyticsTable}
  WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
  UNION DISTINCT
  SELECT app_id FROM ${env.configTable}
) ORDER BY app_id`,
    params: {},
  };
}

export function eventNamesQuery(env: DashboardEnv, appId: string): QuerySpec {
  return {
    sql: `SELECT event_name, COUNT(*) AS events,
  COUNTIF(visitor_id IS NOT NULL) AS with_visitor, COUNTIF(session_id IS NOT NULL) AS with_session
FROM ${env.analyticsTable}
WHERE app_id = @app_id
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
  AND NOT STARTS_WITH(event_name, '$')
GROUP BY event_name
ORDER BY events DESC`,
    params: { app_id: appId },
  };
}

export function propKeysQuery(env: DashboardEnv, appId: string): QuerySpec {
  return {
    sql: `SELECT event_name, k AS prop_key, COUNT(*) AS n
FROM ${env.analyticsTable}, UNNEST(JSON_KEYS(props, 1)) AS k
WHERE app_id = @app_id
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
  AND NOT STARTS_WITH(event_name, '$')
  AND props IS NOT NULL
  AND JSON_TYPE(props[k]) IN ('string', 'number', 'boolean')
GROUP BY event_name, prop_key
ORDER BY event_name, n DESC`,
    params: { app_id: appId },
  };
}

/** JSON_KEYS quotes keys it cannot express as a plain path (e.g. "a.b"); those are skipped. */
export function isUsablePropKey(key: string): boolean {
  return key.length > 0 && key.length <= 128 && !key.startsWith('"');
}
```

`src/discovery/data.ts`:

```ts
import { DAY_SECONDS, TAGS } from "@/bq/cache-rules";
import { query } from "@/bq/query";
import { readEnv } from "@/env";
import { appListQuery, eventNamesQuery, isUsablePropKey, propKeysQuery } from "./sql";

// Discovery is cached for a day and is not skipped by Live (spec section 5); Refresh updates it.
const opts = (tags: string[]) => ({ tags, ttl: DAY_SECONDS, live: false });

export const listApps = () => query<{ app_id: string }>(appListQuery(readEnv()), opts([TAGS.apps]));

export const listEvents = (appId: string) =>
  query<{ event_name: string; events: number; with_visitor: number; with_session: number }>(
    eventNamesQuery(readEnv(), appId),
    opts([TAGS.discovery(appId)]),
  );

export async function listPropKeys(appId: string) {
  const res = await query<{ event_name: string; prop_key: string; n: number }>(
    propKeysQuery(readEnv(), appId),
    opts([TAGS.discovery(appId)]),
  );
  return res.ok ? { ...res, rows: res.rows.filter((r) => isUsablePropKey(r.prop_key)) } : res;
}
```

- [ ] **Step 6.3: App picker page**

`src/components/query-error.tsx`: renders nothing for `ok` results; for `bytes-cap`: "This query would scan more than {formatBytes(maxBytes)}. Choose a shorter date range."; for `failed`: "Could not load this panel." plus a "Retry" link to the current URL. `formatBytes` (in `src/lib/format.ts`, tested): `1_000_000_000 → "1 GB"`, `500_000_000 → "500 MB"`.

`src/app/page.tsx`:

```tsx
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/auth/session";
import { QueryError } from "@/components/query-error";
import { listApps } from "@/discovery/data";

async function Apps() {
  await requireUser();
  const apps = await listApps();
  if (!apps.ok) return <QueryError result={apps} />;
  if (apps.rows.length === 0) return <p>No apps have sent events in the last 7 days.</p>;
  return (
    <ul className="space-y-2">
      {apps.rows.map(({ app_id }) => (
        <li key={app_id}>
          <Link className="underline" href={`/${encodeURIComponent(app_id)}`}>
            {app_id}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Apps</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <Apps />
      </Suspense>
    </main>
  );
}
```

- [ ] **Step 6.4: Verify locally against demo data**

`claude-tmp-helpers/dashboard-local-env.sh` writes `apps/dashboard/.env.local` (gitignored) with `GCP_PROJECT_ID=robin-thues`, `DASHBOARD_ALLOWED_EMAILS=robinthues@googlemail.com`, `BETTER_AUTH_SECRET=<random 32 bytes hex>`, `BETTER_AUTH_URL=http://localhost:3000`, `DASHBOARD_TEST_LOGIN=1`, `DASHBOARD_TEST_LOGIN_SECRET=<random 32 bytes hex>`, only if the file does not exist yet. Without GCP_* identity variables the client uses your gcloud ADC (local only).

```bash
claude-tmp-helpers/dashboard-local-env.sh
npm run build -w rt-analytics-dashboard && (cd apps/dashboard && npx next start -p 3200 &) ; sleep 8
claude-tmp-helpers/dashboard-smoke.sh   # test login via curl, then GET / with the cookie; prints whether "demo" and "wetter-in-kalender" appear
fuser -k 3200/tcp
```

`claude-tmp-helpers/dashboard-smoke.sh`: POST `/api/auth/test-login` with the secret header and `{ "email": "robinthues@googlemail.com" }`, store cookies with `curl -c`, then `curl -b` GET `/` and grep for `href="/demo"`. Expected: both app ids appear; second GET within the TTL is served from the cache (check server log: one BigQuery job only; or measure time).

Commit: `git commit -m "feat(dashboard): discovery queries and the app picker"`.

---

### Task 7: Time, view state, settings, header and the app page (PR 7, branch `feat/dashboard-part-2` from `feat/dashboard-part-1`)

**Files:** Create `src/time/range.ts` (+ test), `src/view/state.ts` (+ test), `src/config/settings.ts` (+ test), `src/config/data.ts`, `src/app/[appId]/layout.tsx`, `src/app/[appId]/page.tsx`, `src/app/[appId]/loading.tsx`, `src/app/[appId]/settings/page.tsx`, `src/app/[appId]/actions.ts`, `src/components/header.tsx`, `src/lib/format.ts` (+ test, if not done in Task 6)

**Interfaces:**
- Produces:
  - `todayIn(tz: string, now: Date): string`; `addDays(day: string, n: number): string`; `daysBetween(from: string, to: string): number`; `defaultRange(today: string): DateRange` (28 days incl. today); `rangeBounds(range: DateRange, tz: string): { fromTs: string; toTs: string }` (ISO UTC instants of from 00:00 and to+1 00:00 in tz); `type DateRange = { from: string; to: string }`
  - `parseViewState(params: Record<string, string | string[] | undefined>, today: string): { range: DateRange; compare: boolean }` (invalid → defaults; max 400 days; from ≤ to; to ≤ today)
  - `type AppSettings = { timezone: string; hosts: string[] }`; `DEFAULT_SETTINGS`; `parseSettings(raw: unknown): AppSettings`; `readSettingsQuery(env, appId)`; `saveSettingsQuery(env, appId, settings, email)`
  - `getSettings(appId): Promise<AppSettings>` (cached, tag `rtd:config`), server actions `saveSettings`, `toggleLive`, `refreshApp`

- [ ] **Step 7.1: Time tests first**

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addDays, daysBetween, defaultRange, rangeBounds, todayIn } from "./range";

describe("time", () => {
  it("today in a timezone", () => {
    expect(todayIn("Europe/Berlin", new Date("2026-10-13T22:30:00Z"))).toBe("2026-10-14");
    expect(todayIn("UTC", new Date("2026-10-13T22:30:00Z"))).toBe("2026-10-13");
  });
  it("adds days across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-01", "2026-10-28")).toBe(27);
  });
  it("default range is 28 days including today", () => {
    expect(defaultRange("2026-10-14")).toEqual({ from: "2026-09-17", to: "2026-10-14" });
  });
  it("bounds are local midnights in UTC, also over DST changes", () => {
    expect(rangeBounds({ from: "2026-10-24", to: "2026-10-25" }, "Europe/Berlin")).toEqual({
      fromTs: "2026-10-23T22:00:00.000Z", // CEST
      toTs: "2026-10-25T23:00:00.000Z", // CET after the change on 2026-10-25
    });
    expect(rangeBounds({ from: "2026-03-29", to: "2026-03-29" }, "Europe/Berlin")).toEqual({
      fromTs: "2026-03-28T23:00:00.000Z",
      toTs: "2026-03-29T22:00:00.000Z",
    });
  });
});
```

- [ ] **Step 7.2: Implement `src/time/range.ts`**

```ts
export type DateRange = { from: string; to: string };

const DAY_MS = 86_400_000;
const toUtcMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const fromUtcMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function todayIn(tz: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const addDays = (day: string, n: number) => fromUtcMs(toUtcMs(day) + n * DAY_MS);
export const daysBetween = (from: string, to: string) => Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
export const defaultRange = (today: string): DateRange => ({ from: addDays(today, -27), to: today });

/** Offset of tz from UTC in minutes at the given instant. */
function offsetMinutes(tz: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at) / 60_000);
}

/** UTC instant of 00:00 local time on `day` in `tz`. */
function localMidnight(day: string, tz: string): number {
  const guess = toUtcMs(day);
  const first = guess - offsetMinutes(tz, guess) * 60_000;
  return guess - offsetMinutes(tz, first) * 60_000;
}

export function rangeBounds(range: DateRange, tz: string): { fromTs: string; toTs: string } {
  return {
    fromTs: new Date(localMidnight(range.from, tz)).toISOString(),
    toTs: new Date(localMidnight(addDays(range.to, 1), tz)).toISOString(),
  };
}
```

Run → PASS.

- [ ] **Step 7.3: View state and settings, tests first (Review Focus 5)**

`src/view/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseViewState } from "./state";

const today = "2026-10-14";

describe("parseViewState", () => {
  it("defaults to 28 days with compare on", () => {
    expect(parseViewState({}, today)).toEqual({ range: { from: "2026-09-17", to: today }, compare: true });
  });
  it("reads a valid range and compare=0", () => {
    expect(parseViewState({ from: "2026-10-01", to: "2026-10-07", compare: "0" }, today)).toEqual({
      range: { from: "2026-10-01", to: "2026-10-07" },
      compare: false,
    });
  });
  it("falls back for broken, reversed, future or too long ranges", () => {
    const d = parseViewState({}, today).range;
    for (const p of [
      { from: "x", to: "2026-10-07" },
      { from: "2026-10-07", to: "2026-10-01" },
      { from: "2026-10-01", to: "2026-12-01" },
      { from: "2024-01-01", to: "2026-10-01" },
      { from: ["2026-10-01"], to: "2026-10-07" },
    ]) expect(parseViewState(p, today).range).toEqual(d);
  });
});
```

`src/view/state.ts`:

```ts
import { daysBetween, defaultRange, type DateRange } from "@/time/range";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;
type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const validDay = (d: string | undefined): d is string => !!d && DAY_RE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

export function parseViewState(params: Params, today: string): { range: DateRange; compare: boolean } {
  const from = one(params.from);
  const to = one(params.to);
  const ok = validDay(from) && validDay(to) && from <= to && to <= today && daysBetween(from, to) < MAX_DAYS;
  return { range: ok ? { from, to } : defaultRange(today), compare: one(params.compare) !== "0" };
}
```

`src/config/settings.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readEnv } from "@/env";
import { DEFAULT_SETTINGS, parseSettings, readSettingsQuery, saveSettingsQuery } from "./settings";

const env = readEnv({ GCP_PROJECT_ID: "robin-thues" });

describe("parseSettings", () => {
  it("defaults when missing or broken, never throws", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("junk")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ timezone: "Mars/Base", hosts: "x" })).toEqual(DEFAULT_SETTINGS);
  });
  it("keeps a valid timezone and clean hostnames", () => {
    expect(parseSettings({ timezone: "Europe/Vienna", hosts: ["Wetter-in-Kalender.de", "bad host", "x".repeat(300)] })).toEqual({
      timezone: "Europe/Vienna",
      hosts: ["wetter-in-kalender.de"],
    });
  });
});

describe("settings SQL", () => {
  it("reads and merges by kind and id with parameters only", () => {
    const r = readSettingsQuery(env, "demo");
    expect(r.params).toEqual({ app_id: "demo" });
    expect(r.sql).toContain("kind = 'app_settings'");
    const w = saveSettingsQuery(env, "demo", { timezone: "UTC", hosts: [] }, "robin@example.com");
    expect(w.sql).toContain("MERGE `robin-thues.analytics_dashboard.dashboard_config`");
    expect(w.params).toEqual({ app_id: "demo", value: '{"timezone":"UTC","hosts":[]}', email: "robin@example.com" });
  });
});
```

`src/config/settings.ts`:

```ts
import type { QuerySpec } from "@/bq/run-query";
import type { DashboardEnv } from "@/env";

export type AppSettings = { timezone: string; hosts: string[] };
export const DEFAULT_SETTINGS: AppSettings = { timezone: "Europe/Berlin", hosts: [] };

const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

function validTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Never throws: bad stored values fall back to defaults so an app's queries keep working. */
export function parseSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS;
  const r = raw as { timezone?: unknown; hosts?: unknown };
  if (!validTimezone(r.timezone)) return DEFAULT_SETTINGS;
  const hosts = Array.isArray(r.hosts)
    ? r.hosts.filter((h): h is string => typeof h === "string").map((h) => h.trim().toLowerCase()).filter((h) => HOST_RE.test(h)).slice(0, 20)
    : [];
  return { timezone: r.timezone, hosts };
}

export function readSettingsQuery(env: DashboardEnv, appId: string): QuerySpec {
  return {
    sql: `SELECT TO_JSON_STRING(value) AS value FROM ${env.configTable} WHERE kind = 'app_settings' AND id = @app_id LIMIT 1`,
    params: { app_id: appId },
  };
}

export function saveSettingsQuery(env: DashboardEnv, appId: string, settings: AppSettings, email: string): QuerySpec {
  return {
    sql: `MERGE ${env.configTable} T
USING (SELECT 'app_settings' AS kind, @app_id AS id) S
ON T.kind = S.kind AND T.id = S.id
WHEN MATCHED THEN UPDATE SET value = PARSE_JSON(@value), updated_at = CURRENT_TIMESTAMP(), updated_by = @email
WHEN NOT MATCHED THEN INSERT (kind, id, app_id, name, value, updated_at, updated_by)
  VALUES ('app_settings', @app_id, @app_id, NULL, PARSE_JSON(@value), CURRENT_TIMESTAMP(), @email)`,
    params: { app_id: appId, value: JSON.stringify(settings), email },
  };
}
```

Run all three test files → PASS.

- [ ] **Step 7.4: Data, actions, header and pages**

`src/config/data.ts`:

```ts
import { DAY_SECONDS, TAGS } from "@/bq/cache-rules";
import { query } from "@/bq/query";
import { readEnv } from "@/env";
import { parseSettings, readSettingsQuery, type AppSettings } from "./settings";

export async function getSettings(appId: string): Promise<AppSettings> {
  const res = await query<{ value: string }>(readSettingsQuery(readEnv(), appId), {
    tags: [TAGS.config],
    ttl: DAY_SECONDS,
    live: false,
  });
  const raw = res.ok && res.rows[0] ? (JSON.parse(res.rows[0].value) as unknown) : null;
  return parseSettings(raw);
}
```

`src/app/[appId]/actions.ts` (`"use server"`):
- `toggleLive(appId)`: `requireUser()`; flip cookie `rtd_live` (`httpOnly`, `sameSite: "lax"`, `secure` in production, `path: "/"`, max-age 7 days; delete when turning off); `redirect` back to `/${appId}` keeping the query string (pass it as a hidden form field `qs`, validated to start with `?` or be empty).
- `refreshApp(appId)`: `requireUser()`; `updateTag(TAGS.data(appId))`, `updateTag(TAGS.discovery(appId))`, `updateTag(TAGS.apps)`; redirect back.
- `saveSettings(appId, formData)`: `requireUser()`; `APP_ID_RE` check; `parseSettings({ timezone: formData.get("timezone"), hosts: String(formData.get("hosts") ?? "").split(/[\s,]+/) })`; if the parsed timezone differs from the submitted one, redirect with `?error=timezone`; `execute(saveSettingsQuery(...))`; on failure redirect with `?error=save`; `updateTag(TAGS.config)`; redirect to `/${appId}/settings?saved=1`.

`src/components/header.tsx` (server component, props `{ appId, apps, state, live, qs }`): app links, a GET form with `from`/`to` date inputs and a `compare` checkbox (hidden `compare=0` when unchecked), a form posting to `toggleLive` showing a "Live" `Badge` when on, a form posting to `refreshApp`, a link to settings. Plain forms, no client JavaScript needed.

`src/app/[appId]/layout.tsx`: validates `appId` with `APP_ID_RE` (`notFound()` otherwise); renders children.

`src/app/[appId]/page.tsx`: `requireUser()`, settings → `todayIn(settings.timezone, new Date())` → `parseViewState` → header → one card "Events in range" from a data query (temporary until Phase C):

```ts
// src/app/[appId]/events-in-range.ts — temporary proof of the data path (replaced by the overview in Phase C)
export function eventsInRangeQuery(env: DashboardEnv, appId: string, bounds: { fromTs: string; toTs: string }): QuerySpec {
  return {
    sql: `SELECT COUNT(*) AS events FROM ${env.analyticsTable}
WHERE app_id = @app_id AND timestamp >= TIMESTAMP(@from_ts) AND timestamp < TIMESTAMP(@to_ts)`,
    params: { app_id: appId, from_ts: bounds.fromTs, to_ts: bounds.toTs },
  };
}
```

with a unit test (params only, `timestamp` filter present), run via `query(spec, { tags: [TAGS.data(appId)], ttl: env.cacheTtlSeconds, live: await isLive() })`. Note: the range includes today, so `to_ts` is tomorrow's local midnight, which is stable for the whole day (cache key stable).

`src/app/[appId]/settings/page.tsx`: form with a `<select name="timezone">` filled from `Intl.supportedValuesOf("timeZone")`, a `<textarea name="hosts">`, Save button posting to `saveSettings`; shows "Saved." on `?saved=1` and errors on `?error=…`.

All pages wrap request-time reads (`cookies`, `searchParams`, `params`, session) in `<Suspense>`; each route has `loading.tsx`.

- [ ] **Step 7.5: Verify and commit**

```bash
git switch -c feat/dashboard-part-2
npm test -w rt-analytics-dashboard && npm run lint -w rt-analytics-dashboard && npm run typecheck -w rt-analytics-dashboard && npm run build -w rt-analytics-dashboard
git add -A && git commit -m "feat(dashboard): date range and view state, app settings, header with Live and Refresh"
```

(Create the branch before the first edit of this task.)

---

### Task 8: Vercel build skipping (PR 6, on `feat/dashboard-part-1`, do it right after Task 6)

**Files:** Create `apps/dashboard/scripts/ignore-build.sh`, `apps/dashboard/vercel.json`, `scripts/ignore-build.test.ts` (root, because it builds a temp git repo)

- [ ] **Step 8.1: Failing test**

```ts
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../apps/dashboard/scripts/ignore-build.sh", import.meta.url));

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "rtd-ignore-"));
  const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  mkdirSync(join(dir, "apps/dashboard"), { recursive: true });
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "apps/dashboard/a.txt"), "1");
  git("add", "-A");
  git("commit", "-qm", "base");
  return { dir, git };
}

function run(dir: string, previous: string) {
  return spawnSync("bash", [script], { cwd: join(dir, "apps/dashboard"), env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: previous } }).status;
}

describe("ignore-build.sh (exit 0 = skip)", () => {
  it("builds when there is no previous deployment", () => {
    expect(run(repo().dir, "")).toBe(1);
  });
  it("skips docs-only changes", () => {
    const { dir, git } = repo();
    const base = git("rev-parse", "HEAD");
    writeFileSync(join(dir, "docs/x.md"), "x");
    git("add", "-A");
    git("commit", "-qm", "docs");
    expect(run(dir, base)).toBe(0);
  });
  it("builds dashboard changes", () => {
    const { dir, git } = repo();
    const base = git("rev-parse", "HEAD");
    writeFileSync(join(dir, "apps/dashboard/a.txt"), "2");
    git("add", "-A");
    git("commit", "-qm", "app");
    expect(run(dir, base)).toBe(1);
  });
  it("builds when the previous commit is unknown (shallow clone)", () => {
    expect(run(repo().dir, "0123456789abcdef0123456789abcdef01234567")).not.toBe(0);
  });
});
```

Run → FAIL (script missing).

- [ ] **Step 8.2: Script and config**

`apps/dashboard/scripts/ignore-build.sh`:

```bash
#!/usr/bin/env bash
# Vercel "Ignored Build Step" for the dashboard (spec section 10). Runs inside apps/dashboard.
# Exit 0 skips the build; any other exit code builds.
if [ -z "${VERCEL_GIT_PREVIOUS_SHA:-}" ]; then
  exit 1 # first deployment of this branch
fi
git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- ':/apps/dashboard' ':/packages/rt-analytics' ':/package-lock.json'
```

`apps/dashboard/vercel.json`:

```json
{ "ignoreCommand": "bash scripts/ignore-build.sh" }
```

Run the test → PASS. Commit: `git commit -m "feat(dashboard): skip Vercel builds that do not touch the dashboard or the library"`.

---

### Task 9: Run the GCP setup (operational, needs Robin's OK)

- [ ] **Step 9.1: Ask Robin**, listing exactly what will be created in project `robin-thues`: APIs iam/sts/iamcredentials enabled; dataset `analytics_dashboard` with table `dashboard_config`; service account `rt-analytics-dashboard` (no keys) with `roles/bigquery.jobUser` on the project, READER on `analytics`, WRITER on `analytics_dashboard`; workload identity pool `vercel` with OIDC provider `vercel` trusting only `robinthues-projects/rt-analytics-dashboard` production and development; `roles/iam.workloadIdentityUser` for the pool. Wait for the OK.

- [ ] **Step 9.2: Run**

```bash
npm run setup:gcp -- --dashboard --vercel-team robinthues-projects --vercel-project rt-analytics-dashboard
```

Expected: each step prints created/exists; the final block prints the five `GCP_*` values. Run it a second time: everything says "exists"/"already granted" (idempotent). Record the values in the ledger.

---

### Task 10: End-to-end test (PR 7, branch `feat/dashboard-part-2`)

**Files:** Create `apps/dashboard/playwright.config.ts`, `apps/dashboard/e2e/dashboard.spec.ts`

- [ ] **Step 10.1: Config**

```ts
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "@playwright/test";

// next start loads env files in production mode; load the development files explicitly (spec section 9).
const { combinedEnv } = loadEnvConfig(__dirname, true);

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:3300" },
  webServer: {
    command: "npx next start -p 3300",
    url: "http://localhost:3300/sign-in",
    env: Object.fromEntries(Object.entries(combinedEnv).filter(([, v]) => v !== undefined)) as Record<string, string>,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
```

(`__dirname` is not defined in ESM config files; use `path.dirname(fileURLToPath(import.meta.url))` if Playwright loads the config as ESM.)

- [ ] **Step 10.2: Spec**

```ts
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const res = await page.request.post("/api/auth/test-login", {
    headers: { "x-test-login-secret": process.env.DASHBOARD_TEST_LOGIN_SECRET ?? "" },
    data: { email: (process.env.DASHBOARD_ALLOWED_EMAILS ?? "").split(",")[0] },
  });
  expect(res.ok()).toBe(true);
});

test("app picker lists the demo app and the app page shows events", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "demo" }).click();
  await expect(page).toHaveURL(/\/demo/);
  await expect(page.getByTestId("events-in-range")).not.toHaveText("0");
});

test("Live toggle and Refresh", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: /live/i }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /live/i }).click();
  await page.getByRole("button", { name: /refresh/i }).click();
  await expect(page.getByTestId("events-in-range")).toBeVisible();
});

test("settings: save and read back the timezone", async ({ page }) => {
  await page.goto("/demo/settings");
  await page.getByLabel("Timezone").selectOption("Europe/Vienna");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Timezone")).toHaveValue("Europe/Vienna");
  await page.getByLabel("Timezone").selectOption("Europe/Berlin");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
});

test("unauthenticated visitors go to sign-in", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("http://localhost:3300/demo");
  await expect(page).toHaveURL(/\/sign-in/);
});
```

(The page from Task 7 renders the count with `data-testid="events-in-range"`.)

- [ ] **Step 10.3: Run**

```bash
npx playwright install chromium
npm run build -w rt-analytics-dashboard && npm run e2e -w rt-analytics-dashboard
```

Expected: 4 passed. This writes one `app_settings` row for `demo` (back to Europe/Berlin at the end). Commit: `git commit -m "test(dashboard): Playwright end-to-end against demo data"`.

---

### Task 11: Vercel project and first deploy (operational, needs Robin's OK and Robin's OAuth client)

- [ ] **Step 11.1: Ask Robin** for the OK to: create Vercel project `rt-analytics-dashboard` in `robinthues-projects` connected to `RobinThues/rt-analytics`, root directory `apps/dashboard`, include files outside the root, Node 24, OIDC team issuer mode; add the non-secret env vars (production and development) and a generated `BETTER_AUTH_SECRET` (production, sensitive); deploy production from the merged `main`. And ask Robin to create the Google OAuth client (click steps below) and add `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` himself (`vercel env add GOOGLE_CLIENT_SECRET production --sensitive` in `apps/dashboard`), or hand the client id to Claude and add only the secret himself.

Google OAuth client click steps (Google Cloud console, project `robin-thues`):
1. APIs & Services → OAuth consent screen: External, app name "rt-analytics dashboard", support email Robin's; publish "In production" (or keep testing and add Robin as test user).
2. APIs & Services → Credentials → Create credentials → OAuth client ID → Web application, name "rt-analytics dashboard".
3. Authorized redirect URIs: `https://<production URL>/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`.
4. Copy client ID and secret into the password manager first, then into Vercel.

- [ ] **Step 11.2: Create and configure** (after the OK; Vercel CLI in `apps/dashboard`, team `robinthues-projects`): `vercel link`, project settings via the Vercel MCP `update_project` (rootDirectory, sourceFilesOutsideRootDirectory, nodeVersion, OIDC issuer mode), env vars via `vercel env add`. Then `vercel env pull .env.development.local` locally and check that the dev OIDC token works: `npm run dev -w rt-analytics-dashboard` plus the smoke script now goes through WIF (log line from `createBigQuery` path or temporarily print `authClient` type).

- [ ] **Step 11.3: Deploy and verify**: production deploy; Robin signs in with Google; `/` lists apps (proof query through OIDC + cached path). Forced stale revalidation check: set `DASHBOARD_CACHE_TTL_SECONDS=60` in production for the check, load `/demo` twice more than 60 s apart, confirm no error and a fresh BigQuery job in the GCP console job history from `rt-analytics-dashboard@`; set TTL back to 3600 and redeploy.

- [ ] **Step 11.4: Wrap-up**: whole-branch review (fresh reviewer), fix pass, merge order `feat/gcp-dashboard` → `feat/dashboard-part-1` → `feat/dashboard-part-2` into `main` after Robin's choice.
