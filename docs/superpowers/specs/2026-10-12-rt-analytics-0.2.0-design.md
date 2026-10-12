# rt-analytics 0.2.0 — Design

**Date:** 2026-10-12
**Status:** Approved in chat, pending spec review
**Builds on:** [2026-07-11-rt-analytics-design.md](2026-07-11-rt-analytics-design.md)

## Goal

Protect data quality and the public ingest route from day one, and remove the workarounds that the first real consumer (wetter-in-kalender.de, repo `dwd-wetter-in-calendar`) needed with 0.1.0.

Three parts, one release:

1. Exclude the owner's own traffic.
2. Harden the public ingest route.
3. Package polish found during the dwd integration.

## Non-goals

- A client-side "don't send" check for excluded browsers. The server-side drop is enough; the owner's few requests cost nothing.
- Rate limiting inside the package. An in-memory limiter does not work across Vercel function instances, and a shared store would cost money. Vercel WAF does this at the edge (see 2.3).
- A CommonJS build. A second copy of the package would also mean a second React context (dual-package hazard).
- IP-based exclusion of own traffic. German ISPs rotate IPs daily.
- Anything from the later follow-up list (dashboard, retention, standard stack).

## 1. Exclude own traffic

### Behavior

`createAnalyticsHandler()` returns `{ GET, POST }` (was `{ POST }`). Consumers export both from their route file:

```ts
export const { GET, POST } = createAnalyticsHandler();
```

**GET `<endpoint>?ignore=<key>`**
- Key matches → respond `200` with a small HTML page ("This browser is now excluded from analytics for this site", plus an undo link) and set the cookie:
  `rta_ignore=1; Path=<request pathname>; Max-Age=34560000; HttpOnly; Secure; SameSite=Lax`
  (34,560,000 s = 400 days, the maximum Chrome accepts.)
- **GET `<endpoint>?ignore=<key>&undo=1`** with a matching key → `200` with a confirmation page and the same cookie with `Max-Age=0`.
- No key configured, key too short, missing `ignore` param or wrong key → `404`, empty body. The route does not reveal whether the feature is configured.
- All GET responses carry `Cache-Control: no-store`, `Referrer-Policy: no-referrer` (the key is in the URL; links on the page must not leak it) and `X-Robots-Tag: noindex`.
- Key comparison is constant-time (`crypto.timingSafeEqual` on equal-length buffers; length mismatch → no match).

`Path` is the request's own pathname (normally `/api/a`), so the cookie is only sent to the ingest route and never to normal page requests.

**POST**
- If the request's `Cookie` header contains `rta_ignore=1`, respond `202` and drop the batch. This check runs before the body is read.
- `fetch` (default `credentials: "same-origin"`) and `navigator.sendBeacon` both send same-origin cookies, so the client SDK does not change.

### Configuration

- `HandlerOptions.ignoreKey?: string`, default `process.env.ANALYTICS_IGNORE_KEY`.
- Minimum length 16 characters. A shorter key counts as not configured, and the route logs one error per instance on the first GET.
- `npm run setup:gcp` prints a generated key (`randomBytes(16).toString("hex")`) next to the salt.

### Why the cookie value is `1` and not the key

A leaked cookie must not leak the key. Anyone who forges the cookie only hides their own visits, which is harmless. The key only stops other sites from silently excluding visitors through a hidden request to the GET URL.

### Privacy

Normal visitors get nothing stored. Only someone who opens the secret link gets the cookie. The dwd privacy text stays correct.

## 2. Harden the ingest route

### 2.1 `allowedAppIds`

- `HandlerOptions.allowedAppIds?: string[]`.
- When set, a batch whose `appId` is not in the list is dropped (`202`).
- When not set, every valid `appId` is accepted as in 0.1.0, and the route logs one warning per instance ("rt-analytics: allowedAppIds is not set; accepting any appId").
- An empty array drops everything. That is the caller's explicit choice.

### 2.2 Salt is required

- The salt (`HandlerOptions.salt` or `ANALYTICS_DAILY_SALT`) must be at least 16 characters.
- Otherwise the route drops every batch (`202`) and logs one error per instance. That matches how missing credentials are handled (no events written).
- Reason: without a salt the daily visitor ID is a plain SHA-256 of IP + user agent + date + appId, which can be brute-forced back to the IP.
- This is the only breaking change. `setup:gcp` already generates a 32-character salt, and dwd uses one.

### 2.3 Rate limiting via Vercel WAF (documentation + dwd rollout)

No code. The README documents one WAF rate-limit rule per consumer project:

- Condition: request path equals the ingest path (`/api/a`).
- Fixed window, 60 s, 120 requests, key: IP. Action: default (429).
- Sizing: an active tab flushes every 5 s plus a beacon on page hide, so about 12 requests per minute. 120 leaves room for several people behind one IP (NAT, office).
- Hobby plan: 1 rate-limit rule per project, 1,000,000 allowed requests included (checked in the Vercel docs on 2026-10-12).

The client treats a 429 like any other failed send: `fetchTransport` is fire-and-forget (`.catch(() => {})`, no retry), so the batch is lost and nothing loops (checked in `src/core/queue.ts`).

## 3. Package polish

### 3.1 Typed instances in `AnalyticsProvider`

- `AnalyticsProvider` accepts `instance: Analytics<E>` for any `E extends EventMap`, without a cast.
- When `instance` is given, the config props (`appId` and so on) are not required and are ignored.
- When `instance` is not given, `appId` is required as before.
- Covered by a type-level test (a `.test-d.ts` or `@ts-expect-error` cases checked by `npm run typecheck`): typed instance accepted without `appId`; no instance and no `appId` is an error.

### 3.2 `cookieless` config flag

- `AnalyticsConfig.cookieless?: boolean`, default `false`.
- When `true`, the SDK never touches `localStorage` or `sessionStorage`, whatever `deps` says. Consent stays `"pending"`, there is no persistent visitor ID, and the session lives in memory.
- `acceptConsent()` / `declineConsent()` still notify listeners and emit `$consent`, but `getConsent()` stays `"pending"` (same as 0.1.0 with null storages). The README says not to combine `cookieless` with `<ConsentBanner>`.
- Replaces the dwd setup `createAnalytics(config, { localStorage: null, sessionStorage: null })`. The `deps` storages keep working for tests.

### 3.3 Storage that never throws

- A small `safeStorage` wrapper in `src/core/`:
  - Reading `window.localStorage` / `window.sessionStorage` can throw (Safari with blocked site data, sandboxed iframes). That access is wrapped; on error the SDK uses no storage.
  - `getItem`, `setItem` and `removeItem` are each wrapped. On error, `getItem` returns `null` and writes are ignored (quota full, private mode).
- `ConsentManager`, `VisitorManager` and `SessionManager` get the wrapped storage, so their code does not change.
- Unit tests with a storage whose methods throw, and with a throwing `window.localStorage` getter.

### 3.4 `"default"` export condition

- Every entry in `exports` gets `"default"` after `"import"`, pointing to the same ESM file:
  `{ "types": "...", "import": "./dist/x.js", "default": "./dist/x.js" }`
- Effect: Jest's CommonJS resolver finds the files, so consumers can drop `moduleNameMapper`. They still need `transformIgnorePatterns` for ESM. Node ≥ 22 can `require()` ESM directly.

### 3.5 One pageview under React StrictMode

- `PageviewTracker` keeps the last tracked pathname in a `useRef` and skips `page()` when it has not changed. StrictMode keeps refs across its simulated remount, so dev sends one pageview instead of two.
- Test: render inside `<StrictMode>`, assert `page()` was called once; change the pathname, assert twice.

## Release

- `SDK_VERSION` and `package.json` version → `0.2.0`.
- README: GET export and the ignore link, `ignoreKey` / `ANALYTICS_IGNORE_KEY`, `allowedAppIds`, salt requirement, WAF rule, `cookieless`, typed `instance`, Jest note.
- Example app: `export const { GET, POST }`, `allowedAppIds: ["example"]`.
- Verification before publishing: `npm test`, `npm run typecheck`, `npm run build`, and the three smoke helpers in `claude-tmp-helpers/` (see memory `upgrade-smoke-helpers`). `smoke-example.sh` gets a GET check (404 without key).
- Robin publishes from his own terminal (npm 2FA).

## Rollout to wetter-in-kalender (after publish)

Code changes in `dwd-wetter-in-calendar`, as one PR:
- Bump `rt-analytics` to `^0.2.0`.
- `src/app/api/a/route.ts`: `export const { GET, POST } = createAnalyticsHandler({ allowedAppIds: ["wetter-in-kalender"] })`.
- `src/lib/analytics.ts`: `createAnalytics<Events>({ appId, cookieless: true })`.
- `src/components/Analytics.tsx`: drop the cast and the redundant `appId`.
- `jest.config.ts`: drop the two `rt-analytics` `moduleNameMapper` lines.

Production changes, each one confirmed with Robin first:
1. Add `ANALYTICS_IGNORE_KEY` (secret type) to Vercel Production.
2. Add the WAF rate-limit rule to the dwd Vercel project.
3. Robin opens the ignore link once on each device and browser (Mac, Windows, iPhone).
4. Delete the 5 test rows from 2026-10-12 19:59 UTC in `robin-thues.analytics.events`.

## Open points for implementation

- Pick the exact provider prop typing (discriminated union or overloads). The requirement is 3.1; the shape is up to the implementation.
