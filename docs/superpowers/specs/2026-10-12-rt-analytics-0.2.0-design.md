# rt-analytics 0.2.0 — Design

**Date:** 2026-10-12
**Status:** Approved in chat; reviewed by a fresh agent, findings worked in; pending Robin's review
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
- The first statement of GET reads `new URL(req.url)`. With Next.js Cache Components (and the static detection in Next 14), a GET handler that returns before touching the request can be prerendered at build time, which would bake in a 404. A code comment says why.
- The whole GET body is in try/catch; any error → `404`.
- HTML responses carry `Content-Type: text/html; charset=utf-8` and `<meta name="referrer" content="no-referrer">`. All GET responses carry `Cache-Control: no-store`, `Referrer-Policy: no-referrer` (the key is in the URL; links on the page must not leak it) and `X-Robots-Tag: noindex`. The meta tag covers consumers whose `next.config` sets a different `Referrer-Policy` header for all paths (dwd does).
- Key comparison: hash both the given value and the key with SHA-256 and compare the digests with `crypto.timingSafeEqual`. Same length always, so it cannot throw on non-ASCII input, and it does not leak the key length.

`Path` is the request's own pathname (normally `/api/a`), so the cookie is only sent to the ingest route and never to normal page requests. Known limit: if a consumer rewrites a public path (e.g. `/stats`) to the ingest route, `req.url` may show the rewritten path, and then the cookie path would not match the URL the browser posts to. The README says the ignore link only works when the client posts to the route's real path.

**POST**
- Parse the `Cookie` header exactly: split on `;`, trim each part, and match name `rta_ignore` with value `1`. (A substring check would also match `xrta_ignore=1` or `rta_ignore=10`.)
- If it matches, respond `202`, drop the batch, and send the same `Set-Cookie` again with a fresh `Max-Age`. Without that refresh the cookie would expire silently after 400 days and own visits would be counted again. This check runs before the body is read.
- The dropped response also carries the header `x-rta: ignored`, so the owner can check in DevTools (Network tab, `/api/a` requests) that a browser is excluded. No other response gets this header. It only tells the person who holds the cookie something they already know.
- Whether browsers store a `Set-Cookie` from a `sendBeacon` response is not certain. It only affects the refresh, and the regular 5-second flushes use `fetch`, which does store it. Check during implementation and note the result in the README if it matters.
- `fetch` (default `credentials: "same-origin"`) and `navigator.sendBeacon` both send same-origin cookies, so the client SDK does not change.

### Configuration

- `HandlerOptions.ignoreKey?: string`, default `process.env.ANALYTICS_IGNORE_KEY`.
- Minimum length 16 characters. An unset key silently disables the feature. A key that is set but shorter than 16 characters also disables it, and the route logs one error per instance on the first GET.
- `npm run setup:gcp` prints a generated key (`randomBytes(16).toString("hex")`) next to the salt.

### Why the cookie value is `1` and not the key

A leaked cookie must not leak the key. Anyone who forges the cookie only hides their own visits, which is harmless. The key only stops other sites from silently excluding visitors through a hidden request to the GET URL.

### Privacy

Normal visitors get nothing stored. Only someone who opens the secret link gets the cookie, on purpose, which falls under §25(2) Nr. 2 TDDDG. The dwd privacy text stays correct. The README consent table names `rta_ignore` as the one opt-in exception to "no cookie".

### Own traffic from dev and preview

The bigger source of own traffic is not the browser but configuration: README lines 48 and 109–111 tell users to set the credentials for Production, Preview and Development and in `.env.local`. That sends `next dev` and preview traffic into the production table. The README changes to "Production only" and explains that without credentials the handler drops events, so local and preview builds send nothing. dwd already does it this way. No code change.

## 2. Harden the ingest route

### 2.1 `allowedAppIds`

- `HandlerOptions.allowedAppIds?: string[]`.
- When set, a batch whose `appId` is not in the list is dropped (`202`).
- When not set, every valid `appId` is accepted as in 0.1.0, and the route logs one warning per instance ("rt-analytics: allowedAppIds is not set; accepting any appId").
- An empty array drops everything. That is the caller's explicit choice.
- Honest scope, stated in the README: this stops junk from other sites and typos, not a determined attacker. Requests without an `Origin` header pass the origin check (`handler.ts:26`) and can send an allowed appId. The WAF rule (2.3) limits volume.

### 2.2 Salt is required

- The salt (`HandlerOptions.salt` or `ANALYTICS_DAILY_SALT`) must be at least 16 characters.
- Otherwise the route drops every batch (`202`) and logs one error per instance. That matches how missing credentials are handled (no events written).
- Reason: without a salt the daily visitor ID is a plain SHA-256 of IP + user agent + date + appId, which can be brute-forced back to the IP.
- This is the main breaking change (the other one is the provider props type, see 3.1). `setup:gcp` already generates a 32-character salt, and dwd uses one.
- The rule applies when a `writer` is injected too. Consumer tests that inject a writer need a 16+ character salt; the README migration note says so.
- Own checks to update: `src/next/handler.test.ts` (uses `salt: "s"`), `claude-tmp-helpers/smoke-handler.ts` (no salt), plus new tests for short and missing salt.

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
- When `instance` is given, the config props (`appId` and so on) are not required and are ignored. Passing both stays legal (dwd does that today).
- When `instance` is not given, `appId` is required as before.
- If the props become a union type, an `interface X extends AnalyticsProviderProps` in consumer code no longer compiles. Acceptable for 0.x; noted in the README migration section. The implementation narrows on `props.instance` before reading the rest.
- Covered by a type-level test (a `.test-d.ts` or `@ts-expect-error` cases checked by `npm run typecheck`): typed instance accepted without `appId`; no instance and no `appId` is an error.

### 3.2 `cookieless` config flag

- `AnalyticsConfig.cookieless?: boolean`, default `false`.
- When `true`, the SDK never touches `localStorage` or `sessionStorage`, whatever `deps` says. Consent stays `"pending"`, there is no persistent visitor ID, and the session lives in memory.
- `acceptConsent()` and `declineConsent()` are no-ops: no listener call, no `$consent` event. Otherwise the data would contain `$consent {state: "accepted"}` inside a batch whose `consentState` is `"pending"`. The README says not to combine `cookieless` with `<ConsentBanner>`.
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
- Effect: Jest's CommonJS resolver finds the files, so consumers can drop `moduleNameMapper`. They still need `transformIgnorePatterns` for ESM. Node ≥ 22.12 can `require()` ESM without a flag (the package has no top-level await).

### 3.5 One pageview under React StrictMode

- `PageviewTracker` keeps the last tracked pathname in a `useRef` and skips `page()` when it has not changed. StrictMode keeps refs across its simulated remount, so dev sends one pageview instead of two.
- Test: render inside `<StrictMode>`, assert `page()` was called once; change the pathname, assert twice.

### 3.6 One instance worth of listeners under React StrictMode

Problem: `AnalyticsProvider` does `useState(() => createAnalytics(config))`. StrictMode calls that initializer twice in dev. `createAnalytics` attaches the `visibilitychange`, error and Web Vitals listeners right away, so the thrown-away instance keeps its listeners and `$error` / `$web_vital` events are sent twice in dev. Consumers that pass their own `instance` (dwd) are not affected.

Fix:
- Move the listener setup in `createAnalytics` into an internal `start()` that runs at most once per instance.
- `createAnalytics()` called directly starts at once, as today. No change for direct users.
- The provider creates its instance without starting it (an internal, undocumented flag, e.g. `deps.autoStart = false` marked `@internal`) and calls `start()` in a mount effect. A discarded StrictMode instance never mounts, so it never attaches listeners. StrictMode's second mount effect hits the "at most once" guard. No cleanup on unmount: the instance lives as long as the page.
- Test: render the provider inside `<StrictMode>` without `instance`, throw one window error, assert exactly one `$error` event reaches the transport.

## Release

- `SDK_VERSION` and `package.json` version → `0.2.0`.
- README: GET export and the ignore link (incl. rewrite note, and that Safari does not keep `Secure` cookies on `http://localhost`), `ignoreKey` / `ANALYTICS_IGNORE_KEY`, `allowedAppIds` and its limits, salt requirement, credentials in Production only, WAF rule, `cookieless`, typed `instance`, `rta_ignore` in the consent table, Jest note, and a "Migrating from 0.1.0" section (salt rule, `GET` export, provider props union).
- Example app: `export const { GET, POST }`, `allowedAppIds: ["example"]`.
- Verification before publishing: `npm test`, `npm run typecheck`, `npm run build`, and the three smoke helpers in `claude-tmp-helpers/` (see memory `upgrade-smoke-helpers`). `smoke-example.sh` gets a GET check (404 without key).
- New `CHANGELOG.md` (Keep a Changelog format) with entries for 0.1.0 (initial release, 2026-10-12) and 0.2.0, including the migration notes.
- Git tags: `v0.2.0` on the release commit, and `v0.1.0` added afterwards on the commit that was published as 0.1.0 (identify it by the `package.json` version bump / publish prep commit `de55f6a` or later, check before tagging). Push tags with Robin's OK.
- Robin publishes from his own terminal (npm 2FA).

## Rollout to wetter-in-kalender (after publish)

Code changes in `dwd-wetter-in-calendar`, as one PR:
- Bump `rt-analytics` to `^0.2.0`.
- `src/app/api/a/route.ts`: `export const { GET, POST } = createAnalyticsHandler({ allowedAppIds: ["wetter-in-kalender"] })`.
- `src/lib/analytics.ts`: `createAnalytics<Events>({ appId, cookieless: true })`.
- `src/components/Analytics.tsx`: drop the cast and the redundant `appId`.
- `jest.config.ts`: drop the two `rt-analytics` `moduleNameMapper` lines.

Production changes, each one confirmed with Robin first:
1. Add `ANALYTICS_IGNORE_KEY` (secret type) to Vercel Production, then redeploy (env vars only apply to new deployments).
2. Add the WAF rate-limit rule to the dwd Vercel project.
3. Robin opens the ignore link once in each real browser app on each device (Mac, Windows, iPhone). On iOS, Chrome and Safari keep separate cookies, and so do Home Screen web apps and in-app browsers.
4. Robin checks on each browser that `/api/a` responses show `x-rta: ignored` (on the iPhone: no new rows appear while browsing). That moment is the cutoff.
5. Fresh start (Robin's decision on 2026-10-12): delete **all** rows with `app_id = 'wetter-in-kalender'` and `timestamp` before the cutoff from `robin-thues.analytics.events`. The data up to then mixes our own tests, Robin's visits and a few real ones, and is less than a day or two old, so it is not worth keeping. Steps: run a `SELECT COUNT(*)` with the same `WHERE` first and show it to Robin, then the `DELETE`. Wait at least 30 minutes after the cutoff, because BigQuery refuses DML on rows that the Storage Write API wrote very recently. The table is partitioned by `DATE(timestamp)`, so the delete only scans the affected days. The views read from the table, so they need no change.

## Open points for implementation

- Pick the exact provider prop typing (discriminated union or overloads). The requirement is 3.1; the shape is up to the implementation.
