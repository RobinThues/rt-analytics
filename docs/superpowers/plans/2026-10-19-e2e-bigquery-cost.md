# Cheaper e2e on BigQuery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Local work can never block production BigQuery, the default e2e run bills nothing, and an
overview load runs 5 data jobs instead of 15.

**Architecture:** A second keyless service account for Vercel "development" tokens with a per-user
quota (part A). Every job carries `rtd_source` / `rtd_query` labels (part B). Breakdowns and quality
panels each read one merged query through a `cache()`d loader (part C). A fixture `QueryClient` replays
recorded rows in e2e, with a fixed "today" and discovery windows anchored to that day (part D).

**Tech Stack:** Next.js 16 App Router, `@google-cloud/bigquery` 9, Vitest + happy-dom, Playwright,
gcloud CLI, Vercel CLI.

**Spec:** `docs/superpowers/specs/2026-10-19-e2e-bigquery-cost-design.md` (approved by Robin 2026-10-19).
Branch `feat/e2e-bigquery-cost`.

## Global Constraints

- No GCP or Vercel change without Robin's OK in chat for that step (Task 2). Pushing main deploys and
  needs Robin's explicit "push and deploy".
- Never commit secrets, `.env*` files or `key.json`; the GitHub repo is public. No real
  wetter-in-kalender rows in fixtures.
- `DASHBOARD_FIXTURES`, `DASHBOARD_FIXED_TODAY`, `DASHBOARD_JOB_SOURCE` are local only; a deployment
  (`VERCEL_ENV` `production` or `preview`) with any of them set must fail at startup.
- Dev service account `rt-analytics-dashboard-dev`; per-user quota `QueryUsagePerUserPerDay` = 10 GiB;
  project quota `QueryUsagePerDay` stays 30 GiB.
- Fixed e2e day `2026-10-13` (last demo day). Replay delay 150 ms per query.
- Fixture allowlist: `demo`, `demo-b`. Fixtures in `apps/dashboard/e2e/fixtures/<name>-<hash>.json`.
- Targets: `npm run e2e` bills 0; `npm run e2e:bq` ≤ 0.5 GiB (aim 0.3); `npm run e2e:record` ≤ 1.5 GiB.
- Commit messages: conventional style as in `git log`; no Claude attribution trailers (Robin's rule).
- Every e2e run against real BigQuery runs under the dev account only after Task 2 is applied.

## Review Focus

1. Recording while a test touches another app (`app_id` = `wetter-in-kalender`): the recorder must
   refuse and write nothing → test in Task 7.
2. `DASHBOARD_FIXED_TODAY` set to a non-day (`2026-13-01`, `today`) → startup error, never a silent
   real clock → test in Task 4.
3. An app with no events (`demo-b`): merged results are empty → every breakdown and quality panel shows
   its empty state, not an error → tests in Tasks 5 and 6.
4. The same spec built with params in a different key order must give the same fixture file → test in
   Task 7.
5. Eight breakdown panels on one page must cause one BigQuery job, not eight → test in Task 5.

---

### Task 1: Setup script: dev service account, per-subject bindings, per-user quota

**Files:**
- Modify: `scripts/gcp-dashboard.ts`, `scripts/setup-gcp.ts` (flag parsing only)
- Test: `scripts/gcp-dashboard.test.ts`
- Docs: `docs/superpowers/specs/2026-10-14-dashboard-design.md` section 2 ("Identity without keys",
  "Cost guards") and the section 10 env table row for `GCP_SERVICE_ACCOUNT_EMAIL`

**Interfaces:**
- Produces: `DASHBOARD_DEV_SA = "rt-analytics-dashboard-dev"`;
  `wifConfig(...)` gains `subjectPrincipal(env: "production" | "development"): string`;
  `setupDashboard(projectId, { team, project, perUserQuotaGib, keepPoolBinding })`.

- [ ] **Step 1: Write the failing tests** in `scripts/gcp-dashboard.test.ts`:

```ts
it("binds one subject per environment", () => {
  expect(c.subjectPrincipal("production")).toBe(
    "principal://iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/vercel/subject/" +
      "owner:robinthues-projects:project:rt-analytics-dashboard:environment:production",
  );
  expect(c.subjectPrincipal("development")).toMatch(/:environment:development$/);
});
it("names the dev service account", () => expect(DASHBOARD_DEV_SA).toBe("rt-analytics-dashboard-dev"));
```

- [ ] **Step 2: Run** `npx vitest run scripts/gcp-dashboard.test.ts` from the repo root. Expected: FAIL
  (`subjectPrincipal` / `DASHBOARD_DEV_SA` missing).

- [ ] **Step 3: Implement in `scripts/gcp-dashboard.ts`.** Keep `principalSet` (needed for removal).
  Delete the old step 6 that adds the pool-wide `principalSet` binding (`gcp-dashboard.ts:153-163`).
  `setupDashboard` now, in this order:
  1. creates both service accounts (loop over `[DASHBOARD_SA, DASHBOARD_DEV_SA]`), same three grants each;
  2. adds `roles/iam.workloadIdentityUser` on the prod SA for `subjectPrincipal("production")` and on the
     dev SA for `subjectPrincipal("development")`;
  3. then, unless `keepPoolBinding` is set, removes the `principalSet` binding from the prod SA with
     `tryGcloud("iam","service-accounts","remove-iam-policy-binding", saEmail, inProject, "--role=roles/iam.workloadIdentityUser", "--member=" + wif.principalSet, "--quiet")`
     (null = binding not present, log "already removed"). `--keep-pool-binding` in `setup-gcp.ts` sets
     `keepPoolBinding` (two-phase apply in Task 2);
  4. sets the quota preference `rt-analytics-query-usage-per-user-per-day` with
     `--quota-id=QueryUsagePerUserPerDay --preferred-value=<gib*1024>` and the same flags as the project
     quota in `setup-gcp.ts`;
  5. prints the env vars with `GCP_SERVICE_ACCOUNT_EMAIL` once per environment (Production → prod SA,
     Development → dev SA).
  Update the file's header comment (lines 1-3: one account per environment). In `setup-gcp.ts` parse `--per-user-query-quota-gib` (default 10,
  positive number, same validation as `--query-quota-gib`) and pass it on.

- [ ] **Step 4: Run** `npx vitest run scripts/gcp-dashboard.test.ts` and `npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Update the v1 spec** section 2 (two accounts, per-subject bindings, pool-wide binding
  removed, per-user quota 10 GiB and what it caps) and the section 10 env table
  (`GCP_SERVICE_ACCOUNT_EMAIL`: production = prod SA, development = dev SA).

- [ ] **Step 6: Commit** `feat(gcp): dev service account per Vercel environment and a per-user query quota`.

### Task 2: Apply part A (needs Robin's OK before step 2)

**Files:**
- Create: `claude-tmp-helpers/check-sa-split.ts` (gitignored helper)

**Interfaces:**
- Consumes: Task 1's `setupDashboard`; `createBigQuery(env)` from `apps/dashboard/src/bq/client.ts`.

- [ ] **Step 1: Write `claude-tmp-helpers/check-sa-split.ts`** (usage comment at top):
  `tsx claude-tmp-helpers/check-sa-split.ts <env-file> <service-account-email>` loads the env file into
  `process.env` (`getVercelOidcToken()` reads `VERCEL_OIDC_TOKEN` there), prints the token's `sub` and
  `exp` and refuses an expired token (otherwise `@vercel/oidc` silently fetches a development token),
  overrides `GCP_SERVICE_ACCOUNT_EMAIL`, calls `createBigQuery(readEnv()).authClient.getAccessToken()` and
  prints `OK` or `DENIED: <error name>`. No query, costs nothing.

- [ ] **Step 2: Robin's OK** was given on 2026-10-19 (setup run and Vercel env change).

- [ ] **Step 3: Phase 1, add only.** `npm run setup:gcp -- --dashboard --vercel-team robinthues-projects --keep-pool-binding`.
  Expected log: dev SA created, both subject bindings granted, pool binding kept, per-user quota 10 GiB
  requested.

- [ ] **Step 4: Vercel env, add before remove.** From the repo root: `vercel env ls` to see the entries.
  If `GCP_SERVICE_ACCOUNT_EMAIL` is one entry for both environments, first add a Production-only entry
  with the prod SA, then remove the shared one, then add the Development entry
  `rt-analytics-dashboard-dev@robin-thues.iam.gserviceaccount.com`. Never leave Production without the
  variable. Then `vercel env pull apps/dashboard/.env.development.local --yes`.

- [ ] **Step 5: Check phase 1.** `check-sa-split.ts apps/dashboard/.env.development.local <dev SA>` → `OK`.
  The dev SA has only the subject binding, so this proves the principal format. Retry for up to 5 minutes
  (IAM propagation).

- [ ] **Step 6: Phase 2, remove the pool binding.** Run the setup again without `--keep-pool-binding`.
  Expected: "removed" for the pool binding. Wait 2 minutes, then:
  - `check-sa-split.ts … <prod SA>` with the development token → `DENIED` (retry up to 5 minutes).
  - Production: try `vercel env pull --environment production <scratchpad file>`; if it holds a fresh
    `VERCEL_OIDC_TOKEN` with `environment:production` in `sub`, run `check-sa-split.ts` with it and the prod
    SA → `OK`, then delete the file. Otherwise check production after the final deploy (Task 9) with the
    labels report and `vercel logs`. Rollback if prod fails: re-run with `--keep-pool-binding` and add the
    `principalSet` binding back by hand.
  - `claude-tmp-helpers/set-query-quota.sh show` still 30 GiB; `gcloud quotas preferences describe rt-analytics-query-usage-per-user-per-day --project=robin-thues` shows 10240 MiB granted.
  - After the first local query run (Task 4 baseline), `bq-usage-report.sh 1` shows the jobs under
    `rt-analytics-dashboard-dev`.

### Task 3: Job labels and query names

**Files:**
- Modify: `apps/dashboard/src/bq/run-query.ts`, `apps/dashboard/src/bq/query.ts`, `apps/dashboard/src/env.ts`,
  `apps/dashboard/src/queries/context.ts` (`toSpec`), every builder in `queries/overview.ts`,
  `queries/explorer.ts`, `queries/funnel.ts`, `config/settings.ts`, `config/funnels.ts`, `discovery/sql.ts`
- Create: `claude-tmp-helpers/bq-usage-report.sh` gets a third report grouped by labels
- Test: `bq/run-query.test.ts`, `env.test.ts`, existing builder tests

**Interfaces:**
- Produces:
  - `QUERY_NAMES = ["kpis", "traffic", "breakdown", "web_vitals", "slow_pages", "top_errors", "consent", "retention", "event_list", "event_series", "event_breakdown", "prop_values", "funnel", "app_list", "event_names", "prop_keys", "settings_read", "settings_save", "funnels_list", "funnel_save", "funnel_delete", "check"] as const` and `type QueryName = (typeof QUERY_NAMES)[number]` in `run-query.ts` (`check` is for test-only and dry-run-only specs; Tasks 5 and 6 replace `breakdown` with `breakdowns` and the four quality names with `quality`).
  - `QuerySpec.name: QueryName` (required).
  - `toSpec(name: QueryName, sql, params, types?)`.
  - `type JobSource = "production" | "development" | "e2e"`; `DashboardEnv.jobSource: JobSource`.
  - `runQuery(client, spec, maxBytes, source: JobSource)` passes
    `labels: { rtd_source: source, rtd_query: spec.name }`.

- [ ] **Step 1: Failing tests.** `run-query.test.ts`: the options seen by the client include
  `labels: { rtd_source: "e2e", rtd_query: "kpis" }` for a spec named `kpis` run with source `e2e`; every
  `QUERY_NAMES` entry and every `JobSource` matches BigQuery's label value rule `/^[a-z0-9_-]{1,63}$/`.
  `env.test.ts`: `readEnv({..., VERCEL_ENV: "production"}).jobSource === "production"`;
  `DASHBOARD_JOB_SOURCE: "e2e"` → `"e2e"`; nothing → `"development"`; `DASHBOARD_JOB_SOURCE: "x"` → throws.
  `startupCheck` with `VERCEL_ENV: "production", DASHBOARD_JOB_SOURCE: "e2e"` → throws.

- [ ] **Step 2: Run** `cd apps/dashboard && npx vitest run src/bq src/env.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** Add the deployment guard as `assertLocalOnly(env)` in `env.ts`, called
  from `startupCheck` next to `assertSafeTestLogin`; Tasks 4 and 7 add their variables to the same list
  (`LOCAL_ONLY = ["DASHBOARD_JOB_SOURCE", ...]`). Name every builder; `execute` passes `env.jobSource`.
  Also update the old-signature callers in tests: `src/queries/context.test.ts:69`,
  `src/queries/dry-run.integration.test.ts:61` (name `check`) and the spec literal in
  `src/bq/run-query.test.ts:5`. Update the gitignored helpers that call `runQuery` / `toSpec`
  (`claude-tmp-helpers/run-funnel.ts`, `dump-overview-json.ts`, `run-overview-queries.ts`) so they still
  run (`npx tsx --tsconfig apps/dashboard/tsconfig.json <file> --help` or a typecheck of them).
  Document `DASHBOARD_JOB_SOURCE` in the v1 spec section 10 env table (never in Vercel).

- [ ] **Step 4: Run** `npx vitest run && npm run typecheck && npm run lint`. Expected: PASS.

- [ ] **Step 5: Labels report.** Add to `bq-usage-report.sh` a section grouped by
  `(SELECT value FROM UNNEST(labels) WHERE key = 'rtd_source')` and `rtd_query` with jobs and GiB billed.

- [ ] **Step 6: Set `DASHBOARD_JOB_SOURCE=e2e`** in the Playwright `webServer.env`.

- [ ] **Step 7: Commit** `feat(dashboard): name every query and label BigQuery jobs by source and query`.

### Task 4: Fixed today and discovery windows anchored to the app's today

**Files:**
- Create: `apps/dashboard/src/time/today.ts`, `apps/dashboard/src/time/today.test.ts`
- Modify: `env.ts` (+ test), `app/[appId]/page-data.ts`, `discovery/sql.ts` (+ test), `discovery/data.ts`,
  `app/[appId]/events/explorer-data.ts`, `app/[appId]/funnels/funnel-data.ts`, `app/[appId]/funnels/actions.ts`,
  `queries/dry-run.integration.test.ts`
- Docs: v1 spec section 5 "Discovery" (windows end at `@today_end`; a day param is allowed)

**Interfaces:**
- Produces:
  - `DashboardEnv.fixedToday: string | null` from `DASHBOARD_FIXED_TODAY` (must pass `isDay`, else throw;
    local only via `assertLocalOnly`).
  - `appToday(tz: string, env: DashboardEnv = readEnv()): string` = `env.fixedToday ?? todayIn(tz, new Date())`.
  - `todayEnd(tz: string, env: DashboardEnv = readEnv()): string` = `dayStart(addDays(appToday(tz, env), 1), tz)`.
  - `eventNamesQuery(env, appId, todayEnd)`, `propKeysQuery(env, appId, todayEnd)`,
    `appListQuery(env, todayEnd)`: param `today_end`, window
    `timestamp >= TIMESTAMP_SUB(TIMESTAMP(@today_end), INTERVAL n DAY) AND timestamp < TIMESTAMP(@today_end)`.
  - `listApps()` (uses `todayEnd("UTC")`), `listEvents(appId, tz)`, `listPropKeys(appId, tz)`.

- [ ] **Step 1: Failing tests.**
  - `today.test.ts`: with `fixedToday: "2026-10-13"`, `appToday("Europe/Berlin", env) === "2026-10-13"` and
    `todayEnd("Europe/Berlin", env) === "2026-10-13T22:00:00.000Z"`; `todayEnd("UTC", env) === "2026-10-14T00:00:00.000Z"`.
  - `env.test.ts`: `DASHBOARD_FIXED_TODAY: "2026-13-01"` throws, `"today"` throws, unset → `null`;
    `startupCheck` with `VERCEL_ENV: "preview"` and `DASHBOARD_FIXED_TODAY` set throws.
  - `discovery/sql.test.ts`: each discovery SQL contains `@today_end` and no `CURRENT_TIMESTAMP()`; the
    existing params assertions (`toEqual({})`, `{ app_id }` at lines 14, 22, 33) become `{ today_end }` and
    `{ app_id, today_end }`.

- [ ] **Step 2: Run** `npx vitest run src/time src/env.test.ts src/discovery`. Expected: FAIL.

- [ ] **Step 3: Implement.** `page-data.ts` uses `appToday(settings.timezone, env)`. Callers pass
  `page.settings.timezone`; `saveFunnel` reads `(await getSettings(appId)).timezone`. The dry-run test
  gets three new cases (app list with `todayEnd("UTC", env)`, event names and prop keys for `demo` with
  `todayEnd("Europe/Berlin", env)`).

- [ ] **Step 4: Run** `npx vitest run && npm run typecheck && npm run lint` and the free dry run
  `RTD_DRY_RUN=1 GCP_PROJECT_ID=robin-thues npx vitest run src/queries/dry-run.integration.test.ts`. Expected: PASS.

- [ ] **Step 5: Update** v1 spec section 5 "Discovery" and the section 10 env table
  (`DASHBOARD_FIXED_TODAY`: never in Vercel).

- [ ] **Step 6: Commit** `feat(dashboard): discovery windows end at the app's today; DASHBOARD_FIXED_TODAY for local runs`.

- [ ] **Step 7: Baseline (Task 2 applied, before part C).** Add `DASHBOARD_FIXED_TODAY=2026-10-13` to the
  Playwright `webServer.env` (the real clock would empty the demo prop keys from 2026-10-20 on), build
  (`npm run build`), run `npx playwright test` once, then `claude-tmp-helpers/bq-usage-report.sh 1`.
  Record jobs and GiB per `rtd_query` for `e2e` in the ledger, and that the jobs ran under the dev SA.
  Commit `test(dashboard): e2e runs with a fixed today`.

### Task 5: One query for the eight breakdowns

**Files:**
- Modify: `queries/overview.ts` (+ `overview.test.ts`), `app/[appId]/panels/shared.ts`,
  `app/[appId]/panels/breakdowns.tsx`, `queries/dry-run.integration.test.ts`
- Create: `claude-tmp-helpers/compare-merged-queries.ts`
- Test: `app/[appId]/panels/shared.test.ts` (new)
- Docs: v1 spec section 5 "Errors", layout spec line ~94 ("one by one" gets the merged-query exception)

**Interfaces:**
- Consumes: Task 3's `toSpec(name, …)`.
- Produces:
  - `breakdownsQuery(ctx: QueryContext): QuerySpec` (name `breakdowns`), rows
    `BreakdownsRow = BreakdownRow & { dim: BreakdownDim }`. Replaces `breakdownQuery`.
  - `splitBreakdowns(rows: BreakdownsRow[]): Record<BreakdownDim, BreakdownRow[]>` (every dim present,
    `[]` when no rows).
  - `loadBreakdowns = cache((ctx: QueryContext, live: boolean) => dataQuery<BreakdownsRow>(...))` in `shared.ts`.

- [ ] **Step 1: Failing tests.**
  - `overview.test.ts`: `breakdownsQuery(ctx)` SQL has one `FROM` of the events table (count
    occurrences of `ctx.table` = 1), contains `PARTITION BY dim`, contains `@own_hosts`, has `types.own_hosts = ["STRING"]`,
    and every `DIMS` value appears as a string literal.
  - `overview.test.ts`: `splitBreakdowns([])` has all 8 keys with `[]`; rows with `dim: "os"` land only in `os`
    without the `dim` field.
  - `shared.test.ts` (mock `@/bq/query`'s `dataQuery`): calling `loadBreakdowns(ctx, false)` 8 times with the
    same ctx object calls `dataQuery` once. Use React's `cache` inside a test request scope; if `cache` does not
    dedupe outside a server request in Vitest, assert instead that `breakdowns.tsx` calls `loadBreakdowns`
    and not `dataQuery` (grep test) and keep the dedupe check for the e2e label count in Task 8.

- [ ] **Step 2: Run** `npx vitest run src/queries/overview.test.ts src/app`. Expected: FAIL.

- [ ] **Step 3: Implement `breakdownsQuery`.** One `evp` with `SESSION_COLUMNS` plus `country`,
  `device_type`, `browser`, `os`; `sessionsCte()` once; `items` = `UNION ALL` of 8 selects that add
  `'<dim>' AS dim` (event-level dims from `evp` pageviews, session-level from `sessions`, same expressions
  as `DIM_SQL`); `top` = values with `ROW_NUMBER() OVER (PARTITION BY dim ORDER BY SUM(pv) DESC, value) <= 20`
  over `period = 'cur'`; `bucketed` joins `top USING (dim, value)`; `daily` and the final select group by
  `dim` as well. Keep the comment that Other is a bucket computed in SQL. `BreakdownPanel` reads
  `splitBreakdowns(res.rows)[dim]` from `loadBreakdowns(ctx, live)`.

- [ ] **Step 4: Run** `npx vitest run && npm run typecheck && npm run lint` and the free dry run. Expected: PASS,
  merged estimate under the 1 GB cap for 90 days with compare.

- [ ] **Step 5: Equality check against real BigQuery** with `claude-tmp-helpers/compare-merged-queries.ts`
  (ADC, demo app, 28 days ending 2026-10-13, compare on): runs the old builder (copy kept in the helper) for
  each dim and the new one, compares sorted rows per dim, prints `SAME` or the diff. About 90 MiB billed.
  Expected: `SAME` for all 8 dims. Also print `total_bytes_billed` of the merged job (expect 10 MiB).

- [ ] **Step 6: Update** v1 spec section 5 "Errors" and the layout spec sentence.

- [ ] **Step 7: Commit** `feat(dashboard): one BigQuery job for all eight breakdown panels`.

### Task 6: One query for the four quality panels

**Files:**
- Modify: `queries/overview.ts` (+ test), `app/[appId]/panels/shared.ts`, `app/[appId]/panels/quality.tsx`,
  `queries/dry-run.integration.test.ts`, `claude-tmp-helpers/compare-merged-queries.ts`

**Interfaces:**
- Produces:
  - `qualityQuery(ctx): QuerySpec` (name `quality`) replacing `webVitalsQuery`, `slowPagesQuery`,
    `topErrorsQuery`, `consentQuery`. Rows: `QualityRow = { panel: "vitals" | "slow_pages" | "errors" | "consent" }`
    plus nullable columns `period, metric, p75, samples, page_path, message, occurrences, last_seen, consent_state, pageviews`.
  - `splitQuality(rows: QualityRow[]): { vitals: VitalRow[]; slowPages: SlowPageRow[]; errors: ErrorRow[]; consent: ConsentRow[] }`
    with only each type's own fields.
  - `loadQuality = cache((ctx, live) => dataQuery<QualityRow>(qualityQuery(ctx), ctx.appId, live))`.

- [ ] **Step 1: Failing tests** in `overview.test.ts`: `qualityQuery` reads the table once, keeps
  `LIMIT 10` for slow pages and errors and `HAVING COUNT(*) >= 5`; `splitQuality([])` gives four empty
  arrays; a `slow_pages` row comes back as `{ page_path, p75, samples }` only.

- [ ] **Step 2: Run** the test. Expected: FAIL.

- [ ] **Step 3: Implement.** One `evp` with `event_name, timestamp, page_path, props, consent_state`;
  four parenthesized selects (each keeps its own `ORDER BY … LIMIT`) joined by `UNION ALL`, each
  filling the other columns with typed `NULL`s (`CAST(NULL AS STRING)` etc.) in the same column order.
  The four panels in `quality.tsx` read `splitQuality(res.rows).<part>` from `loadQuality(ctx, live)`.

- [ ] **Step 4: Run** unit tests, typecheck, lint, free dry run. Expected: PASS.

- [ ] **Step 5: Equality check** with the helper for the four panels. Expected: `SAME`.

- [ ] **Step 6: Commit** `feat(dashboard): one BigQuery job for the four quality panels`.

### Task 7: Fixture client (replay and record)

**Files:**
- Create: `apps/dashboard/src/bq/fixtures.ts`, `apps/dashboard/src/bq/fixtures.test.ts`
- Modify: `bq/client.ts` (`getQueryClient`), `bq/query.ts` (`execute` uses it), `env.ts` (+ test),
  `components/credentials-banner.tsx`

**Interfaces:**
- Consumes: `QueryClient`, `toPlain` from `run-query.ts`; labels from Task 3 (`options.labels.rtd_query`).
- Produces:
  - `DashboardEnv.fixtures: "replay" | "record" | null` from `DASHBOARD_FIXTURES` (other values throw;
    local only). The directory is fixed: `path.join(process.cwd(), "e2e", "fixtures")` in `getQueryClient`
    (`next start` runs in `apps/dashboard`); unit tests pass a temp dir to the client factories.
  - `FIXTURE_APPS = ["demo", "demo-b"] as const`.
  - `fixtureFile(options: Record<string, unknown>): string` → `<rtd_query>-<first 16 hex of sha256(stableJson({query, params, types}))>.json`,
    `stableJson` sorts object keys recursively.
  - `createReplayClient(dir: string, delayMs = 150): QueryClient`: waits `delayMs`, reads the file,
    returns `[rows]`; missing file → `console.error("[rtd] no e2e fixture", file)` and throws
    `new Error("No e2e fixture <file>. Run npm run e2e:record.")`.
  - `createRecordClient(real: QueryClient, dir: string): QueryClient`: throws before running when
    `params.app_id` is a string outside `FIXTURE_APPS`; runs the real query; for `rtd_query = "app_list"`
    keeps only `FIXTURE_APPS` ids and adds `demo-b` if missing (sorted); writes `toPlain(rows)` as pretty JSON;
    returns the same rows it wrote.
  - `getQueryClient(env): QueryClient` in `client.ts`: replay → one replay client per process; record →
    record client around `getBigQuery(env)`; else `getBigQuery(env)`.

- [ ] **Step 1: Failing tests** in `fixtures.test.ts` (node env, temp dir):
  - same options with params `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` → same `fixtureFile`;
    different SQL → different file; name prefix from `labels.rtd_query`.
  - record then replay round trip returns equal rows; replay of an unknown spec rejects with a message
    containing `npm run e2e:record`.
  - record with `params.app_id = "wetter-in-kalender"` rejects, the real client is not called, and the
    dir stays empty.
  - record of `app_list` rows `["demo", "wetter-in-kalender"]` writes and returns `["demo", "demo-b"]`.
  - `env.test.ts`: `DASHBOARD_FIXTURES: "x"` throws; `startupCheck` with `VERCEL_ENV: "production"` and
    `DASHBOARD_FIXTURES: "replay"` throws; replay needs no `GCP_PROJECT_NUMBER` etc.

- [ ] **Step 2: Run** `npx vitest run src/bq src/env.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** as in Interfaces. `CredentialsBanner` returns `null` without a token check
  when `env.fixtures === "replay"`. Add `DASHBOARD_FIXTURES` to `LOCAL_ONLY`.

- [ ] **Step 4: Run** unit tests, typecheck, lint. Expected: PASS.

- [ ] **Step 5: Commit** `feat(dashboard): fixture replay and record clients for e2e`.

### Task 8: Playwright modes, @bq tests, recording and measurement

**Files:**
- Modify: `apps/dashboard/playwright.config.ts`, `apps/dashboard/package.json` (scripts),
  `apps/dashboard/e2e/dashboard.spec.ts`, `apps/dashboard/README.md`
- Create: `apps/dashboard/e2e/fixtures/*.json` (recorded), `apps/dashboard/e2e/clear-fixtures.ts` (global setup for record)
- Docs: v1 spec section 9 and section 10 env table (`DASHBOARD_FIXTURES`, `DASHBOARD_FIXTURES_DIR`)

**Interfaces:**
- Consumes: env switches from Tasks 3, 4 and 7.
- Produces: scripts `e2e`, `e2e:bq`, `e2e:record`, `e2e:all`; tag `@bq`.

- [ ] **Step 1: Config.** `playwright.config.ts` reads `RTD_E2E_MODE` (`replay` default, `bq`, `record`).
  All modes: `DASHBOARD_FIXED_TODAY=2026-10-13`, `DASHBOARD_JOB_SOURCE=e2e`.
  - replay: `DASHBOARD_FIXTURES=replay`, `GCP_PROJECT_ID=robin-thues`, `grepInvert: /@bq/`.
  - record: `DASHBOARD_FIXTURES=record`, `grepInvert: /@bq/`, `workers: 1`, `globalSetup: "./e2e/clear-fixtures.ts"`
    (deletes and recreates `e2e/fixtures`).
  - bq: `grep: /@bq/`, `workers: 1` (the settings test changes the demo timezone, which would split the
    cache for parallel workers and push the set over 0.5 GiB).
  Scripts: `"e2e": "playwright test"`, `"e2e:bq": "RTD_E2E_MODE=bq playwright test"`,
  `"e2e:record": "RTD_E2E_MODE=record playwright test"`,
  `"e2e:all": "npm run e2e && npm run e2e:bq && RTD_DRY_RUN=1 GCP_PROJECT_ID=robin-thues vitest run src/queries/dry-run.integration.test.ts"`.

- [ ] **Step 2: Tests.**
  - Tag `{ tag: "@bq" }`: "settings: save and read back the timezone", the "saved funnels" describe with
    "funnels: build, save, reopen and delete" (its `deleteE2eFunnels` cleanup then runs only in @bq; note
    that in the spec's "Recording" section), "Live toggle and Refresh", "explorer: distinct subscriptions per day with a filter",
    "funnels: chart shows one bar per step with a hover tooltip".
  - New `@bq` test "overview smoke: every panel shows data" on `/demo?from=2026-09-16&to=2026-10-13`:
    `kpi-pageviews` not `0`, every `breakdown-<dim>` table has a row, `vital-lcp` visible, no `role=alert`.
  - The two app-switch tests click `demo-b` instead of `wetter-in-kalender` (URL expectations to `/demo-b`);
    drop the "reads production data" message.

- [ ] **Step 3: Record.** `npm run build && npm run e2e:record`. Expected: all non-@bq tests pass; files
  appear in `e2e/fixtures`; `grep -rl "wetter-in-kalender" e2e/fixtures` finds nothing; no file contains a
  funnel named `e2e`. `bq-usage-report.sh 1` labels: e2e ≤ 1.5 GiB.

- [ ] **Step 4: Replay without GCP.** Move `.env.development.local` aside, run `npm run e2e`, move it back.
  Expected: all non-@bq tests pass; usage report shows no new e2e jobs.

- [ ] **Step 5: Real set.** `npm run e2e:bq`. Expected: all @bq tests pass; e2e jobs ≤ 0.5 GiB. Compare
  with the Task 3 baseline in the ledger.

- [ ] **Step 6: Docs.** v1 spec section 9 (replay default, @bq set, commands, fixture privacy) and section
  10 env table; README "e2e" section with the four commands and when to re-record.

- [ ] **Step 7: Commit** `test(dashboard): e2e replays recorded BigQuery results; @bq set runs for real`
  (fixtures included).

### Task 9: Final check

- [ ] **Step 1:** `npm test`, `npm run typecheck`, `npm run lint` at the root; `npm run build` then
  `npm run e2e:all` in `apps/dashboard`. Expected: all green. Quota note: baseline 3.5 + record 1.5 +
  @bq 0.5 + e2e:all 0.5 + equality checks ≈ 6 GiB of the dev account's 10 GiB a day; spread over two days
  if a recording has to be repeated twice.
- [ ] **Step 2:** One fresh final review of the whole branch (most capable model), fixes committed.
- [ ] **Step 3:** Report numbers to Robin (baseline vs replay vs @bq vs record) and ask how to integrate.
  Pushing main deploys the discovery and merged-query changes, so it needs his "push and deploy"; after the
  deploy, the signed-out prod smoke and a label check that production jobs run under `rtd_source=production`.
