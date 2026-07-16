# rt-analytics

Self-owned, free web analytics for Next.js (App Router) apps hosted on Vercel. Events flow from
the browser through your own API route into your own BigQuery project, written via the BigQuery
Storage Write API **default stream** — the free ingestion path, never the paid `insertAll` /
streaming-buffer API. There is no third-party service, no vendor dashboard, and no per-event cost:
you pay only BigQuery's storage/query costs, which stay inside the free tier for small-to-medium
traffic.

You own the data, the schema, and the queries. There's no built-in dashboard — you query BigQuery
directly (via `bq`, the BigQuery MCP server, a notebook, or your own dashboard app).

## Quickstart

```bash
npm install rt-analytics
```

**1. Add the ingestion route** (`app/api/a/route.ts`):

```ts
import { createAnalyticsHandler } from "rt-analytics/next";

export const { POST } = createAnalyticsHandler();
```

**2. Wrap your root layout** (`app/layout.tsx`):

```tsx
import { AnalyticsProvider, ConsentBanner } from "rt-analytics/react";
import { PageviewTracker } from "rt-analytics/next/client";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AnalyticsProvider appId="my-app">
          <PageviewTracker />
          {children}
          <ConsentBanner />
        </AnalyticsProvider>
      </body>
    </html>
  );
}
```

**3. Set two environment variables** (locally in `.env.local`, and in Vercel — see
[GCP setup](#gcp-setup) for how to generate them):

```
ANALYTICS_GCP_CREDENTIALS={"type":"service_account","project_id":"...","client_email":"...","private_key":"...", ...}
ANALYTICS_DAILY_SALT=<random hex string>
```

`ANALYTICS_GCP_CREDENTIALS` is the service account key JSON collapsed to one line.
`ANALYTICS_DAILY_SALT` seeds the cookieless daily visitor hash (see [Consent model](#consent-model)) —
keep it secret and stable; rotating it changes cookieless visitor ids going forward.

That's it. Custom events from any client component:

```tsx
"use client";
import { useAnalytics } from "rt-analytics/react";

function BuyButton() {
  const analytics = useAnalytics<{ purchase: { amount: number } }>();
  return <button onClick={() => analytics.track("purchase", { amount: 42 })}>Buy</button>;
}
```

On login/logout, link/unlink the visitor to your own user id:

```ts
analytics.identify(user.id); // call on login
analytics.reset(); // call on logout
```

See `example/` for a complete minimal app wired against the package's own build output.

## GCP setup

```bash
npm run setup:gcp                    # uses your gcloud default project
npm run setup:gcp -- --project my-gcp-project-id
```

Requires the `gcloud` CLI authenticated (`gcloud auth application-default login`) with permission
to create BigQuery resources and service accounts in the target project. The script is idempotent
— safe to re-run — and on each run it:

1. Creates the `analytics` BigQuery dataset (region `EU`) if missing.
2. Creates the `events` table (partitioned by day on `timestamp`, clustered on `app_id, event_name`)
   if missing.
3. Applies the `identity_map`, `sessions`, and `daily_stats` views from `sql/views/`
   (`CREATE OR REPLACE`, so upgrades are safe).
4. Creates a `rt-analytics-writer` service account, scoped to **WRITER** access on just the
   `analytics` dataset (not project-wide `dataEditor`).
5. Creates a key for that service account (`key.json`, gitignored) if one doesn't already exist
   locally, and generates a random `ANALYTICS_DAILY_SALT`.

At the end it prints both env var values to your terminal — paste them into your Vercel project's
environment variables (Project Settings → Environment Variables) for Production, Preview, and
Development, then paste the same into your local `.env.local`.

## Consent model

| Consent state | Storage | Visitor identity | Banner needed? |
| --- | --- | --- | --- |
| `pending` (default, before any choice) | none | server-computed daily-rotating hash of `salt + IP + user-agent + appId` | no — no device storage happens |
| `declined` | none | same daily-rotating hash as `pending` | no |
| `accepted` | `localStorage` | random UUID, persists indefinitely across visits | banner is what triggered this state |

Cookieless mode (`pending`/`declined`) never writes anything to the browser — no cookie, no
`localStorage`, no fingerprinting beyond a hash that intentionally rotates every day server-side,
so the same visitor cannot be tracked across days without their consent. Because nothing is stored
on the device, this mode is generally understood to fall outside the German TTDSG's / GDPR's
consent-required "storage of information" trigger, so showing `<ConsentBanner />` is optional
there — it exists only to offer **better** (persistent, cross-visit) analytics in exchange for
opt-in, not to gate tracking itself. If you don't need cross-visit retention, you can drop
`<ConsentBanner />` entirely and everyone stays in cookieless mode.

Accepting persists a random id in `localStorage` so returning visits are recognized; declining (or
never deciding) keeps every visit anonymous and unlinkable day-to-day.

## API reference

### `rt-analytics` (core)

- `createAnalytics<E extends EventMap>(config: AnalyticsConfig, deps?: AnalyticsDeps): Analytics<E>`
  Framework-agnostic client factory. No-ops on the server unless a `transport` dep is supplied.
  - `AnalyticsConfig`: `{ appId: string; endpoint?: string /* default "/api/a" */; flushIntervalMs?: number /* default 5000 */; maxBatchSize?: number /* default 10 */; captureWebVitals?: boolean /* default true */; captureErrors?: boolean /* default true */ }`
  - `AnalyticsDeps` (escape hatch for tests/advanced use): `{ localStorage?, sessionStorage?, transport?, now? }`
- `Analytics<E>` instance methods:
  - `track<K extends keyof E>(name: K, props: E[K]): void` — custom event; `name` must not start with `$`.
  - `page(): void` — emit `$pageview` for the current path (normally called for you by `PageviewTracker`).
  - `identify(userId: string): void` — attach a user id to subsequent events and emit `$identify`.
  - `reset(): void` — clear the user id, visitor id, and session (call on logout).
  - `flush(useBeacon?: boolean): void` — force-send the current batch now; pass `true` to use `navigator.sendBeacon` (used automatically on tab hide).
  - `getConsent(): ConsentState`, `acceptConsent(): void`, `declineConsent(): void`, `onConsentChange(fn): () => void`
- `SDK_VERSION: string`
- Types: `Analytics`, `AnalyticsDeps`, `Transport`, `AnalyticsConfig`, `AnalyticsEvent`, `Batch`, `ConsentState`, `EventMap`

### `rt-analytics/react`

- `<AnalyticsProvider appId="..." endpoint?, flushIntervalMs?, maxBatchSize?, captureWebVitals?, captureErrors?, instance? />` — creates one `Analytics` instance (via `createAnalytics`) and provides it via context. `instance` is an escape hatch to inject a prebuilt instance (tests/advanced use).
- `useAnalytics<E extends EventMap>(): Analytics<E>` — reads the instance from context; throws if used outside `<AnalyticsProvider>`.
- `<ConsentBanner message? acceptLabel? declineLabel? className? />` — renders only while consent is `pending`; calls `acceptConsent()`/`declineConsent()`. All props optional with sensible defaults.

### `rt-analytics/next/client`

- `<PageviewTracker />` — client component; call `analytics.page()` once per App Router navigation (tracks `usePathname()` changes). Place inside `<AnalyticsProvider>`, once, near the root layout.

### `rt-analytics/next`

- `createAnalyticsHandler(options?: HandlerOptions): { POST: (req: Request) => Promise<Response> }` — drop into `app/api/a/route.ts`.
  - `HandlerOptions`: `{ datasetId?: string /* default "analytics" */; tableId?: string /* default "events" */; maxBodyBytes?: number /* default 50000 */; salt?: string /* default process.env.ANALYTICS_DAILY_SALT */; writer?: RowWriter /* inject a custom writer, e.g. for tests */; now?: () => Date }`
  - Reads GCP credentials from `process.env.ANALYTICS_GCP_CREDENTIALS` (one-line service-account JSON) unless a `writer` is injected.
  - Always responds `202 Accepted` (even on malformed input, bot traffic, or write failure) so the client never retries or surfaces errors to users; failures are logged server-side via `console.error`.
  - Drops requests from bots (user-agent sniffing), cross-origin requests, and oversized bodies before touching BigQuery.
  - Types: `EventRow`, `RowWriter`, `WriterConfig`.

## HTTP ingestion contract

`POST /api/a` (or whatever `endpoint` you configured), JSON body, one batch per request:

```json
{
  "appId": "my-app",
  "sdkVersion": "0.1.0",
  "consentState": "pending",
  "events": [
    {
      "eventId": "8a1e...-uuid",
      "name": "$pageview",
      "ts": "2026-07-16T12:00:00.000Z",
      "sessionId": "session-uuid",
      "visitorId": null,
      "userId": null,
      "pagePath": "/pricing",
      "referrer": null,
      "utmSource": null,
      "utmMedium": null,
      "utmCampaign": null,
      "viewportW": 1280,
      "viewportH": 800,
      "props": {}
    }
  ]
}
```

This contract is intentionally plain JSON (no SDK-specific framing) so non-JS clients — a Go
backend event, a mobile app, a CLI tool — can POST batches directly. Server-side validation
(`validateBatch`) enforces: `appId` matches `^[a-z0-9_-]{1,32}$`; `sdkVersion` is a non-empty string
≤32 chars; `consentState` is one of `pending`/`accepted`/`declined`; `events` is a non-empty array
of ≤25 events; each event's `name` matches `^\$?[a-z0-9_]{1,64}$`; `props` is serialized to ≤4096
bytes of JSON. Anything that fails validation is silently dropped (still `202 Accepted` — never a
client-visible error). Server-side enrichment fills in `visitor_id` (daily hash) when cookieless,
plus `country` (from `x-vercel-ip-country`), `browser`/`os`/`device_type` (parsed from
`user-agent`), and clamps timestamps that skew more than 48h from server time.

## Querying

No dashboard ships with this package — query BigQuery directly against the views created by
`npm run setup:gcp`, or write your own SQL against the raw `events` table. Query templates for
common questions (funnels, retention, web vitals p75, error frequency, GDPR delete-by-visitor) live
in `sql/templates/` — copy, fill in the placeholders, and run with `bq query` or any BigQuery
client.

```bash
# Daily pageviews/visitors/sessions for one app, last 30 days
bq query --use_legacy_sql=false '
  SELECT * FROM `my-project.analytics.daily_stats`
  WHERE app_id = "my-app" AND day >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  ORDER BY day DESC'

# Longest sessions today
bq query --use_legacy_sql=false '
  SELECT session_id, visitor_id, duration_s, pageviews, entry_path, exit_path
  FROM `my-project.analytics.sessions`
  WHERE app_id = "my-app" AND DATE(started_at) = CURRENT_DATE()
  ORDER BY duration_s DESC LIMIT 20'
```

The three views:

- `identity_map` — visitor_id ↔ user_id links (from `$identify` events).
- `sessions` — one row per session: duration, pageview count, entry/exit path, referrer, country, device type, bounce flag.
- `daily_stats` — one row per app per day: pageviews, unique visitors, sessions, identified users.

You can also point a BigQuery MCP server at the same project/dataset for ad hoc querying from an
LLM chat session instead of the `bq` CLI.

## Event name rules

Event names starting with `$` are reserved for this package's automatic events — don't use a `$`
prefix for your own custom event names (`track()` accepts any name matching `^\$?[a-z0-9_]{1,64}$`,
but names you pass to `track()` should not start with `$`):

| Event | When |
| --- | --- |
| `$pageview` | emitted by `<PageviewTracker />` on each App Router navigation, or manually via `analytics.page()` |
| `$session_start` | first event of a new session (30-minute inactivity gap resets a session) |
| `$web_vital` | Core Web Vitals (CLS, LCP, INP), captured automatically unless `captureWebVitals: false` |
| `$error` | uncaught `window.onerror` / unhandled promise rejections, captured automatically unless `captureErrors: false` |
| `$identify` | emitted by `analytics.identify(userId)` |
| `$consent` | emitted whenever consent state changes (accept/decline) |

## License

MIT — see [LICENSE](./LICENSE).
