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

export const { GET, POST } = createAnalyticsHandler({ allowedAppIds: ["my-app"] });
```

`POST` receives the events. `GET` serves the optional [ignore link](#exclude-your-own-visits).
`allowedAppIds` drops batches for any other app id (exact match).

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

Use one `AnalyticsProvider` per page. The provider starts error and Web Vitals capture in an effect,
so errors thrown during the very first render or hydration are not captured. If you need those,
create the instance yourself with `createAnalytics()` and pass it as `instance`.

**3. Set the environment variables in Vercel, for Production only** (see [GCP setup](#gcp-setup)
for how to generate them):

```
ANALYTICS_GCP_CREDENTIALS={"type":"service_account","project_id":"...","client_email":"...","private_key":"...", ...}
ANALYTICS_DAILY_SALT=<random hex string, at least 16 characters>
ANALYTICS_IGNORE_KEY=<optional, random, at least 16 characters>
```

`ANALYTICS_GCP_CREDENTIALS` is the service account key JSON collapsed to one line.
`ANALYTICS_DAILY_SALT` seeds the cookieless daily visitor hash (see [Consent model](#consent-model)).
It must be at least 16 characters, otherwise the handler drops all events and logs an error. Keep it
secret and stable; rotating it changes cookieless visitor ids going forward.
`ANALYTICS_IGNORE_KEY` enables the [ignore link](#exclude-your-own-visits).

Without credentials the handler drops events and logs why, so `next dev` and Preview deployments send
nothing to your production table. Keep it that way: don't put the credentials into `.env.local` or the
Preview environment unless you want to test writes, and then point `datasetId` at a separate dataset.

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
npm run setup:gcp -- --query-quota-gib 100   # different daily query cap
npm run setup:gcp -- --no-query-quota        # leave the query quota alone
```

Requires the `gcloud` CLI authenticated twice (`gcloud auth login` for the service account steps and
`gcloud auth application-default login` for BigQuery) with permission to create BigQuery resources,
service accounts and quota preferences in the target project. The project needs billing enabled:
the BigQuery sandbox does not support the Storage Write API. The script is idempotent
— safe to re-run — and on each run it:

1. Creates the `analytics` BigQuery dataset (region `EU`) if missing.
2. Creates the `events` table (partitioned by day on `timestamp`, clustered on `app_id, event_name`)
   if missing.
3. Applies the `identity_map`, `sessions`, and `daily_stats` views from `sql/views/`
   (`CREATE OR REPLACE`, so upgrades are safe).
4. Creates a `rt-analytics-writer` service account, scoped to **WRITER** access on just the
   `analytics` dataset (not project-wide `dataEditor`).
5. Sets the project's BigQuery **query usage per day** quota to 30 GiB (about 0.9 TiB a month, inside
   the 1 TiB free tier). BigQuery rejects queries over the quota, so query costs can't run away. The
   quota counts every query in the project, not only analytics queries.
6. Creates a key for that service account (`key.json`, gitignored) if one doesn't already exist
   locally, and generates a random `ANALYTICS_DAILY_SALT` and `ANALYTICS_IGNORE_KEY`.

At the end it prints the env var values to your terminal. Paste them into your Vercel project's
environment variables (Project Settings → Environment Variables) for **Production only**, then
redeploy (env vars only apply to new deployments).

## Exclude your own visits

Set `ANALYTICS_IGNORE_KEY` (at least 16 characters) and redeploy. Then open this link once in each
browser you use:

    https://your-site.example/api/a?ignore=<ANALYTICS_IGNORE_KEY>

Use letters and digits for the key (the key from `npm run setup:gcp` is hex). If you pick a key with
other characters, URL-encode it in the link: a raw `+` becomes a space, and `&` or `#` cut the key off,
so the link would answer `404`.

It sets an HttpOnly cookie `rta_ignore=1`, valid for 400 days and limited to the path `/api/a`, so
it is never sent with normal page requests. The handler drops every batch that carries it, answers
with the header `x-rta: ignored` (check the `/api/a` requests in your browser's DevTools), and
refreshes the cookie, so it does not expire while you use the site. Reopening the link shows
"already excluded". To undo, use the link on that page (`?ignore=<key>&undo=1`). A wrong or missing
key gets a plain `404`. Batches with the cookie are dropped even if you later remove or rotate the key.

Notes:
- Each browser keeps its own cookies. On iOS, Safari, Chrome, Home Screen web apps and in-app
  browsers are all separate, so open the link in each one you use.
- The link only works when the client posts to the route's real path. If you rewrite a public path
  to the ingest route, the cookie path will not match.
- Safari does not keep `Secure` cookies on `http://localhost`. That doesn't matter in practice,
  because local development sends nothing without credentials.

## Rate limiting

The handler does not rate-limit; an in-memory limiter doesn't work across Vercel function instances.
Add one Vercel WAF rate-limit rule per project instead (Project → Firewall → New Rule):

- If: request path equals `/api/a`
- Then: Rate Limit, fixed window, 60 seconds, 120 requests, key: IP, action: default (429)

An active tab sends at most about 12 requests per minute (a flush every 5 seconds plus a beacon on
page hide), so 120 leaves room for several people behind one IP. The Hobby plan includes one
rate-limit rule per project and 1,000,000 allowed requests. The client never retries, so a `429`
only loses that batch.

`allowedAppIds` stops junk from other sites and typos, not a determined attacker: requests without
an `Origin` header pass the origin check and can send an allowed app id. The WAF rule limits volume.

## Consent model

| Consent state | Storage | Visitor identity | Banner needed? |
| --- | --- | --- | --- |
| `pending` (default, before any choice) | none — nothing written to any storage | server-computed daily-rotating hash of `salt + IP + user-agent + appId` | no — no device storage happens |
| `declined` | `localStorage`: consent decision only (`rta_consent=declined`); no visitor id | same daily-rotating hash as `pending` | no |
| `accepted` | `localStorage`: consent decision (`rta_consent=accepted`) plus a persistent visitor id (`rta_vid`) | random UUID, persists indefinitely across visits | banner is what triggered this state |

The `pending` state — before any explicit choice — writes nothing to the browser at all: no
cookie, no `localStorage`, no fingerprinting beyond a hash that intentionally rotates every day
server-side, so the same visitor cannot be tracked across days. Declining does persist one thing
to `localStorage`: the consent decision itself (`rta_consent=declined`), purely so the banner
doesn't reappear on every page load. No visitor-identifying data is written when declining — the
visitor id stays `null` and the server falls back to the same rotating daily hash used for
`pending`. Because no visitor-identifying data is ever stored on the device in either `pending` or
`declined`, this mode is generally understood to fall outside the German TTDSG's / GDPR's
consent-required "storage of information" trigger, so showing `<ConsentBanner />` is optional
there — it exists only to offer **better** (persistent, cross-visit) analytics in exchange for
opt-in, not to gate tracking itself. If you don't need cross-visit retention, you can drop
`<ConsentBanner />` entirely and everyone stays in cookieless mode.

Accepting persists a random id in `localStorage` so returning visits are recognized; declining (or
never deciding) keeps every visit anonymous and unlinkable day-to-day.

**Fully cookieless mode.** Pass `cookieless: true` (to `createAnalytics` or the provider) and the SDK
never touches `localStorage` or `sessionStorage`. Consent stays `pending`, `acceptConsent()` and
`declineConsent()` do nothing, there is no persistent visitor id, and the session lives in memory.
Don't combine it with `<ConsentBanner />`.

**Storage errors.** If storage is blocked or full, the SDK keeps working: reads return nothing and
failed writes are kept in memory for the current page.

**The one cookie.** The only cookie this package ever sets is `rta_ignore`, and only in the browser
of someone who opens the secret [ignore link](#exclude-your-own-visits) on purpose (the site owner).
Visitors never get it.

## API reference

### `rt-analytics` (core)

- `createAnalytics<E extends EventMap>(config: AnalyticsConfig, deps?: AnalyticsDeps): Analytics<E>`
  Framework-agnostic client factory. No-ops on the server unless a `transport` dep is supplied.
  - `AnalyticsConfig`: `{ appId: string; endpoint?: string /* default "/api/a" */; flushIntervalMs?: number /* default 5000 */; maxBatchSize?: number /* default 10 */; captureWebVitals?: boolean /* default true */; captureErrors?: boolean /* default true */; cookieless?: boolean /* default false */ }`
  - `AnalyticsDeps` (escape hatch for tests/advanced use): `{ localStorage?, sessionStorage?, transport?, now? }`
- `Analytics<E>` instance methods:
  - `track<K extends keyof E>(name: K, props: E[K]): void` — custom event; by convention, don't prefix your own event names with `$` — that prefix is reserved for the SDK's auto-captured events (see [Event name rules](#event-name-rules)).
  - `page(): void` — emit `$pageview` for the current path (normally called for you by `PageviewTracker`).
  - `identify(userId: string): void` — attach a user id to subsequent events and emit `$identify`.
  - `reset(): void` — clear the user id, visitor id, and session (call on logout).
  - `flush(useBeacon?: boolean): void` — force-send the current batch now; pass `true` to use `navigator.sendBeacon` (used automatically on tab hide).
  - `getConsent(): ConsentState`, `acceptConsent(): void`, `declineConsent(): void`, `onConsentChange(fn): () => void`
- `SDK_VERSION: string`
- Types: `Analytics`, `AnalyticsDeps`, `Transport`, `AnalyticsConfig`, `AnalyticsEvent`, `Batch`, `ConsentState`, `EventMap`

### `rt-analytics/react`

- `<AnalyticsProvider appId="..." endpoint?, flushIntervalMs?, maxBatchSize?, captureWebVitals?, captureErrors?, cookieless? />` or `<AnalyticsProvider instance={analytics} />` — provides one `Analytics` instance via context. Without `instance` it creates one from the config props and starts its automatic listeners in an effect. With `instance` (any `Analytics<E>`, typed events included) the config props are optional and ignored. Use one provider per page.
- `useAnalytics<E extends EventMap>(): Analytics<E>` — reads the instance from context; throws if used outside `<AnalyticsProvider>`.
- `<ConsentBanner message? acceptLabel? declineLabel? className? />` — renders only while consent is `pending`; calls `acceptConsent()`/`declineConsent()`. All props optional with sensible defaults.

### `rt-analytics/next/client`

- `<PageviewTracker />` — client component; call `analytics.page()` once per App Router navigation (tracks `usePathname()` changes). Place inside `<AnalyticsProvider>`, once, near the root layout.

### `rt-analytics/next`

- `createAnalyticsHandler(options?: HandlerOptions): { GET: (req: Request) => Promise<Response>; POST: (req: Request) => Promise<Response> }` — drop into `app/api/a/route.ts` as `export const { GET, POST } = ...`.
  - `HandlerOptions`: `{ datasetId?: string /* default "analytics" */; tableId?: string /* default "events" */; maxBodyBytes?: number /* default 50000 */; salt?: string /* default process.env.ANALYTICS_DAILY_SALT, at least 16 characters */; allowedAppIds?: string[] /* exact match; unset accepts any app id and warns once */; ignoreKey?: string /* default process.env.ANALYTICS_IGNORE_KEY, at least 16 characters */; writer?: RowWriter /* inject a custom writer, e.g. for tests */; now?: () => Date }`
  - Reads GCP credentials from `process.env.ANALYTICS_GCP_CREDENTIALS` (one-line service-account JSON) unless a `writer` is injected. Checks credentials first, then the salt; the salt rule also applies with an injected writer.
  - `GET` serves the [ignore link](#exclude-your-own-visits) and answers `200` or `404`.
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
| `$consent` | emitted whenever consent state changes (accept/decline); never in `cookieless` mode |

## Using with Jest

The package is ESM-only. Jest's resolver finds it through the `default` export condition, but Jest
still has to transform it:

```js
transformIgnorePatterns: ["/node_modules/(?!rt-analytics/)"],
```

## Migrating from 0.1.0

- **Salt:** `ANALYTICS_DAILY_SALT` (or `salt`) must now be at least 16 characters, otherwise all
  events are dropped. This also applies to tests that inject a `writer`. `npm run setup:gcp`
  generates 32 characters.
- **Route:** export `GET` too (`export const { GET, POST } = createAnalyticsHandler(...)`) to use the
  ignore link. `export const { POST }` keeps working.
- **Provider props** are now a union type, so `interface X extends AnalyticsProviderProps` no longer
  compiles. Use a type intersection instead. Passing a typed `instance` no longer needs a cast or
  `appId`.
- **Null storages:** replace `createAnalytics(config, { localStorage: null, sessionStorage: null })`
  with `createAnalytics({ ...config, cookieless: true })`.
- **Jest:** the `moduleNameMapper` entries for `rt-analytics` can go.
- **Env vars:** set them for Production only (see Quickstart step 3).

## Releasing

Releases are published from GitHub Actions with npm trusted publishing (no npm token). Bump the
version in `package.json`, `package-lock.json` and `src/core/version.ts`, add a `CHANGELOG.md`
entry, commit, then push a matching tag:

```bash
git tag v0.2.0 && git push origin main v0.2.0
```

`.github/workflows/release.yml` checks that the tag matches the version, runs tests and typecheck,
publishes to npm and creates a GitHub release.

## License

MIT — see [LICENSE](./LICENSE).
