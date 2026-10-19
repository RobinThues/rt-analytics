# rt-analytics dashboard: cheaper e2e on BigQuery

**Status:** brainstormed on 2026-10-18/19. Robin asked for three parts (separate service account, fewer
overview queries, fixture mode for e2e) and had a reviewer agent answer the design questions in his place,
grounded in his earlier decisions and the code. Robin saw the summary and said go. A fresh builder check
found three gaps (discovery windows on the real clock, `demo-b` in production, the cost goal); they are
settled below as Claude's calls and marked so. Builds on the v1
dashboard spec (`docs/superpowers/specs/2026-10-14-dashboard-design.md`, the "v1 spec") and the layout
spec (`docs/superpowers/specs/2026-10-16-dashboard-layout-design.md`), live on main d14b494.

## Why

Measured with `claude-tmp-helpers/bq-usage-report.sh` (INFORMATION_SCHEMA.JOBS, 2026-10-09 to 2026-10-18):

- A dashboard query reads 1 to 4 MiB of demo data but is billed 10 MiB, the on-demand minimum per query
  and referenced table. Cost is the number of jobs times 10 MiB.
- One overview load runs about 15 data queries (KPIs, traffic, 8 breakdowns, web vitals, slow pages, top
  errors, consent, retention) plus the app list and settings.
- A full e2e run (44 tests) is about 300 to 400 jobs, roughly 3.5 GiB. On 2026-10-16 the dashboard
  service account ran 2,684 jobs, 26.2 GiB.
- Money cost is zero (the free 1 TiB per month covers it). The problem is the self-set project quota of
  30 GiB per day: local e2e and production use the same service account `rt-analytics-dashboard`
  (`vercel env pull` gives a development OIDC token that Workload Identity Federation maps to that
  account). A heavy test day blocked production until the quota reset on 2026-10-17.

The e2e suite runs against real BigQuery on purpose (v1 spec section 9). That catches real result
shapes, parameter types, the `'use cache'` error digest and credentials. But most of the 44 tests check
UI behavior (skeletons, layout shift, theme, sidebar, dimming), where real BigQuery is only a slow and
expensive data source.

## Goals

- Local work can never block production queries.
- The default e2e run (`npm run e2e`, replay) bills nothing. The real-BigQuery set (`npm run e2e:bq`) bills
  at most 0.5 GiB (target about 0.3 GiB). A fixture recording bills at most 1.5 GiB.
- The cost per run can be measured per source and per query.
- Fewer BigQuery jobs per overview load, which also helps production.

## Non-goals

- Faster e2e is welcome but not a goal.
- No change to explorer or funnel queries (4 and 1 jobs per load, not worth it now).
- No separate dev copy of `analytics_dashboard`. e2e writes keep going to the real config table, as today
  (the settings test switches demo to another timezone for a moment; funnel cleanup stays).
- No emulation of DML (config writes) in fixture mode.

## Anti-goals (failure even if it works)

- Fixtures drift from the real SQL and tests pass while production breaks.
- Real wetter-in-kalender data ends up in the public repo.
- The fixture switch or the fixed clock can ever turn on in a Vercel deployment.

## Order of work

1. **Service account split** (part A). Only script, GCP and Vercel changes, no app code. Ships on its own
   first, after Robin's OK to apply the GCP and Vercel changes.
2. **Job labels** (part B). Small app change, gives the measurement for the rest.
3. **Fewer overview queries** (part C). Before fixtures, because fixture keys depend on the SQL.
4. **Fixture mode** (part D).

Parts B to D go on one branch, one commit group per part.

## Part A: separate service account for development

### Identity

- New service account `rt-analytics-dashboard-dev`, no keys, same roles as the production account:
  `roles/bigquery.jobUser` on the project, `roles/bigquery.dataViewer` on `analytics`,
  `roles/bigquery.dataEditor` on `analytics_dashboard`.
- The Vercel OIDC `sub` is `owner:<team>:project:<project>:environment:<env>` and is the same for every
  developer's pulled token. Each account gets `roles/iam.workloadIdentityUser` for exactly one subject:
  - `rt-analytics-dashboard` ← `principal://iam.googleapis.com/projects/<number>/locations/global/workloadIdentityPools/vercel/subject/owner:<team>:project:<project>:environment:production`
  - `rt-analytics-dashboard-dev` ← the same with `environment:development`
- The current binding of the whole pool (`principalSet://…/vercel/*`) on the production account is
  **removed**. Without that, a development token could still impersonate the production account by
  changing a local env var. The pool's attribute condition stays as it is.
- Vercel: `GCP_SERVICE_ACCOUNT_EMAIL` becomes two entries, Production = `rt-analytics-dashboard@…`,
  Development = `rt-analytics-dashboard-dev@…`. Locally, run `vercel env pull` again from the repo root.
- Robin's own `gcloud` login (application default credentials, used by helper scripts and the dry-run
  test) stays as it is.

### Quota

- Project quota `QueryUsagePerDay` stays at 30 GiB.
- New custom quota `QueryUsagePerUserPerDay` = 10 GiB. Google applies it to every user and service account
  separately and cannot set it per account
  ([custom quotas](https://docs.cloud.google.com/bigquery/docs/custom-quotas)). So the dev account,
  the production account and Robin's own login each get at most 10 GiB a day. Production uses under
  1 GiB a day. Side effect: Robin's own console queries are capped at 10 GiB a day too.

### Where it lives

All of it goes into `scripts/gcp-dashboard.ts` / `setup:gcp --dashboard`, idempotent like the existing
steps, including the binding removal. The run itself and the Vercel env change need Robin's OK.

### Check after applying

- Production dashboard still loads data (signed-out smoke plus Robin's signed-in look, or a production
  log check).
- A local run shows jobs under `rt-analytics-dashboard-dev` in INFORMATION_SCHEMA.JOBS.
- A local attempt with the production account email in the env fails at the impersonation step.

## Part B: job labels

- `runQuery` sets BigQuery job labels on every query:
  - `rtd_source`: `production` (VERCEL_ENV), `development` (local default) or `e2e` (set by the Playwright
    config through an env var such as `DASHBOARD_JOB_SOURCE=e2e`).
  - `rtd_query`: the builder name (`kpis`, `breakdowns`, `funnel`, `app_list`, `config_settings`, …).
    `QuerySpec` gets a required `name` field. Label values follow BigQuery rules (lowercase, digits,
    `_`, `-`, at most 63 characters).
- `bq-usage-report.sh` (or a successor in `claude-tmp-helpers/`) groups by these labels.
- First use: one real e2e run before part C to get a baseline per test source and query. The reviewer
  found a likely extra cause of the high job count: the in-run cache should dedupe more than it does,
  but "Live toggle and Refresh" calls `updateTag` mid-run, and the settings test changes the demo
  timezone, which changes the cache keys for parallel workers. Part D moves both tests to the real-
  BigQuery group, which removes that effect from the default run. The baseline shows how big it is.

## Part C: fewer overview queries

- **Breakdowns:** the 8 breakdown queries become one query. Shared `evp` and `sessions` CTEs, one `UNION
  ALL` block per dimension with a `dim` column, each block with its own top 20 plus "Other" bucket.
  (GROUPING SETS is supported in BigQuery but does not fit per-dimension top N and the mix of event-level
  and session-level dimensions.)
- **Quality:** web vitals, slow pages, top errors and consent become one query, again one block per panel
  with a `panel` column, or another shape that keeps one statement (builder's call).
- **Unchanged:** KPIs and traffic stay 2 jobs (React `cache()` only dedupes each one across panels).
  Retention stays alone.
- Result: 15 data jobs per overview load become 5.
- Panels keep their components and Suspense boundaries. A `cache()`d loader per merged query feeds the
  panels, like `loadKpis` today. Each panel picks its rows by `dim` / `panel`.
- **Accepted trade-off (Robin was told):** panels fed by one merged query fill in together, not one by
  one, and one failure (including a byte-cap refusal) shows the error state in all panels of that query.
  The v1 spec section 5 "Errors" and the layout spec ("panels fill in one by one") get updated to say so.
- Bytes: a merged query reads the union of the columns, so it is closer to the 1 GB cap on long ranges.
  Check with free dry runs before and after. The merged queries replace the old builders in
  `dry-run.integration.test.ts`.
- Check one real job's `total_bytes_billed` after the change. Expected 10 MiB per merged query. Not
  verified: whether a CTE referenced several times counts as one table reference. Either way it is far
  below 8 × 10 MiB.
- Unit tests for the query builders change with the SQL (shape, params, partition and `app_id` filter,
  no user input in SQL text). Existing panel and component tests keep passing.

## Part D: fixture mode for e2e

### Switch

- `DASHBOARD_FIXTURES=replay|record` (unset = off). Refused in Vercel deployments: an instrumentation
  guard like `assertSafeTestLogin` makes the app fail at startup when it is set and `VERCEL_ENV` is
  `production` or `preview`.
- `replay`: `getBigQuery` returns a fixture `QueryClient` that answers from files. No GCP env values, no
  OIDC token and no `vercel env pull` needed (only a dummy `GCP_PROJECT_ID` so `readEnv` passes).
  `runQuery`, the byte-cap error mapping, the `'use cache'` path, Live and all panels still run
  unchanged. Live in replay skips the app cache but still reads fixtures.
- `record`: the real client runs, and every result is also written as a fixture.

### Fixed today

- `DASHBOARD_FIXED_TODAY=YYYY-MM-DD` replaces `new Date()` in `page-data.ts`, the only place the app reads
  the clock. It is honored in any local run and refused in Vercel deployments by the same startup guard as
  the fixture switch. The Playwright setup sets it for every e2e run: replay, record and `@bq`. So all
  three see the same "today", and the real-BigQuery tests keep working after the demo data gets old.
- The browser gets "today" from the server, so no browser clock faking (`page.clock` would also fake the
  timers the skeleton and dimming tests depend on).
- The date is a day inside the demo data. Demo data ends 2026-10-13; the last demo day is the natural pick
  (builder's call).
- SQL that uses `CURRENT_TIMESTAMP()` for the partial-today cut keeps the same text, so fixture keys stay
  stable. Recorded rows reflect the moment of recording; that is fine for UI tests.

### Discovery windows follow the app's today (production SQL change, my call)

Found by the builder check: the discovery queries in `apps/dashboard/src/discovery/sql.ts` use rolling
windows on the real clock (app list and prop keys: last 7 days, event names: last 30 days). A fixed today
does not move them. From about 2026-10-20 the demo app has no prop keys in the last 7 days, and from about
2026-11-12 no event names, so recordings and `@bq` explorer and funnel tests would break.

- The windows end at the end of the app's "today" instead of `CURRENT_TIMESTAMP()`: a `@today_end` param
  (start of the next day in the app's timezone; UTC for the app list, which has no app), and
  `timestamp >= TIMESTAMP_SUB(@today_end, INTERVAL n DAY) AND timestamp < @today_end`.
- In production this is the same window as today, plus an upper bound that helps partition pruning. The
  param changes once a day, which fits the 24-hour discovery TTL. The v1 rule "no request-time values in
  params" is about values that change on every request, so a day value is fine. The v1 spec section 5
  "Discovery" gets updated to say so.
- The discovery loaders get "today" from the same place as the pages (`page-data.ts` logic), so a fixed
  today moves them too.

### Fixtures

- Key: a hash of the exact SQL text, params and types (no normalizing). File name
  `<query name>-<hash>.json` under `apps/dashboard/e2e/fixtures/`, committed. Content: the plain rows
  after `toPlain` (it is idempotent on plain JSON, so replay still goes through it).
- A missing fixture in replay is a failed query with a clear message naming the query and telling to run
  `npm run e2e:record`, plus a log line. That catches SQL changes automatically. It does not prove the SQL
  is valid: the dry-run integration test stays the guard for that.
- Replay waits a small fixed delay per query (builder picks, around 100 to 300 ms), so tests that look for
  skeletons, dimming and "quick second preset wins" still see the in-between states.
- Byte-cap and failure tests keep using their current mechanism (unit and component tests, the existing
  byte-cap helper). Fixtures do not need to store errors.

### Privacy (public repo)

- The recorder refuses to write a fixture when the query has an `app_id` param outside an allowlist
  (`demo` plus the second synthetic app below).
- The app list query has no `app_id` filter. Its recorded rows are filtered to the allowlist before they
  are written.
- The two app-switch tests ("sidebar: switching apps keeps the page and range" and "sidebar: app switch
  shows skeletons, never the old app's numbers") click `wetter-in-kalender` today. They switch to a second
  synthetic app instead. My call: `demo-b`, with no events and no row in `dashboard_config`, so the live
  dashboard's app switcher does not change. In record mode the recorder adds `demo-b` to the app list
  result (both the returned rows and the written fixture). The `[appId]` routes accept any id that matches
  `APP_ID_RE`, so `demo-b` pages load and their queries return empty rows, which get recorded like any
  other. Empty panels are enough for both tests.
- The table path `robin-thues.analytics.events` appears in the fixture SQL. It is already public in the
  docs, so this is fine.

### Recording

- `npm run e2e:record` starts the server with `DASHBOARD_FIXTURES=record` and the same fixed today, runs
  the replay test set serially (one worker), without the `@bq` tests. So funnels or a timezone saved
  during a run never end up in fixtures, and config state is the same for every recording.
- Funnel cleanup (`deleteE2eFunnels`) still runs in replay. The fixtures must contain no "e2e" funnels;
  the serial, @bq-free recording makes sure of that.
- Recording uses the dev service account and bills real bytes (about one full run, roughly 1 to 1.5 GiB
  after part C). Old fixture files that no test used during the recording are deleted by the recorder.

### Which tests stay on real BigQuery (`@bq` tag)

- Settings: save and read back the timezone.
- Funnels: build, save, reopen and delete.
- Live toggle and Refresh.
- One overview smoke: all panels show data. It uses an explicit `from`/`to` inside the demo data, not the
  default range (otherwise it starts failing around 2026-11-09, when the default range leaves the data).
- One explorer test and one funnel result test (builder picks two existing ones that cover the main
  queries).

Target: the @bq set bills around 0.3 GiB.

### Commands

- `npm run e2e`: replay only, the default. No GCP access needed.
- `npm run e2e:bq`: the `@bq` tests against real BigQuery (dev service account, needs `vercel env pull`).
- `npm run e2e:all`: replay, then `@bq`, then the dry-run integration test (`RTD_DRY_RUN=1`, free). Run
  before a merge or push to main.
- `npm run e2e:record`: re-records fixtures (see above).

Replay and @bq need different server env, so the Playwright setup uses two projects or two config files
(builder's call). `playwright.config.ts` keeps loading the env files with `@next/env` for the @bq run.

## Docs to update

- v1 spec: section 2 (two service accounts, per-subject bindings, per-user quota), section 5 "Errors"
  (merged queries) and "Discovery" (windows end at the app's today), section 9 (fixture mode, @bq, commands), section 10 env table
  (`GCP_SERVICE_ACCOUNT_EMAIL` per environment, `DASHBOARD_FIXTURES`, `DASHBOARD_FIXED_TODAY`,
  `DASHBOARD_JOB_SOURCE`, all three local only and never in Vercel).
- Layout spec: "panels fill in one by one" gets the merged-query exception.
- Dashboard README: the e2e commands.

## Testing

- Unit: the deployment guard for the fixture switch and fixed today, fixture key building, missing-fixture
  result, recorder allowlist, app list filtering and the added `demo-b`, label building (source, name,
  label value rules), merged query builders, discovery windows anchored to `@today_end`.
- Dry-run integration: merged queries under the byte cap for 90 days with compare.
- e2e: `npm run e2e` green in replay, `npm run e2e:bq` green, both inside the targets (check with the
  labels and the usage report).
- Part A: the checks listed in its section.

## Left to the builder

- Exact SQL shape of the merged quality query.
- Replay delay value, the exact fixed day, which explorer and funnel tests join @bq.
- Two Playwright projects vs two config files.
- File layout of the fixture client and recorder inside `apps/dashboard/src/bq/`.
