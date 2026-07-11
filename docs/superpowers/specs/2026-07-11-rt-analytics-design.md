# rt-analytics — Design

**Date:** 2026-07-11
**Status:** Approved pending user review
**Package name:** `rt-analytics` (verified available on npm)

## Goal

A free, self-owned web-analytics library for Robin's hobby projects: TypeScript/Next.js apps (App Router, Next 16) hosted on Vercel. Captures user behavior (pageviews, sessions, custom events, Web Vitals, JS errors) into BigQuery on the existing GCP account. Total running cost: $0 at hobby scale.

## Non-goals (out of scope)

- Click auto-capture (PostHog-style heatmap data).
- A dashboard UI. A custom Next.js dashboard app is a **separate future project**. Until then, analysis happens ad hoc via the `bq` CLI or a BigQuery MCP server (e.g. Google's MCP Toolbox for Databases), both of which agents can drive directly.
- GDPR data-deletion tooling beyond a delete-by-visitor SQL snippet in `sql/`.
- Go/Python SDKs. The HTTP ingestion contract is documented so later SDKs are straightforward.
- Any queue/buffer infrastructure between Vercel and BigQuery.
- Integrating the four consumer apps (that's follow-up work per app, not part of this repo's plan).

## Key decisions

| Decision | Choice |
|---|---|
| Build vs reuse | Build own end-to-end (learning + ownership were explicit goals) |
| Storage | BigQuery, single shared dataset + table for all apps |
| Ingestion path | Next.js route handler shipped by the library, deployed inside each app (same-origin, Vercel free tier) |
| BigQuery write API | Storage Write API (2 TiB/mo free) — **not** legacy `insertAll` (paid) |
| Visitor identity | Consent-gated: cookieless daily hash before/without consent, persistent localStorage ID after consent |
| User stitching | `identify(userId)` events + SQL view (no link table) |
| Distribution | Public npm package `rt-analytics`, semver |
| Dashboards | None in this project; SQL views are the stable contract; own dashboard app later |
| Ad-hoc analysis | `bq` CLI / BigQuery MCP, agent-driven |

## Architecture

```
Browser (SDK: queue, batch, consent, sessions)
  → POST /api/a  (same app, same origin; sendBeacon on page-hide)
    → route handler (validate, enrich: geo header, UA parse, pre-consent hash)
      → BigQuery Storage Write API → analytics.events
```

One npm package, three subpath exports:

| Export | Contents | Runs |
|---|---|---|
| `rt-analytics` | Framework-agnostic core: `createAnalytics<EventMap>()`, queue/batching, session logic, consent state machine, visitor ID, auto-capture (pageviews, Web Vitals via `web-vitals`, unhandled errors) | Browser |
| `rt-analytics/react` | `<AnalyticsProvider>`, `useAnalytics()`, `<ConsentBanner>` (unstyled, themeable) | Browser (React 19) |
| `rt-analytics/next` | `createAnalyticsHandler()` (route handler factory), `<PageviewTracker>` (App Router navigation events) | Server / client |

Consumer integration (per app, three steps):

1. `npm install rt-analytics`
2. `app/api/a/route.ts`: `export const { POST } = createAnalyticsHandler()`
3. Wrap root layout with `<AnalyticsProvider appId="wordle" events={...}>`; set env vars `ANALYTICS_GCP_CREDENTIALS` (service-account key JSON) and `ANALYTICS_DAILY_SALT`.

Custom events are typed via a per-app event map generic:

```ts
const analytics = createAnalytics<{
  game_won: { attempts: number };
  game_lost: Record<string, never>;
}>({ appId: "wordle" });
analytics.track("game_won", { attempts: 3 });
```

### Core SDK behavior

- **Batching:** flush every 5 s or 10 events, whichever first; `navigator.sendBeacon` on `visibilitychange: hidden`.
- **Sessions:** session ID generated client-side; 30-minute inactivity timeout; `$session_start` event on new session. Pre-consent the ID lives in memory (per tab); post-consent it persists in `sessionStorage`.
- **Auto-captured events** are `$`-prefixed to avoid collisions: `$pageview`, `$session_start`, `$web_vital`, `$error`, `$identify`, `$consent`.

## Consent & identity

Consent state machine: `pending → accepted | declined` (choice persisted only after an explicit choice; `pending` stores nothing).

- **`pending` / `declined` — cookieless mode.** No device storage. `visitor_id` is computed server-side in the route handler: `SHA256(daily_salt + IP + user_agent + app_id)`, rotating daily. IP is used transiently, never stored. Accurate pageviews/sessions/same-day uniques; no cross-day identity. This mode triggers no consent-banner obligation (TTDSG/GDPR).
- **`accepted` — persistent mode.** Random `visitor_id` in `localStorage`, stable across visits: true retention and cross-visit funnels.

`<ConsentBanner>` ships with the library (unstyled + CSS-variable theming). Apps with Firebase Auth call `analytics.identify(userId)` on login (fires `$identify` with both IDs) and `analytics.reset()` on logout. The `visitor↔user` mapping is a BigQuery view derived from `$identify` events.

## Ingestion route

`POST /api/a`, accepts a batch of events. Hardening (public endpoint):

- Same-origin check (Origin/Referer vs request host).
- Payload cap (50 KB) and batch cap (25 events) — defaults, overridable in `createAnalyticsHandler()`.
- Strict per-field schema validation (hand-rolled, no runtime dep); unknown fields dropped.
- Known-bot user-agent filtering.
- Invalid input → silent `202` (no feedback to probing clients).

Server enrichment: `country` from Vercel geo header (`x-vercel-ip-country`), UA parsed into `browser`/`os`/`device_type`, cookieless hash when the client has no persistent ID.

## BigQuery

Dataset `analytics`, table `events` — shared by all apps, partitioned by `DATE(timestamp)`, clustered by `app_id, event_name`.

Columns: `event_id` (UUID), `app_id`, `event_name`, `timestamp`, `visitor_id`, `session_id`, `user_id` (nullable), `page_path`, `referrer`, `utm_source`, `utm_medium`, `utm_campaign`, `country`, `browser`, `os`, `device_type`, `viewport_w`, `viewport_h`, `props` (JSON), `consent_state`, `sdk_version`.

Views (in `sql/`, created by the setup script; the stable contract for the future dashboard app):

- `identity_map` — visitor↔user from `$identify` events.
- `sessions` — per-session rollup: duration, pages, entry/exit path, bounce.
- `daily_stats` — per app/day: pageviews, uniques, top referrers/paths.
- Query templates (not views): funnel (2–4 event names to fill in), weekly retention cohorts, Web Vitals percentiles, recent `$error` events, delete-by-visitor snippet.

Free-tier math: 10 GB storage / 1 TB query / 2 TiB Storage-Write ingest per month vs. hobby scale (≪ 1 M events/mo ≈ ≪ 1 GB/yr). No realistic path to a bill; partitioning + clustering keep query scans in the MB range.

## GCP setup (scripted, idempotent)

`npm run setup:gcp` runs `scripts/setup-gcp.ts` using local `gcloud` auth (Application Default Credentials). It creates: dataset, table, views, a service account with `BigQuery Data Editor` scoped to the dataset only, and a key — printing the JSON for pasting into each Vercel project's env. Safe to re-run; re-running is also the schema/view upgrade path.

## Distribution

Public npm package `rt-analytics`. Built with `tsup` (ESM, `.d.ts`), `peerDependencies` on `react`/`next` (optional for core), server-only deps (`@google-cloud/bigquery-storage`) isolated in the `/next` export so client bundles stay lean. Semver tags; `npm publish` from the repo. No credentials or personal data in the package — configuration is entirely env-var/props-driven.

## Testing

Vitest.

- **Unit (core):** consent state machine, session timeout logic, queue/batching/flush triggers, visitor-ID behavior per consent state.
- **Integration (route handler):** validation, origin check, size caps, bot filtering, hash derivation — BigQuery writer mocked.
- **Writer:** one opt-in integration test against a real dev dataset (skipped by default).
- **Manual E2E:** `example/` Next.js app in the repo as the playground.

## Rollout

1. Implement library + setup script in this repo; publish `v0.1.0`.
2. Integrate **wordle-next** first (simplest, no auth) as real-world validation.
3. Then **phase10-tracker** or **secret-santa-generator** to exercise `identify()` with Firebase Auth.
4. Remaining apps follow the same recipe as desired.
5. Later, separate project: custom dashboard app on the SQL views.
