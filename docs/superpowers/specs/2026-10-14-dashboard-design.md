# rt-analytics dashboard: Design

**Date:** 2026-10-14
**Status:** Decisions settled in a grilling session with Robin on 2026-10-13. Revised after review round 1 (fresh agent, 2026-10-14) with Robin's rulings: TypeScript 6.0 for the repo, one prop filter in the explorer, v1 scope cut and v2 defined. Review round 2 (fresh agent, 2026-10-14) fixes worked in. Waiting for Robin's review.
**Builds on:** [2026-07-11-rt-analytics-design.md](2026-07-11-rt-analytics-design.md), [2026-10-12-rt-analytics-0.2.0-design.md](2026-10-12-rt-analytics-0.2.0-design.md)

## Goal

A dashboard for the analytics data that rt-analytics writes to BigQuery. It is generic and multi-app: it has no code for any specific app. Fixed panels cover the built-in events (`$pageview`, `$session_start`, `$web_vital`, `$error`, `$consent`, `$identify`). Everything else (app events and their props) is discovered from the data at runtime.

v1 is for Robin only. It is built so that it could become a self-hostable part of rt-analytics later (v2), without a rewrite.

Success for v1:

- Robin opens the dashboard, picks an app, and sees traffic, top pages, sources, devices, errors, web vitals, consent split, returning visitors and retention for any date range, compared with the previous period.
- He can explore any app event (metric over time, one filter, breakdown by a prop) and build, save and reopen funnels from discovered events, without a code change in the dashboard.
- It runs on demo data before any real app is involved, and the same code shows real apps.
- BigQuery cost stays at zero in practice (free tier), and no single query can scan more than a configured cap.

## Non-goals (v1)

- Fingerprinting or any other way to recognize cookieless visitors across days. It needs consent under §25 TDDDG just like a cookie (EDPB Guidelines 2/2023), and is less reliable than a stored ID.
- Real-time push updates in the UI. "Live" means "skip the cache", not push.
- Multiple users, roles or sharing. One email allowlist.
- App-specific panels, labels or code of any kind.
- Alerts, exports, scheduled reports.
- Deploying the demo app. It runs locally.
- A consent banner on dwd. Separate dwd task (see Follow-ups).
- Everything listed under v2 (section 13).

## 1. Repo layout

The repo becomes an npm workspaces monorepo. The move is its own PR with no behavior change for library consumers.

```
package.json                 root: private, "workspaces": ["packages/*", "apps/*"], ops scripts and their deps
tsconfig.json                root: only for scripts/
packages/rt-analytics/       the library (today's src/, test-d/, tsdown, vitest and tsconfig files, CHANGELOG, README, LICENSE)
apps/dashboard/              the dashboard (Next.js), never published
apps/demo/                   today's example/, becomes the demo app (appId "demo")
sql/                         views and templates, unchanged location
scripts/                     setup-gcp.ts, pseudonymize.ts, generate-demo-data.ts, demo-profile.ts
README.md                    root: short overview with links to the package README and the dashboard
docs/                        unchanged
```

### TypeScript 6.0 for the whole repo

The standard stack says: latest TypeScript, and fall back to the previous major only when a tool does not support it yet, with a note why. That applies here. `eslint-config-next` 16.4 depends on `typescript-eslint` 8, whose peer range is `typescript >=4.8.4 <6.1.0` (8.71.2, checked 2026-10-14). The maintainers will not support TypeScript 7 before it has a JS API ([typescript-eslint#12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518)). With TS 7, `npm ci` only warns about the peer range, but ESLint then refuses to run ("typescript-eslint does not support TS 7.0"), so linting is impossible.

So the repo uses TypeScript 6.0.3 everywhere, the library included (one root lockfile, one version). This only affects dev tooling. Review round 2 checked it on a copy of the repo: the library's `dist` is byte-identical to the TS 7 build, `typecheck` and `typecheck:dist` pass, all tests pass, and tsdown 0.23.1 accepts TS 6. We move back to TS 7 when `typescript-eslint` supports it (Follow-ups).

ESLint 10.12 is newer than the peer ranges of some plugins bundled in `eslint-config-next` 16.4 (react, import, jsx-a11y stop at ESLint 9). They install with warnings and all rules run correctly; ESLint 9 is no longer supported. So we use ESLint 10, and `npm ls` (which reports those plugins as "invalid") is not used as a CI gate.

### What the move changes

- Library scripts (`build`, `test`, `typecheck`, `typecheck:dist`, `prepublishOnly`, `prepare`) move to `packages/rt-analytics/package.json`, which also gets `repository.directory: "packages/rt-analytics"`. LICENSE is copied into the package folder (the root keeps one for GitHub), so the tarball still contains it.
- `release.yml`: the tag guard reads `packages/rt-analytics/package.json`, and publish runs with `working-directory: packages/rt-analytics`. Tags stay `vX.Y.Z` and mean library releases only. The published file list must be identical before and after the move (`npm pack --dry-run`).
- Root `package.json`: keeps `setup:gcp` and `pseudonymize`, adds `demo:generate`, and gets `tsx`, `vitest` and `@google-cloud/bigquery` as dev dependencies for the scripts. A root `vitest.config.ts` covers `scripts/**/*.test.ts`. Root `npm test` runs the root script tests and then `npm test --workspaces --if-present`.
- `scripts/pseudonymize.ts` imports `rt-analytics/next` (workspace package) instead of `../src/next/server-tracker.js`. This works because npm runs the library's `prepare` (build) on `npm install` and `npm ci`, so `dist` exists.
- Its test moves to `scripts/pseudonymize.test.ts` and resolves the script path from `import.meta.url`. It no longer imports the internal `pseudonymizeWith`; it computes the expected value with `createServerTracker({ appId, salt }).pseudonymize()` from the public API.
- `.env.analytics` and `key.json` stay at the repo root, gitignored. The scripts keep reading them from the root.
- `apps/demo`: depends on `"rt-analytics": "*"` (workspace), its own `package-lock.json` is deleted, `.gitignore` entries move from `example/` to `apps/demo/`.
- The library's `engines` stays `>=22` (consumer-facing). The apps use Node 24 LTS (Vercel default).
- ESLint and Prettier: the dashboard and demo get them from the start. Adding them to the library is a separate small PR (standard stack rule: migrate existing code as its own task).

### New library entry: `rt-analytics/schema`

The dashboard needs the event schema and the built-in event names. A new entry `rt-analytics/schema` exports:

- `EventRow`: the BigQuery row as written (moved from `src/next/bigquery-writer.ts`, re-exported from `rt-analytics/next` so nothing breaks). The dashboard defines its own read types, because its queries return aggregates, not rows.
- `BUILTIN_EVENTS` (`as const` list of the `$` names) and a `BuiltinEvent` type.
- `RowConsentState = ConsentState | "server"`. A new name, because `ConsentState` is already exported for the client (`src/core/types.ts:1`).
- `DAILY_VISITOR_PREFIX = "d_"`.

The library code uses these constants instead of literals, so a rename breaks the dashboard build instead of silently showing zeros. The dashboard depends on the workspace version. The next npm release (0.4.0) includes the entry; the dashboard does not wait for it.

### SQL template fixes (library PR)

- `sql/templates/retention.sql` filters persistent IDs with `visitor_id NOT LIKE 'd_%'`. In LIKE, `_` matches any character, so persistent UUIDs that start with `d` (about 1 in 16) are dropped. Fix: `NOT STARTS_WITH(visitor_id, 'd_')`, plus a partition filter.
- `sql/templates/funnel.sql` takes the first occurrence of each step independently, which is wrong when an event repeats. Fix it to the step rule in section 7. The template keeps its unit (visitor) and gets a comment that only persistent IDs make sense across days; the dashboard's own funnel uses sessions.

The dashboard does not use the views in `sql/views/`. They have no partition filter, so the dashboard builds its own SQL.

## 2. GCP setup

All steps are added to `scripts/setup-gcp.ts`, idempotent like the existing ones, behind a flag (`--dashboard`) so the existing setup stays unchanged for library users.

### Dataset `analytics_dashboard`

Location EU, same project as `analytics`. One table:

`dashboard_config`

| column | type | notes |
|---|---|---|
| `kind` | STRING, required | `funnel` or `app_settings` |
| `id` | STRING, required | random ID for funnels, the app ID for `app_settings` |
| `app_id` | STRING, required | |
| `name` | STRING | funnel name, null for settings |
| `value` | JSON, required | funnel definition or settings object |
| `updated_at` | TIMESTAMP, required | |
| `updated_by` | STRING, required | email of the signed-in user |

Writes use DML: `MERGE` on `kind, id` to save, `DELETE` to remove.

### Identity without keys

The dashboard runs with no service account key. Vercel issues OIDC tokens to the deployment; GCP Workload Identity Federation exchanges them for a short-lived token of a service account ([Vercel: OIDC with GCP](https://vercel.com/docs/oidc/gcp)).

- Service account `rt-analytics-dashboard`, no keys:
  - `roles/bigquery.jobUser` on the project (needed to run queries),
  - `roles/bigquery.dataViewer` on dataset `analytics`,
  - `roles/bigquery.dataEditor` on dataset `analytics_dashboard`.
- Workload identity pool `vercel`, OIDC provider `vercel`:
  - issuer `https://oidc.vercel.com/<team-slug>` (Vercel team issuer mode),
  - allowed audience `https://vercel.com/<team-slug>` (the default audience of Vercel tokens, so the code calls `getVercelOidcToken()` without an audience, in deployments and locally),
  - `google.subject = assertion.sub`,
  - attribute condition: only the dashboard project, production and development:
    `assertion.sub in ["owner:<team-slug>:project:<dashboard-project>:environment:production", "owner:<team-slug>:project:<dashboard-project>:environment:development"]`.
    Previews are left out: they cannot sign in (section 4) and are built from a public repo.
- `roles/iam.workloadIdentityUser` on the service account for that pool's principals.
- The script prints the non-secret values the app needs (project number, pool ID, provider ID, service account email). `<team-slug>` and `<dashboard-project>` are script flags.

In code (`apps/dashboard/src/bq/client.ts`): `ExternalAccountClient.fromJSON(...)` from `google-auth-library` with `subject_token_supplier.getSubjectToken` calling `getVercelOidcToken()` from `@vercel/oidc`, as in Vercel's guide. Locally, `vercel env pull` writes a development `VERCEL_OIDC_TOKEN` (valid for 12 hours).

Cost guards: the existing project quota (30 GiB/day) and budget alert stay. Every dashboard query also sets `maximumBytesBilled` (section 5).

### Google OAuth client

A Google OAuth client (web application) in the same project, created by hand in the Google Cloud console, because there is no supported API or `gcloud` command for OAuth web clients. The implementation plan lists the click steps:

- OAuth consent screen published "In production" (or Robin added as a test user while it is in testing).
- Redirect URIs: `<production URL>/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`, later the same path on `analytics.thues.eu`.

## 3. Dashboard app

### Stack and versions

Latest stable versions, checked on npm and nodejs.org on 2026-10-14. The plan re-checks them at implementation time.

| tool | version |
|---|---|
| Node.js | 24 LTS (24.21.0) |
| Next.js (App Router, `cacheComponents: true`) | 16.4.0 |
| React | 19.3.0 |
| TypeScript | 6.0.3 (TS 7 blocked by typescript-eslint, see section 1) |
| Tailwind CSS | 4.3.3 |
| shadcn/ui CLI (chart components on Recharts) | 4.21.4, Recharts 3.10.1 |
| Better Auth | 1.7.7 |
| @google-cloud/bigquery | 9.3.0 |
| google-auth-library | 11.3.0 |
| @vercel/oidc | 4.0.1 |
| ESLint + eslint-config-next | 10.12.0 + 16.4.0 |
| Prettier | 3.9.10 |
| Vitest, happy-dom, @testing-library/react | 5.0.4, 21.0.1, 16.3.3 |
| Playwright | 1.64.0 |

Auth library choice: next-auth v5 is still beta (stable `latest` is v4) and Auth.js now gets security fixes only from the Better Auth team. Better Auth is stable and supports a fully stateless setup with no database.

### Units

```
apps/dashboard/src/
  auth/        Better Auth config, allowlist check, requireUser(), test login
  bq/          BigQuery client (OIDC), runQuery(), cache wrapper, byte cap, row mapping
  time/        date range and timezone math, previous-period math
  queries/     one module per panel: pure functions returning { sql, params }
  discovery/   app list, event and prop discovery, prop key validation
  config/      dashboard_config store (read, save, delete)
  app/         routes, pages, server actions
  components/  charts, KPI tiles, tables, date picker, filter picker, live toggle
```

The query builders are pure and know nothing about Next.js, so they can be tested without a server and reused by a self-hosted version later.

### Routes and URL state

| route | page |
|---|---|
| `/` | app picker |
| `/[appId]` | overview |
| `/[appId]/events` | events explorer |
| `/[appId]/funnels` | funnel builder and saved funnels |
| `/[appId]/settings` | app settings (timezone, own hostnames) |
| `/sign-in` | Google sign-in |

All view state lives in the URL, so every view can be bookmarked: `from`, `to` (dates in the app's timezone), `compare` (default on), and per page `event`, `metric`, `filter` (`key:value`), `by`, `steps`, `funnel` (saved funnel ID).

Default range: the last 28 days including today, so new data shows up during the early phase.

The header shows the app picker, the date range picker, the compare switch, the Live toggle and the Refresh button.

With `cacheComponents`, anything that reads cookies (session, Live toggle) renders inside a Suspense boundary; each page has a `loading.tsx`.

## 4. Auth

- Better Auth in stateless mode (no database): session in an encrypted cookie, OAuth state in a cookie. Google is the only provider.
- `DASHBOARD_ALLOWED_EMAILS`: comma-separated list, compared lowercase. The check runs in Better Auth's `user.validateUserInfo` hook (1.7), which runs on first sign-in and on every later sign-in, and refuses on error. It refuses any email not on the list and any email Google reports as unverified. (`databaseHooks.user.create.before` is not used: without a database Better Auth keeps users in a per-instance memory store, so that hook does not run reliably.)
- Defense in depth: `requireUser()` re-checks the session email against the allowlist on every page render and in every server action. `proxy.ts` only does the cheap redirect to `/sign-in` when no session cookie exists; it is not the security boundary.
- Preview deployments have changing URLs, so sign-in works on production and localhost only. Previews are protected by Vercel's standard deployment protection and have no BigQuery access.

### Test login (Playwright only)

- Enabled only when all of these hold: `DASHBOARD_TEST_LOGIN=1`, `DASHBOARD_TEST_LOGIN_SECRET` set (at least 32 characters), and `VERCEL_ENV` unset or `development`.
- Built as a small Better Auth plugin endpoint (`createAuthEndpoint`, path `/api/auth/test-login`), not as a plain Next route. Better Auth 1.7.7 only creates users inside its own endpoint context when `validateUserInfo` is set (`validation_context_missing` otherwise), and the bundled `test-utils` plugin does not set the stateless `session_data` cookie.
- The endpoint checks the guard and the secret (header), then creates the user with source `{ method: "test" }` and sets the session cookies with `setSessionCookie`. The email must be on the allowlist.
- `validateUserInfo` accepts `method === "test"` only while the guard holds. Otherwise it requires an OAuth sign-in with Google and a verified email.
- `instrumentation.ts` `register()` checks at startup: if `DASHBOARD_TEST_LOGIN=1` and `VERCEL_ENV` is `production` or `preview`, it throws and the app does not start.

## 5. Query layer

`runQuery({ sql, params })` is the only way the app talks to BigQuery. A cached wrapper sits in front of it (below).

- Always parameterized (`@app_id`, `@from_ts`, `@to_ts`, `@tz`, `@event`, `@prop_key`, `@prop_value`, ...). No user input ever goes into SQL text.
- Props are read with the JSON subscript operator, which takes a STRING expression, so the key is a parameter: `LAX_STRING(props[@prop_key])` (checked with a real query in review round 2, also for number and boolean values). Prop keys are still validated before use: at most 128 characters, not quoted by `JSON_KEYS` (BigQuery quotes keys like `a.b`), and in the discovered key list for that event or used in a saved funnel of that app.
- Every query on `analytics.events` filters a `timestamp` range, so partition pruning applies. Every query except the app list (section 5, Discovery) also filters `app_id`, so clustering (`app_id, event_name`) applies.
- Time values that change on every request (like "now") are never passed as parameters, because parameters are part of the cache key. The SQL uses `CURRENT_TIMESTAMP()` instead (see the partial-today cut in section 6), so the default view keeps hitting the cache.
- Results are mapped to plain JSON before they leave `runQuery`: the SQL casts dates and timestamps to STRING and numbers to INT64 or FLOAT64, so no `BigQueryDate`, `BigQueryTimestamp` or Big.js objects reach the cache or React.
- Location `EU`.

### Byte cap

- `maximumBytesBilled` from `DASHBOARD_MAX_BYTES_PER_QUERY` (default 1 GB).
- BigQuery checks the cap against its estimate before running. For a clustered table that estimate is an upper bound: it counts the full partitions for the columns the query reads, including other apps' rows ([BigQuery cost best practices](https://cloud.google.com/bigquery/docs/best-practices-costs)). The cap therefore works on the date range and columns, not on one app's share.
- When a query is refused (error reason `bytesBilledLimitExceeded`), the panel shows "This query would scan more than <cap from env>. Choose a shorter date range." instead of data.

### Cache, Live and Refresh

BigQuery's own result cache does not help here: it is skipped for tables that recently received streaming writes, which is always true for `events` ([BigQuery cached results](https://cloud.google.com/bigquery/docs/cached-results)). The app's own cache is the only one.

- All cache tags start with `rtd:`. On the Hobby plan the runtime cache is shared by all projects of the team, so generic tags could clash with dwd's.
- **Data queries** go through a function with `'use cache: remote'` (Vercel runtime cache, shared by all instances), `cacheTag('rtd:bq:<appId>')` and `cacheLife({ stale: min(300, TTL), revalidate: TTL, expire: 2 × TTL })`. Without `revalidate` and `stale`, Next fills them from its default profile, so all three are set explicitly ([cacheLife](https://nextjs.org/docs/app/api-reference/functions/cacheLife)). These values are valid for any TTL above 0.
- `DASHBOARD_CACHE_TTL_SECONDS` sets TTL (default 3600). It is parsed and checked at startup (whole number, 0 or more); an invalid value stops the app, because `cacheLife` throws on non-finite numbers. `0` means: the app calls `runQuery` directly and never the cached function.
- The BigQuery client gets its OIDC token inside the cached function (`getVercelOidcToken()` reads it from the request context). The proof query in "Dashboard part 1" (section 11) goes through the cached path and includes one forced stale revalidation, to confirm that the token is also available when Next refreshes an entry in the background.
- **Live toggle:** sets the cookie `rtd_live=1` for this browser. The cookie is read outside the cached function. While it is set, data queries call `runQuery` directly. A "Live" badge shows in the header. Live costs real bytes on every load, because there is no other cache.
- **Discovery and app list** use a separate cached function with tags `rtd:discovery:<appId>` and `rtd:apps`, TTL 24 hours. Live does not skip them, so a Live page load never re-runs the expensive discovery scans.
- **Refresh button:** a server action calls `updateTag` for `rtd:bq:<appId>`, `rtd:discovery:<appId>` and `rtd:apps`, so the next load queries BigQuery again for everyone and new events appear.
- **Config reads** are cached with tag `rtd:config`, invalidated with `updateTag('rtd:config')` after every write. Live and Refresh do not affect them.
- Remote cache entries do not survive a new deployment, so every dashboard deploy starts with an empty cache. Section 10 keeps deploys rare.

### Discovery (bounded)

- **App list:** distinct `app_id` over the last 7 days (reads only `app_id` and `timestamp`), plus every app ID in `dashboard_config`. This is the one query without an `app_id` filter.
- **Event names:** distinct non-`$` `event_name` over the last 30 days, with the event count and `COUNTIF(visitor_id IS NOT NULL)` and `COUNTIF(session_id IS NOT NULL)`, so the explorer knows which metrics make sense for each event (reads only `app_id`, `event_name`, `timestamp`, `visitor_id`, `session_id`).
- **Prop keys:** for each event, top-level keys over the last 7 days whose values are strings, numbers or booleans: `UNNEST(JSON_KEYS(props, 1)) AS k` with `JSON_TYPE(props[k])`. Keys that BigQuery returns quoted (special characters) fail the key rule and are skipped. Nested objects and arrays are ignored. This is the query that reads `props`, so it gets the shortest window.

### Errors

Each panel renders in its own Suspense boundary and error boundary. A failing query breaks only its panel and shows a short message plus a retry link. Auth or credential errors (OIDC exchange failed) show one banner at page level and are logged server-side with the reason, never with token contents.

## 6. Metric definitions

### Time

- Every app has a timezone in `dashboard_config` (`app_settings.timezone`, IANA name), default `Europe/Berlin`.
- A day is `DATE(timestamp, @tz)`. A range `from..to` covers `[from 00:00, to+1 00:00)` in the app timezone, converted to UTC timestamps for the partition filter.
- **Previous period:** the same number of calendar days, ending the day before `from` (calendar days, not hours, so DST changes do not shift it). When the range includes today, the previous period's last day is cut at the same time of day, so a half day is compared with a half day. The cut is computed in SQL, not passed in: `TIMESTAMP_ADD(@prev_last_day_start, INTERVAL TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), @today_start, SECOND) SECOND)`. All parameters stay stable for the whole day, so the cache keeps working. KPI tiles show the change in percent; time series show the previous period as a dashed line aligned by day offset.

### Sessions

The SDK's session data has quirks the definitions must handle (`src/core/session.ts`, `src/core/analytics.ts`):

- Cookieless sessions live in memory, so a full page load (not a client-side navigation) starts a new session.
- Accepting consent switches to sessionStorage and starts a new session with a new persistent `visitor_id`, so one visit becomes two sessions and two visitors that day.
- A `$web_vital` sent when a tab is hidden after 30 idle minutes can create a session with no pageview.

Definitions:

- A **session** is a `session_id` with at least one `$pageview`. Sessions without a pageview are not counted anywhere.
- A session belongs to the day (and range) of its first event. Queries read events from one day before `from` to one day after `to`: the day before finds sessions that started earlier (they belong to the earlier day and are not counted), the day after shows the rest of sessions that start near the end of the range. SDK sessions have no maximum length, so a session longer than a day is still split; that is rare enough to accept (Known limits).
- **Bounce rate:** share of sessions with exactly one `$pageview`.

### Identity kinds

| kind | rule |
|---|---|
| persistent | `user_id` is set, or `visitor_id` is set and does not start with `d_` |
| daily | `visitor_id` starts with `d_` and `user_id` is null |
| none | server events (`consent_state = 'server'`, no visitor or session) |

The person key for persistent metrics is `COALESCE(user_id, visitor_id)`. Known limit: after `identify()`, events carry the `user_id` and earlier events only the `visitor_id`, so one person counts twice. None of Robin's apps use `identify()` yet; stitching is v2.

The `d_` daily hash in the ingest uses the UTC day (`src/next/enrich.ts:36`). A cookieless visitor active across 00:00 UTC (01:00 or 02:00 in Berlin) gets two IDs in one Berlin day. This is a small known overcount.

### Metrics

- **Visitors per day:** distinct `visitor_id` per day over client events, all kinds. This is the main visitor number in time series.
- **Visitors for a range:** the sum of the daily values divided by the number of calendar days in the range (today counts as one day, also when partial). Days without data count as 0. Daily IDs are never counted across days. Labels say "per day". The same rule applies to every "per day" number: breakdown rows, explorer metrics, and "distinct values of a prop". It is cheap to compute (`GROUP BY day, dimension`, then sum and divide).
- **Persistent people in range:** distinct person keys with a persistent ID, shown with coverage.
- **Coverage:** share of sessions in the range with a persistent ID. Shown on every persistent-only panel, e.g. "based on 14 % of sessions".
- **Returning visitors (persistent only):** persistent people active on two or more distinct days in the range.
- **Retention (persistent only):** weekly cohorts (weeks start Monday, app timezone) of persistent people whose first event in the range has no earlier event in the 28 days before `from` ("new in range"). Each cohort row shows the share active in each later week. The 28-day lookback reads only `visitor_id`, `user_id` and `timestamp`; someone last seen more than 28 days before `from` counts as new. Retention has no compare.
- **Sources:** per session, the referrer host and UTM fields of its first `$pageview`. Hosts listed in `app_settings.hosts` (the app's own domains) and empty referrers count as "direct". Without that setting, full page loads between the app's own pages would show the app as its own top source.
- **Breakdown tables in the overview** (pages, sources, countries, devices, browsers, OS) show two counts per row: pageviews and visitors (average per day, as above).

## 7. Pages

### Overview (built-in events only)

- KPI tiles: visitors (average per day), persistent people, sessions, pageviews, bounce rate, errors. Each with compare.
- Visitors, sessions and pageviews over time.
- Top pages (`page_path`) and entry pages.
- Sources: referrer host and `utm_source / utm_medium / utm_campaign`.
- Countries, devices, browsers, OS.
- Web vitals: p75 per metric for LCP, INP and CLS (the three the library collects), and the slowest pages by LCP p75.
- Errors: count over time and top messages.
- Consent split: share of pageviews per `consent_state`.
- Returning visitors and retention, with coverage. When coverage is 0, a short note replaces them.

### Events explorer

- **List:** every discovered event with its count in the range, compare change and a small trend line.
- **Selected event:** a time series with a metric choice:
  - events,
  - sessions with the event,
  - visitors with the event (per day; the range total is the daily average, as in section 6),
  - distinct values of a prop per day.
- **Filter:** at most one condition, "prop = value". The value is picked from the prop's top values or typed in.
- **Breakdown by one prop:** the 20 values with the most events in the range, plus "other", with the selected metric and compare. "Other" is computed in SQL by grouping with `CASE WHEN value IN (top 20) THEN value ELSE 'other' END`, not as total minus top 20, because distinct counts do not add up. The same applies to the overview breakdown tables (ranked by pageviews).
- Example: `calendar_poll`, metric "distinct values of `subscription`", filter `kind = token` gives the number of dwd subscriptions polled per day with the new token links. It is close to dwd's own active-subscription definition but not the same (dwd also requires polls on two or more days and excludes browser clients); that metric is v2.
- Server events (like dwd's `calendar_poll`) are normal events here. Visitor and session metrics are hidden for an event when none of its rows has those IDs.

### Funnel builder

- 2 to 5 steps. Each step is a discovered event (including `$pageview`) with an optional filter: "prop = value", or for `$pageview` "path = value".
- Unit: session. Steps must happen in order within one session.
- Step rule: step 1 is the first occurrence of event 1 in the session. Step k is the first occurrence of event k with a timestamp strictly after the timestamp of step k-1. Events with the same timestamp as the previous step do not count.
- A session belongs to the range by its first event (the session rule from section 6). Later steps may happen up to one day past `to` (same tail rule).
- Output: count per step, conversion from the first and from the previous step, and the previous period's numbers when compare is on.
- Known limit: cookieless sessions end at full page loads and at consent acceptance, so a funnel that crosses either loses those sessions.
- **Save:** name the funnel, stored in `dashboard_config` (`kind = funnel`, value `{ steps }`). Saved funnels are listed per app, open by `?funnel=<id>`, and can be deleted. To change one, save it again under a new name.

### Settings

Per app: timezone (select from IANA names) and own hostnames (`hosts`, for the sources rule). Stored in `dashboard_config`.

## 8. Demo data

Demo data lives in the real `analytics.events` table with `app_id = 'demo'`. The dashboard treats it like any other app.

Rule that comes with this: any maintenance SQL that deletes or changes rows by date or by app must filter by `app_id`. The README says so. Per-person deletions by `visitor_id` (like `sql/templates/delete_visitor.sql`) do not need it, because visitor IDs are unique across apps.

Cleanup: `DELETE FROM analytics.events WHERE app_id = 'demo'`. The ingest writes through the Storage Write API, whose rows can be changed with DML right away.

### Generator (`scripts/generate-demo-data.ts`, `npm run demo:generate`)

- Writes 90 days of events ending yesterday, with a fixed seed so runs are repeatable.
- The event shapes come from a profile file (`scripts/demo-profile.ts`), so another profile (e.g. wordle) can be added without code changes. The first profile is modeled on dwd:
  - `$session_start`, `$pageview` on a handful of paths, `$web_vital` (LCP, INP, CLS), rare `$error`, `$consent`,
  - `place_selected { source, place }`, `subscribe_click { target, place, fields }`,
  - server-side `calendar_poll { subscription, kind, client }` from a slowly growing pool of subscriptions (mostly `kind = token`, some `legacy` with daily-changing IDs, a few `browser` clients), a few polls per subscription per day.
- Visitor mix: about 80 % cookieless (`d_` daily IDs), 15 % consented (persistent IDs, some return over days and weeks), 5 % declined.
- It copies the SDK's session behavior from section 6: cookieless sessions that restart on full page loads, sessions split at consent acceptance (new session, new persistent ID), a few sessions with only a `$web_vital`, and daily IDs that change at 00:00 UTC.
- Weekday and time-of-day patterns, slow growth, a few referrer and UTM sources (including self-referrals from the demo host), a few countries and devices.
- Writes NDJSON and loads it with a BigQuery load job (free) into `analytics.events`. `--replace` first deletes `app_id = 'demo'` rows before today.
- Runs locally with Robin's own `gcloud` login (application default credentials), not with the dashboard or writer identity.
- Size: a few tens of thousands of rows, well inside the free tier.

### Demo app (`apps/demo`, today's `example/`)

- `appId: "demo"`, shows the library's consent banner so both cookieless and consented paths are exercised.
- A few pages and buttons that send the same events as the generator's profile, so live events join the generated history.
- Its ingest route uses the existing writer credentials from the root `.env.analytics` and `allowedAppIds: ["demo"]`. Next only loads `.env*` files from the app folder, so the demo's `dev` and `start` scripts load the root file explicitly (`node --env-file=../../.env.analytics`).
- It is also the integration reference for new projects (wordle and others).

## 9. Testing

- **Unit (Vitest, node):** every query builder (SQL shape, params, partition filter present, `app_id` filter present except in the app list, no user input in SQL text, no request-time values in params), prop key validation, range and timezone math including DST changes, previous-period math including the partial-today cut, session and funnel step rules, identity kind rules, allowlist check, test-login guard, the Live/TTL decision, row mapping to plain JSON.
- **Dry-run integration (opt-in, like the existing `bigquery-writer.integration.test.ts`):** every query builder runs as a BigQuery dry run against `app_id = 'demo'` for a 90-day range with compare on (180 days read). Dry runs are free, validate the SQL, and return the bytes estimate; the test fails if the estimate is over the cap.
- **Component (Vitest + happy-dom + Testing Library):** KPI tiles with and without compare, coverage notes, panel error and byte-cap states, filter picker, funnel step editor.
- **End-to-end (Playwright, local only):** test login, pick the demo app, check that overview, explorer and funnels render data, save and reopen a funnel, toggle Live and Refresh. Runs against `next start` with real demo data. `next start` loads env files in production mode, so it would not read `.env.development.local` (GCP values, OIDC token). `playwright.config.ts` therefore calls `loadEnvConfig(appDir, true)` from `@next/env` and passes the result to `webServer.env`.
- **Library:** the existing suites keep passing after the monorepo move and the TS 6 switch; the published file list and the built output are unchanged.

## 10. Deployment

- New Vercel project for the dashboard: root directory `apps/dashboard`, "Include files outside the root directory" on, Node 24.
- Build: the library is built first (`npm run build -w rt-analytics`), then the dashboard.
- Skipping: Vercel's built-in monorepo skipping treats every change outside the workspaces (docs, `sql/`, `scripts/`, root files) as global and would redeploy, which also empties the remote cache. So the project uses an `ignoreCommand` instead, pointing to a script file `apps/dashboard/scripts/ignore-build.sh`. Vercel runs it inside the root directory (`apps/dashboard`), so paths must be repo-relative:
  - `VERCEL_GIT_PREVIOUS_SHA` empty (first deployment of a branch): exit 1, build.
  - Otherwise: `git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- ':/apps/dashboard' ':/packages/rt-analytics' ':/package-lock.json'`. Exit 0 skips the build; any other exit code builds, including 128 when a shallow clone lacks the old commit.
- Domain: the default `*.vercel.app` URL while building. Later `analytics.thues.eu` with one CNAME at the DNS host of thues.eu, plus the redirect URI in the OAuth client and `BETTER_AUTH_URL`.
- OIDC for the project uses the team issuer mode.

### Environment variables

| name | in Vercel | value |
|---|---|---|
| `BETTER_AUTH_SECRET` | production, sensitive | random, 32 bytes |
| `BETTER_AUTH_URL` | production | production URL |
| `GOOGLE_CLIENT_ID` | production | OAuth client |
| `GOOGLE_CLIENT_SECRET` | production, sensitive | OAuth client |
| `DASHBOARD_ALLOWED_EMAILS` | production | Robin's email |
| `GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER` | production, development | from setup |
| `GCP_SERVICE_ACCOUNT_EMAIL` | production, development | `rt-analytics-dashboard@...` |
| `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | production, development | from setup |
| `ANALYTICS_DATASET` | production, development | `analytics` |
| `DASHBOARD_CONFIG_DATASET` | production, development | `analytics_dashboard` |
| `DASHBOARD_CACHE_TTL_SECONDS` | production | default 3600 |
| `DASHBOARD_MAX_BYTES_PER_QUERY` | production, development | default 1000000000 |
| `DASHBOARD_TEST_LOGIN`, `DASHBOARD_TEST_LOGIN_SECRET` | never | local only |

Local development: Vercel cannot give sensitive variables to the development environment. So `vercel env pull .env.development.local` brings the non-secret values and the `VERCEL_OIDC_TOKEN`, and a hand-written `apps/dashboard/.env.local` (gitignored) holds the local secrets: `BETTER_AUTH_SECRET` (a separate local value), `BETTER_AUTH_URL=http://localhost:3000`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DASHBOARD_ALLOWED_EMAILS`, and the test-login values. `apps/dashboard` is linked with `vercel link`, so `@vercel/oidc` can refresh an expired development token by itself (it uses `.vercel/project.json` and the CLI login).

Secrets are backed up in Robin's Chrome Password Manager (one entry per secret: site = service, username = variable name, password = value, note = project and purpose). The existing copies in Robin's Downloads folder stay.

## 11. Order of work (v1)

One PR each, in this order:

1. **Monorepo move** and TypeScript 6.0.3 for the repo. No behavior change; the release workflow still publishes the library with the same file list and built output.
2. **ESLint and Prettier for the library** (standard stack migration, separate small task).
3. **Library:** `rt-analytics/schema` entry and constants; `retention.sql` and `funnel.sql` template fixes.
4. **Demo:** generator with the dwd profile, demo app. Comes early so the dashboard is built against demo data from the start; it only needs the `schema` entry and Robin's `gcloud` login.
5. **GCP:** `analytics_dashboard`, service account, workload identity pool (`setup:gcp --dashboard`), OAuth client by hand.
6. **Dashboard part 1:** app skeleton, Better Auth with allowlist and test login, `proxy.ts`, deploy to `*.vercel.app`, and one proof query through OIDC and the cached path (section 5).
7. **Dashboard part 2:** query layer, cache, Live, Refresh, byte cap, discovery, app picker, settings page, header.
8. **Overview** page.
9. **Events explorer** with filter.
10. **Funnel builder** with saved funnels.
11. **HTML guide:** storing the dashboard's secrets in Chrome Password Manager, including turning on on-device encryption.

## 12. Known limits (v1)

- Cookieless visitors cannot be followed across days. Persistent-only panels show coverage instead of guessing.
- Cookieless sessions restart on full page loads; consent acceptance splits a visit into two sessions and two visitors.
- A session longer than one day (rare, the SDK has no maximum session length) is split at the read window.
- One person counts twice after `identify()`.
- Small overcount of daily visitors around 00:00 UTC.
- Funnels only work within one session.
- Sign-in does not work on preview deployments.
- Discovery looks at event names of the last 30 days and prop keys of the last 7 days, top-level scalar props only. Keys that `JSON_KEYS` returns quoted (like `a.b`) are skipped.
- The byte cap works on an upper-bound estimate that includes other apps' rows in the same partitions.
- Demo rows share the table with real apps; maintenance SQL by date or app must filter by `app_id`.

## 13. v2 (defined now, not built in v1)

In rough priority order. Each item gets its own spec or a short design when it starts.

1. **Person funnels:** steps across sessions for persistent IDs, with a window (1, 7 or 30 days) and coverage. Useful once dwd has the consent banner; the demo data already supports it.
2. **"Seen on N days" metric** in the explorer: distinct values of a prop that appear on at least N days in a rolling window. With a filter on `client`, this gives dwd's exact active-subscription definition without dwd-specific code.
3. **Identity stitching:** a range-bounded map from `$identify` events (`visitor_id` to `user_id`) so one person is one key: `COALESCE(user_id, map[visitor_id], visitor_id)`. Needed once an app uses login (wordle with Firebase).
4. **Week and month uniques** for persistent IDs.
5. **Funnel editing and renaming** in place.
6. **Sign-in on preview deployments** with Better Auth's OAuth proxy plugin, plus preview access in the OIDC condition.
7. **FCP and TTFB:** collect them in the library (a library release) and add them to the web vitals panel.
8. **More discovery and filters:** nested props, more than one filter condition.
9. **Precomputed daily aggregates** (scheduled query into small tables), only if bytes scanned or load times grow.
10. **Self-hostable dashboard (option b):** setup docs, `setup:gcp --dashboard` for other projects, config for dataset names and branding, a deploy guide. Builds on everything above being generic already.

## Follow-ups (not part of this spec)

- dwd: try the library's consent banner (with an update to the privacy text), so dwd gets persistent visitor data.
- Domain: `analytics.thues.eu` once the dashboard is stable.
- rt-analytics 0.4.0 release with the `schema` entry and template fixes.
- Back to TypeScript 7 when `typescript-eslint` supports it.
- Apps to Node 26 LTS when Vercel supports it.
- Move the ingest writer to OIDC as well, so no service account key is left.
