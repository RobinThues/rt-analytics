# rt-analytics dashboard: Design

**Date:** 2026-10-14
**Status:** Decisions settled in a grilling session with Robin on 2026-10-13. Waiting for Robin's review of this document. No fresh-agent review yet (Robin will ask for it).
**Builds on:** [2026-07-11-rt-analytics-design.md](2026-07-11-rt-analytics-design.md), [2026-10-12-rt-analytics-0.2.0-design.md](2026-10-12-rt-analytics-0.2.0-design.md)

## Goal

A dashboard for the analytics data that rt-analytics writes to BigQuery. It is generic and multi-app: it has no code for any specific app. Fixed panels cover the built-in events (`$pageview`, `$session_start`, `$web_vital`, `$error`, `$consent`, `$identify`). Everything else (app events and their props) is discovered from the data at runtime.

v1 is for Robin only. It is built so that it could become a self-hostable part of rt-analytics later, without a rewrite.

Success for v1:

- Robin opens the dashboard, picks an app, and sees traffic, top pages, sources, devices, errors, web vitals and consent split for any date range, compared with the previous period.
- He can explore any app event (count over time, breakdown by a prop) and build, save and reopen funnels from discovered events, without a code change in the dashboard.
- It runs on demo data before any real app is involved, and the same code shows real apps.
- BigQuery cost stays at zero in practice (free tier), and no single query can scan more than a configured cap.

## Non-goals

- Fingerprinting or any other way to recognize cookieless visitors across days. It needs consent under §25 TDDDG just like a cookie (EDPB Guidelines 2/2023), and is less reliable than a stored ID.
- Precomputed aggregate tables (scheduled queries, cron). Revisit only if bytes scanned grow.
- Real-time streaming updates in the UI. "Live" means "skip the cache", not push updates.
- Multiple users, roles or sharing. One email allowlist.
- App-specific panels, labels or code of any kind.
- Alerts, exports, scheduled reports.
- Deploying the demo app. It runs locally in v1.
- A consent banner on dwd. Separate dwd task (see Follow-ups).

## 1. Repo layout

The repo becomes an npm workspaces monorepo. The move is its own PR with no behavior change.

```
package.json                 root: private, "workspaces": ["packages/*", "apps/*"], shared dev tooling, ops scripts
packages/rt-analytics/       the library (today's src/, test-d/, tsdown and vitest config, CHANGELOG, README)
apps/dashboard/              the dashboard (Next.js), never published
apps/demo/                   today's example/, becomes the demo app (appId "demo")
sql/                         views and templates, shared, unchanged location
scripts/                     setup-gcp.ts, pseudonymize.ts, generate-demo-data.ts (ops for the whole repo)
docs/                        unchanged
```

Details:

- `.env.analytics` and `key.json` stay at the repo root, gitignored. The scripts keep reading them from the root.
- Root `package.json` keeps `setup:gcp` and `pseudonymize`, and gets `demo:generate`. Library scripts (`build`, `test`, `typecheck`, `typecheck:dist`, `prepublishOnly`, `prepare`) move to `packages/rt-analytics/package.json`.
- `release.yml`: the tag guard reads `packages/rt-analytics/package.json`, and publish runs with `working-directory: packages/rt-analytics` (or `npm publish -w rt-analytics`). Tags stay `vX.Y.Z` and mean library releases only. The published tarball must be identical in content to a pre-move build (checked with `npm pack --dry-run` file lists before and after).
- `npm test` at the root runs every workspace's tests.
- The `paths` mapping in today's `tsconfig.json` moves with the library. Apps resolve `rt-analytics` through the workspace symlink.
- The library's `engines` stays `>=22` (consumer-facing). The apps use Node 24 LTS (Vercel default). Node 26 becomes LTS at the end of October 2026; we move the apps when Vercel offers it.
- ESLint and Prettier: the dashboard and demo get them from the start. Adding them to the library is a separate small PR (standard stack rule: migrate existing code as its own task).

### New library entry: `rt-analytics/schema`

The dashboard needs the event schema and the built-in event names. Today those live inside `next/` (the `EventRow` type) and as string literals. A new entry `rt-analytics/schema` exports:

- `EventRow` (moved from `src/next/bigquery-writer.ts`, re-exported from `rt-analytics/next` so nothing breaks),
- `BUILTIN_EVENTS` (`as const` list of the `$` names) and a `BuiltinEvent` type,
- `ConsentState` including `"server"`,
- `DAILY_VISITOR_PREFIX = "d_"`.

The library code uses these constants instead of literals, so a rename breaks the dashboard build instead of silently showing zeros. The dashboard depends on the workspace version. The next npm release (0.4.0) includes the entry; the dashboard does not wait for it.

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

Writes use DML (`MERGE` on `kind, id`, `DELETE`), never streaming inserts, because streamed rows cannot be updated for a while.

### Identity without keys

The dashboard runs with no service account key. Vercel issues OIDC tokens to the deployment; GCP Workload Identity Federation exchanges them for a short-lived token of a service account.

- Service account `rt-analytics-dashboard`, no keys.
  - `roles/bigquery.jobUser` on the project (needed to run queries),
  - `roles/bigquery.dataViewer` on dataset `analytics`,
  - `roles/bigquery.dataEditor` on dataset `analytics_dashboard`.
- Workload identity pool `vercel`, OIDC provider `vercel` with issuer `https://oidc.vercel.com/<team-slug>` (Vercel team issuer mode), `google.subject = assertion.sub`.
- Attribute condition: only the dashboard's Vercel project, in the production, preview and development environments:
  `assertion.sub.startsWith("owner:<team-slug>:project:<dashboard-project>:environment:")`
- `roles/iam.workloadIdentityUser` on the service account for that pool's principals.
- The script prints the non-secret values the app needs (project number, pool ID, provider ID, service account email).

In code (`apps/dashboard/src/bq/client.ts`): `ExternalAccountClient.fromJSON(...)` from `google-auth-library` with `subject_token_supplier` calling `getVercelOidcToken({ audience })` from `@vercel/oidc`, as in Vercel's GCP OIDC guide. Local development uses the same path: `vercel env pull` writes a development `VERCEL_OIDC_TOKEN` (valid for 12 hours) to `.env.local`.

Cost guards: the existing project quota (30 GiB/day) and budget alert stay. Every dashboard query also sets `maximumBytesBilled` (section 5).

### Google OAuth client

A Google OAuth client (web application) in the same project for sign-in. Redirect URIs: the production `*.vercel.app` URL and `http://localhost:3000`, later `https://analytics.thues.eu`. Created by hand in the Google Cloud console, because there is no supported API or `gcloud` command for OAuth web clients. The implementation plan lists the click steps.

## 3. Dashboard app

### Stack and versions

Latest stable versions, checked on npm and nodejs.org on 2026-10-14. The plan re-checks them at implementation time.

| tool | version |
|---|---|
| Node.js | 24 LTS (24.21.0) |
| Next.js (App Router, `cacheComponents: true`) | 16.4.0 |
| React | 19.3.0 |
| TypeScript | 7.0.2 (Next 16.3+ type-checks TS 7 through the `tsc` CLI) |
| Tailwind CSS | 4.3.3 |
| shadcn/ui CLI (chart components on Recharts) | 4.21.4, Recharts 3.10.1 |
| Better Auth | 1.7.7 |
| @google-cloud/bigquery | 9.3.0 |
| google-auth-library | 11.3.0 |
| @vercel/oidc | 4.0.0 |
| ESLint + eslint-config-next | 10.12.0 + 16.4.0 |
| Prettier | 3.9.10 |
| Vitest, happy-dom, @testing-library/react | 5.0.4, 21.0.1, 16.3.3 |
| Playwright | 1.64.0 |

Auth library choice: next-auth v5 is still beta (stable `latest` is v4) and Auth.js now gets security fixes only from the Better Auth team. Better Auth is stable and supports a fully stateless setup with no database.

### Units

```
apps/dashboard/src/
  auth/        Better Auth config, allowlist check, requireUser()
  bq/          BigQuery client (OIDC), runQuery() with cache, live and byte cap
  time/        date range and timezone math, previous-period math
  queries/     one module per panel: pure functions returning { sql, params }
  discovery/   event and prop discovery queries plus prop key validation
  config/      dashboard_config store (read, save, delete)
  app/         routes, pages, server actions
  components/  charts, KPI tiles, tables, date picker, live toggle
```

The query builders are pure and know nothing about Next.js, so they can be tested without a server and, later, reused by a self-hosted version.

### Routes and URL state

| route | page |
|---|---|
| `/` | app picker (distinct `app_id` seen in the last 90 days, cached) |
| `/[appId]` | overview |
| `/[appId]/events` | events explorer |
| `/[appId]/funnels` | funnel builder and saved funnels |
| `/[appId]/settings` | app settings (timezone) |
| `/sign-in` | Google sign-in |

All view state lives in the URL, so every view can be bookmarked: `from`, `to` (dates in the app's timezone, default last 28 days), `compare` (default on), and per page `event`, `metric`, `by`, `steps`, `unit`, `window`, `funnel` (saved funnel ID).

The header shows the app picker, the date range picker, the compare switch, the Live toggle and the Refresh button.

## 4. Auth

- Better Auth in stateless mode (no database): session in an encrypted cookie, OAuth state in a cookie. Google is the only provider.
- `DASHBOARD_ALLOWED_EMAILS`: comma-separated list, compared lowercase. Sign-in is refused for any other email, and also when Google reports the email as unverified (`databaseHooks.user.create.before`, the documented way in stateless mode).
- Defense in depth: `requireUser()` re-checks the session email against the allowlist on every page render and in every server action. `proxy.ts` only does the cheap redirect to `/sign-in` when no session cookie exists; it is not the security boundary.
- Preview deployments have changing URLs, so Google sign-in only works on production and localhost in v1. Previews are still protected by Vercel's standard deployment protection. If previews with data are needed later, Better Auth's OAuth proxy plugin is the fix.
- A test-only sign-in for Playwright (section 9) exists only when `DASHBOARD_TEST_LOGIN=1` and `VERCEL` is not set. The app refuses to start if both are set.

## 5. Query layer

`runQuery({ sql, params, appId, kind })` is the only way the app talks to BigQuery.

- Always parameterized (`@app_id`, `@from_ts`, `@to_ts`, `@tz`, `@event`, ...). User input never goes into SQL text, with one exception: prop keys (below).
- Every query on `analytics.events` filters `app_id` and a `timestamp` range, so partition pruning and clustering (`app_id, event_name`) apply.
- `maximumBytesBilled` from `DASHBOARD_MAX_BYTES_PER_QUERY` (default 1 GB). When BigQuery refuses a query for this reason, the panel shows "This query would scan more than 1 GB. Choose a shorter date range." instead of data.
- BigQuery's own result cache (`useQueryCache`) stays on; it is free.
- Location `EU`.

### Prop keys

BigQuery's JSONPath arguments must be literals, so a prop key cannot be a query parameter. A prop key is only used when it matches `^[A-Za-z0-9_]{1,64}$` and is in the discovered key list for that event. It is then written into the SQL as `JSON_VALUE(props, '$.<key>')`. Anything else is rejected before a query runs.

### Cache, Live and Refresh

- The cached path wraps `runQuery` in a function with `'use cache: remote'` (Vercel runtime cache, shared by all instances), `cacheTag('bq', 'bq:<appId>')` and `cacheLife({ expire: TTL })`.
- `DASHBOARD_CACHE_TTL_SECONDS` sets the TTL (default 3600). `0` disables the cache completely.
- Live toggle: sets the cookie `rtd_live=1` for this browser. While it is set, every query skips the cache (TTL 0 for this user only). Shown as a clear "Live" badge in the header.
- Refresh button: a server action calls `updateTag('bq:<appId>')`, so the next load queries BigQuery for everyone.
- Discovery and the app list use the same mechanism with tag `discovery`, and a TTL of at least 3600 even when the main TTL is lower. Live skips it too.
- Config reads are cached with tag `config` and invalidated with `updateTag('config')` after every write.

### Errors

Each panel renders in its own Suspense boundary and error boundary. A failing query breaks only its panel and shows a short message plus a retry link. Auth or credential errors (OIDC exchange failed) show one banner at page level and are logged server-side with the reason, never with token contents.

## 6. Metric definitions

### Time

- Every app has a timezone in `dashboard_config` (`app_settings.timezone`, IANA name), default `Europe/Berlin`.
- A day is `DATE(timestamp, @tz)`. A range `from..to` covers `[from 00:00, to+1 00:00)` in the app timezone, converted to UTC timestamps for the partition filter.
- Compare: the previous period has the same length and ends directly before `from`. KPI tiles show the change in percent; time series show the previous period as a dashed line aligned by day offset.
- The `d_` daily visitor hash in the ingest keeps using UTC days. It is only an ID, so this does not matter.

### Identity kinds

| kind | rule |
|---|---|
| persistent | `user_id` is set, or `visitor_id` is set and does not start with `d_` |
| daily | `visitor_id` starts with `d_` and `user_id` is null |
| none | server events (`consent_state = 'server'`, no visitor or session) |

The person key for persistent metrics is `COALESCE(user_id, visitor_id)`.

### Metrics

- **Visitors per day:** distinct `visitor_id` per day, all kinds. This is the main visitor number in time series.
- **Visitors KPI for a range:** average daily visitors. Next to it: distinct persistent people in the range, with coverage.
- **Coverage:** share of sessions in the range whose events carry a persistent ID. Shown on every persistent-only panel, e.g. "based on 14 % of sessions".
- **Sessions:** distinct `session_id`. **Bounce rate:** sessions with at most one `$pageview`.
- **Returning visitors (persistent only):** persistent people active on two or more distinct days in the range.
- **Retention (persistent only):** weekly cohorts by first day seen in the range, share active in each later week (based on `sql/templates/retention.sql`).
- **Week and month uniques:** persistent IDs only. Daily IDs are never counted across days, because one person on three days would count as three.

## 7. Pages

### Overview (built-in events only)

- KPI tiles: daily visitors (avg), persistent people, sessions, pageviews, bounce rate, errors. Each with compare.
- Visitors, sessions and pageviews over time.
- Top pages (`page_path`), entry pages.
- Sources: referrer host and `utm_source / utm_medium / utm_campaign`.
- Countries, devices, browsers, OS.
- Web vitals: p75 per metric (LCP, INP, CLS, FCP, TTFB) and the slowest pages by LCP p75.
- Errors: count over time and top messages.
- Consent split: share of pageviews per `consent_state`.
- Returning visitors and retention: shown with coverage; replaced by a short note when coverage is 0.

### Events explorer

- **Discovery:** all non-`$` event names seen in the last 30 days, each with its top-level prop keys whose values are strings, numbers or booleans (`JSON_KEYS(props, 1)` plus `JSON_TYPE`). Nested objects and arrays are ignored in v1.
- **List:** each event with its count in the range, compare change and a small trend line.
- **Selected event:** a time series with a metric choice:
  - events,
  - sessions with the event,
  - visitors with the event (same rules as section 6),
  - distinct values of a prop. For example, distinct `subscription` values of `calendar_poll` per day gives dwd's active subscriptions without any dwd-specific code.
- **Breakdown by one prop:** top 20 values plus "other", as a table with counts and compare.
- Server events (like dwd's `calendar_poll`) are normal events here. Visitor and session metrics are hidden for an event when none of its rows has those IDs.

### Funnel builder

- 2 to 5 steps, each a discovered event (including `$pageview`).
- Unit:
  - **session** (default): steps in order within one session.
  - **person**: only offered when the app has persistent IDs. Steps in order within a window (default 7 days, choice 1, 7, 30) from the first step. Shows coverage.
- Ordered: a step counts only after the previous step's first occurrence.
- Output: count per step, conversion from the first and from the previous step, and the previous period's numbers when compare is on.
- **Save:** name the funnel, stored in `dashboard_config` (`kind = funnel`, value `{ steps, unit, window }`). Saved funnels are listed per app, open by `?funnel=<id>`, and can be renamed or deleted.

### Settings

Per app: timezone (select from IANA names). Stored in `dashboard_config`.

## 8. Demo data

Demo data lives in the real `analytics.events` table with `app_id = 'demo'`. The dashboard treats it like any other app.

Rules that come with this:

- Every delete or maintenance SQL in this repo and in consumer repos filters by `app_id`. The README says so.
- Cleanup: `DELETE FROM analytics.events WHERE app_id = 'demo'` (rows from the last ~30 minutes may still be in the streaming buffer; the generator only touches earlier days).

### Generator (`scripts/generate-demo-data.ts`, `npm run demo:generate`)

- Writes 90 days of events ending yesterday, with a fixed seed so runs are repeatable.
- The event shapes come from a profile file (`scripts/demo-profile.ts`), so another profile (e.g. wordle) can be added without code changes. The first profile is modeled on dwd:
  - `$session_start`, `$pageview` on a handful of paths, `$web_vital`, rare `$error`, `$consent`,
  - `place_selected { source, place }`, `subscribe_click { target, place, fields }`,
  - server-side `calendar_poll { subscription, kind, client }` from a slowly growing pool of subscriptions, a few polls per subscription per day.
- Visitor mix: about 80 % cookieless (`d_` daily IDs, new ID each day), 15 % consented (persistent IDs, some return over days and weeks), 5 % declined. Weekday and time-of-day patterns, slow growth, a few referrer and UTM sources, a few countries and devices.
- Writes NDJSON and loads it with a BigQuery load job (free) into `analytics.events`. `--replace` first deletes `app_id = 'demo'` rows before today.
- Runs locally with Robin's own `gcloud` login (application default credentials), not with the dashboard or writer identity.
- Size: a few tens of thousands of rows, well inside the free tier.

### Demo app (`apps/demo`, today's `example/`)

- `appId: "demo"`, shows the library's consent banner so both cookieless and consented paths are exercised.
- A few pages and buttons that send the same events as the generator's profile, so live events join the generated history.
- Its ingest route uses the existing writer credentials from `.env.analytics` and `allowedAppIds: ["demo"]`.
- It is also the integration reference for new projects (wordle and others).

## 9. Testing

- **Unit (Vitest, node):** every query builder (SQL shape, params, partition filter present, `app_id` filter present), prop key validation (rejects injection attempts), range and timezone math including DST changes, previous-period math, identity kind rules, allowlist check, the live/TTL decision.
- **Dry-run integration (opt-in, like the existing `bigquery-writer.integration.test.ts`):** every query builder runs as a BigQuery dry run against `app_id = 'demo'`. Dry runs are free, validate the SQL, and return the bytes estimate; the test fails if a query would scan more than the cap for a 90-day range.
- **Component (Vitest + happy-dom + Testing Library):** KPI tiles with and without compare, coverage notes, panel error states, funnel step editor.
- **End-to-end (Playwright, local only):** sign in with the test login, pick the demo app, check that overview, explorer and funnels render data, save and reopen a funnel, toggle Live and Refresh. Runs against `next start` with real demo data.
- **Library:** the existing suites keep passing after the monorepo move; the published file list is unchanged.

## 10. Deployment

- New Vercel project for the dashboard: root directory `apps/dashboard`, npm workspaces detected, Node 24.
- Build: the library is built first (`npm run build -w rt-analytics`), then the dashboard.
- Vercel skips the deployment when neither `apps/dashboard`, `packages/rt-analytics` nor `sql/` changed (built-in monorepo skipping for workspaces; an `ignoreCommand` with `git diff` as fallback).
- Domain: the default `*.vercel.app` URL while building. Later `analytics.thues.eu` with one CNAME at the DNS host of thues.eu, plus the redirect URI in the OAuth client and `BETTER_AUTH_URL`.
- OIDC for the project uses the team issuer mode.

### Environment variables

| name | secret | value |
|---|---|---|
| `BETTER_AUTH_SECRET` | yes | random, 32 bytes |
| `BETTER_AUTH_URL` | no | production URL |
| `GOOGLE_CLIENT_ID` | no | OAuth client |
| `GOOGLE_CLIENT_SECRET` | yes | OAuth client |
| `DASHBOARD_ALLOWED_EMAILS` | no | Robin's email |
| `GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER` | no | from setup |
| `GCP_SERVICE_ACCOUNT_EMAIL` | no | `rt-analytics-dashboard@...` |
| `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | no | from setup |
| `ANALYTICS_DATASET` | no | `analytics` |
| `DASHBOARD_CONFIG_DATASET` | no | `analytics_dashboard` |
| `DASHBOARD_CACHE_TTL_SECONDS` | no | default 3600 |
| `DASHBOARD_MAX_BYTES_PER_QUERY` | no | default 1000000000 |

Secrets are Vercel "sensitive" variables, with a backup in Robin's Chrome Password Manager (one entry per secret: site = service, username = variable name, password = value, note = project and purpose). The existing copies in Robin's Downloads folder stay.

## 11. Order of work

One PR each, in this order:

1. Monorepo move (no behavior change; release workflow still publishes the library unchanged).
2. ESLint and Prettier for the library (standard stack migration, separate small task).
3. `rt-analytics/schema` entry and constants in the library.
4. GCP: `analytics_dashboard`, service account, workload identity pool (`setup:gcp --dashboard`), OAuth client by hand.
5. Dashboard shell: auth, app picker, query layer with cache, Live, Refresh, byte cap, settings page. Deployed to `*.vercel.app`.
6. Demo generator and demo app.
7. Overview page.
8. Events explorer.
9. Funnel builder with saved funnels.
10. HTML guide: storing the dashboard's secrets in Chrome Password Manager (including turning on on-device encryption).

## 12. Known limits

- Cookieless visitors cannot be followed across days. Persistent-only panels show coverage instead of guessing.
- Funnels across sessions only work for persistent IDs.
- Sign-in does not work on preview deployments in v1.
- Discovery only looks at the last 30 days and top-level scalar props.
- Demo rows share the table with real apps; every maintenance SQL must filter by `app_id`.

## Follow-ups (not part of this spec)

- dwd: try the library's consent banner (with an update to the privacy text), so dwd gets persistent visitor data.
- Domain: `analytics.thues.eu` once the dashboard is stable.
- rt-analytics 0.4.0 release with the `schema` entry.
- Apps to Node 26 LTS when Vercel supports it.
- Move the ingest writer to OIDC as well, so no service account key is left.
