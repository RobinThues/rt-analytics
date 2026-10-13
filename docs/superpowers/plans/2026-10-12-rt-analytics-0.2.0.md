# rt-analytics 0.2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship rt-analytics 0.2.0: an owner ignore link (cookie) that drops own traffic, a hardened ingest route (`allowedAppIds`, required salt), and the package polish found in the first integration, then roll it out to wetter-in-kalender.de.

**Architecture:** Server changes live in `src/next/handler.ts` plus a new focused helper `src/next/ignore.ts` (cookie parsing, key compare, HTML page). Client changes live in `src/core/` (new `safe-storage.ts`, `cookieless` flag, a start/stop lifecycle for the automatic listeners in `analytics.ts`) and `src/react/provider.tsx` / `src/next/client/pageview-tracker.tsx`. Packaging, docs and release follow. Tasks 12–15 happen outside this repo or need Robin's hands and are gated on his OK.

**Tech Stack:** TypeScript 7, Vitest 5 (+ happy-dom 21, Testing Library), React 19, Next.js 16 route handlers, tsdown, Node ≥ 22, BigQuery Storage Write API (gRPC, `_default` stream).

**Spec:** `docs/superpowers/specs/2026-10-12-rt-analytics-0.2.0-design.md`

## Global Constraints

- Node `>=22` (engines unchanged). `require(esm)` claim only for Node ≥ 22.12.
- Package stays ESM-only. No CJS build. Exports get `"default"` after `"import"`, same file.
- Minimum length for the salt and the ignore key: **16 characters**.
- Ignore cookie exactly: `rta_ignore=1; Path=<request pathname>; Max-Age=34560000; HttpOnly; Secure; SameSite=Lax` (undo: `Max-Age=0`).
- Every GET response: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`. HTML pages also `Content-Type: text/html; charset=utf-8` and `<meta name="referrer" content="no-referrer">`.
- Dropped-because-ignored POST: `202`, header `x-rta: ignored`, cookie refreshed.
- Handler check order in POST: origin → ignore cookie → bot → body size → JSON → validate → `allowedAppIds` → writer/credentials → salt → rows → write.
- POST always answers `202` (unchanged contract). GET answers `200` or `404` only.
- `createAnalyticsUnstarted` is internal: never exported from `src/index.ts`, `src/react/index.ts` or any other entry.
- Code comments follow the repo style: few, short, explain *why*.
- Commits: no Claude attribution or `Co-Authored-By` trailers (Robin's global rule). Never commit `.env*`, `key.json` or `claude-tmp-helpers/` (gitignored; the repo is public).
- Version: `0.2.0` in `package.json`, `package-lock.json` and `src/core/version.ts`.

## Review Focus

1. **Ignore key with URL/HTML special characters** (`&`, `"`, `<`, `+`, space): the link must still match, and the undo link on the page must round-trip to the same key and be HTML-safe. Test in Task 3 (`ignore.test.ts` round-trip + handler GET with an encoded special key).
2. **Empty or repeated `ignore` parameter** (`?ignore=`, `?ignore=a&ignore=b`): must give `404`, never `500`. Test in Task 3.
3. **Storage where only writes fail** (quota full): sessions must keep working for the page instead of starting a new session on every event. `safeStorage` keeps failed writes in memory. Test in Task 4 (unit + one `createAnalytics` integration test counting `$session_start`).
4. **Server-side render of `<AnalyticsProvider appId>` without `instance`**: must not throw or touch `window`. Test in Task 7 (`provider.ssr.test.tsx` with `renderToString`).
5. **`allowedAppIds` case mismatch** (`["Wordle"]` vs batch `"wordle"`): exact match, so dropped. Test in Task 2; README states "exact match".

---

### Task 1: Require a salt and fix the handler check order

**Files:**
- Modify: `src/next/handler.ts` (whole file, see Step 3)
- Test: `src/next/handler.test.ts`
- Modify (gitignored, not committed): `claude-tmp-helpers/smoke-handler.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `HandlerOptions` unchanged in shape; internal `MIN_SECRET_LENGTH = 16` constant in `handler.ts`; internal helpers `resolveWriter(): RowWriter | null` and `resolveSalt(): string | null` inside `createAnalyticsHandler`. Task 2 and 3 build on this file.

- [ ] **Step 1: Update existing tests to a valid salt and add failing salt tests**

In `src/next/handler.test.ts`:

Change the import line to:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

Add below `const NOW = ...`:
```ts
const SALT = "test-salt-0123456789";
```

Replace the `beforeEach` block inside `describe("createAnalyticsHandler", ...)` with:
```ts
  beforeEach(() => {
    written = [];
    writer = { write: vi.fn(async (rows: EventRow[]) => void written.push(rows)) };
    handler = createAnalyticsHandler({ writer, salt: SALT, now: () => NOW });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
```

Replace the test `"returns 202 even when the writer throws"` with:
```ts
  it("returns 202 even when the writer throws", async () => {
    const write = vi.fn().mockRejectedValue(new Error("boom"));
    const failing = createAnalyticsHandler({ writer: { write }, salt: SALT, now: () => NOW });
    const res = await failing.POST(request(batchBody()));
    expect(res.status).toBe(202);
    expect(write).toHaveBeenCalledOnce();
  });

  it("drops events and logs once when the salt is shorter than 16 characters", async () => {
    const short = createAnalyticsHandler({ writer, salt: "short", now: () => NOW });
    await short.POST(request(batchBody()));
    const res = await short.POST(request(batchBody()));
    expect(res.status).toBe(202);
    expect(written).toHaveLength(0);
    const saltErrors = vi.mocked(console.error).mock.calls.filter((c) => String(c[0]).includes("ANALYTICS_DAILY_SALT"));
    expect(saltErrors).toHaveLength(1);
  });

  it("drops events when no salt is configured at all", async () => {
    vi.stubEnv("ANALYTICS_DAILY_SALT", "");
    const noSalt = createAnalyticsHandler({ writer, now: () => NOW });
    await noSalt.POST(request(batchBody()));
    expect(written).toHaveLength(0);
  });

  it("uses ANALYTICS_DAILY_SALT from the environment when long enough", async () => {
    vi.stubEnv("ANALYTICS_DAILY_SALT", SALT);
    const envSalt = createAnalyticsHandler({ writer, now: () => NOW });
    await envSalt.POST(request(batchBody()));
    expect(written).toHaveLength(1);
  });

  it("reports missing credentials before checking the salt", async () => {
    vi.stubEnv("ANALYTICS_GCP_CREDENTIALS", "");
    vi.stubEnv("ANALYTICS_DAILY_SALT", "");
    const bare = createAnalyticsHandler({ now: () => NOW });
    const res = await bare.POST(request(batchBody()));
    expect(res.status).toBe(202);
    const messages = vi.mocked(console.error).mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("ANALYTICS_GCP_CREDENTIALS is not set"))).toBe(true);
    expect(messages.some((m) => m.includes("ANALYTICS_DAILY_SALT"))).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to see the new ones fail**

Run: `npx vitest run src/next/handler.test.ts`
Expected: FAIL in "drops events and logs once when the salt is shorter…" and "drops events when no salt is configured at all" (rows are written today), and "reports missing credentials before checking the salt" may pass already. The rest pass.

- [ ] **Step 3: Rewrite `src/next/handler.ts`**

```ts
import { validateBatch } from "./validate.js";
import { dailyVisitorId, isBot, parseUserAgent } from "./enrich.js";
import { createBigQueryWriter, type EventRow, type RowWriter } from "./bigquery-writer.js";

export interface HandlerOptions {
  datasetId?: string;
  tableId?: string;
  maxBodyBytes?: number;
  /** At least 16 characters. Default process.env.ANALYTICS_DAILY_SALT */
  salt?: string;
  writer?: RowWriter;
  now?: () => Date;
}

const MAX_SKEW_MS = 48 * 60 * 60 * 1000;
/** Minimum length for the salt and the ignore key. */
const MIN_SECRET_LENGTH = 16;

function accepted(): Response {
  return new Response(null, { status: 202 });
}

export function createAnalyticsHandler(opts: HandlerOptions = {}) {
  let writer: RowWriter | null = opts.writer ?? null;
  let saltErrorLogged = false;

  function resolveWriter(): RowWriter | null {
    if (writer) return writer;
    const raw = process.env.ANALYTICS_GCP_CREDENTIALS;
    if (!raw) {
      console.error("rt-analytics: ANALYTICS_GCP_CREDENTIALS is not set; dropping events");
      return null;
    }
    const creds = JSON.parse(raw) as { project_id: string; client_email: string; private_key: string };
    writer = createBigQueryWriter({
      projectId: creds.project_id,
      datasetId: opts.datasetId ?? "analytics",
      tableId: opts.tableId ?? "events",
      credentials: { client_email: creds.client_email, private_key: creds.private_key },
    });
    return writer;
  }

  // Without a salt the daily visitor id is a plain hash of IP + user agent, which can be brute-forced back to the IP.
  function resolveSalt(): string | null {
    const salt = opts.salt ?? process.env.ANALYTICS_DAILY_SALT ?? "";
    if (salt.length >= MIN_SECRET_LENGTH) return salt;
    if (!saltErrorLogged) {
      saltErrorLogged = true;
      console.error(
        `rt-analytics: ANALYTICS_DAILY_SALT is missing or shorter than ${MIN_SECRET_LENGTH} characters; dropping events`,
      );
    }
    return null;
  }

  async function POST(req: Request): Promise<Response> {
    try {
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== new URL(req.url).host) return accepted();

      const ua = req.headers.get("user-agent");
      if (isBot(ua)) return accepted();

      const text = await req.text();
      if (Buffer.byteLength(text, "utf8") > (opts.maxBodyBytes ?? 50_000)) return accepted();

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return accepted();
      }
      const batch = validateBatch(parsed);
      if (!batch) return accepted();

      // Credentials before salt, so local and Preview logs keep naming the real reason.
      const target = resolveWriter();
      if (!target) return accepted();
      const salt = resolveSalt();
      if (!salt) return accepted();

      const now = opts.now ? opts.now() : new Date();
      const uaInfo = parseUserAgent(ua as string);
      const country = req.headers.get("x-vercel-ip-country");
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";

      const rows: EventRow[] = batch.events.map((e) => {
        const ts = new Date(e.ts);
        const skewed = Math.abs(ts.getTime() - now.getTime()) > MAX_SKEW_MS;
        return {
          event_id: e.eventId,
          app_id: batch.appId,
          event_name: e.name,
          timestamp: skewed ? now : ts,
          visitor_id: e.visitorId ?? dailyVisitorId(salt, ip, ua as string, batch.appId, now),
          session_id: e.sessionId,
          user_id: e.userId,
          page_path: e.pagePath || null,
          referrer: e.referrer,
          utm_source: e.utmSource,
          utm_medium: e.utmMedium,
          utm_campaign: e.utmCampaign,
          country,
          browser: uaInfo.browser,
          os: uaInfo.os,
          device_type: uaInfo.deviceType,
          viewport_w: e.viewportW,
          viewport_h: e.viewportH,
          props: Object.keys(e.props).length > 0 ? JSON.stringify(e.props) : null,
          consent_state: batch.consentState,
          sdk_version: batch.sdkVersion,
        };
      });

      await target.write(rows);
      return accepted();
    } catch (err) {
      console.error("rt-analytics ingest error:", err);
      return accepted();
    }
  }

  return { POST };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/next/handler.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Fix the gitignored smoke helper**

In `claude-tmp-helpers/smoke-handler.ts` change the handler line to:
```ts
const { POST } = createAnalyticsHandler({
  salt: "smoke-salt-0123456789",
  writer: { write: async (r) => void rows.push(...r) },
});
```
(Not committed; the folder is gitignored.)

- [ ] **Step 6: Commit**

```bash
git add src/next/handler.ts src/next/handler.test.ts
git commit -m "feat(next)!: require a salt of at least 16 characters; check credentials first"
```

---

### Task 2: `allowedAppIds`

**Files:**
- Modify: `src/next/handler.ts`
- Test: `src/next/handler.test.ts`

**Interfaces:**
- Consumes: Task 1's `handler.ts`.
- Produces: `HandlerOptions.allowedAppIds?: string[]`; internal `appIdAllowed(appId: string): boolean`.

- [ ] **Step 1: Write the failing tests**

Append inside `describe("createAnalyticsHandler", ...)` in `src/next/handler.test.ts`:
```ts
  describe("allowedAppIds", () => {
    const make = (allowedAppIds?: string[]) =>
      createAnalyticsHandler({ writer, salt: SALT, now: () => NOW, allowedAppIds });

    it("writes batches for an allowed appId", async () => {
      await make(["wordle"]).POST(request(batchBody()));
      expect(written).toHaveLength(1);
    });

    it("drops batches for any other appId", async () => {
      await make(["other-app"]).POST(request(batchBody()));
      expect(written).toHaveLength(0);
    });

    it("matches exactly, so a different case is dropped", async () => {
      await make(["Wordle"]).POST(request(batchBody()));
      expect(written).toHaveLength(0);
    });

    it("drops everything for an empty list", async () => {
      await make([]).POST(request(batchBody()));
      expect(written).toHaveLength(0);
    });

    it("accepts any appId when unset and warns once per instance", async () => {
      const open = make(undefined);
      await open.POST(request(batchBody()));
      await open.POST(request(batchBody()));
      expect(written).toHaveLength(2);
      const warnings = vi.mocked(console.warn).mock.calls.filter((c) => String(c[0]).includes("allowedAppIds"));
      expect(warnings).toHaveLength(1);
    });
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/next/handler.test.ts -t allowedAppIds`
Expected: FAIL (TypeScript-level unknown option is fine at runtime; "drops…" tests fail because rows are written, the warning test fails because nothing warns).

- [ ] **Step 3: Implement**

In `src/next/handler.ts`, add to `HandlerOptions` (after `salt`):
```ts
  /** Only these appIds are written (exact match). Unset: any valid appId, with a warning. */
  allowedAppIds?: string[];
```

Inside `createAnalyticsHandler`, below `let saltErrorLogged = false;`:
```ts
  let appIdWarningLogged = false;

  function appIdAllowed(appId: string): boolean {
    if (opts.allowedAppIds) return opts.allowedAppIds.includes(appId);
    if (!appIdWarningLogged) {
      appIdWarningLogged = true;
      console.warn("rt-analytics: allowedAppIds is not set; accepting any appId");
    }
    return true;
  }
```

In `POST`, directly after `if (!batch) return accepted();`:
```ts
      if (!appIdAllowed(batch.appId)) return accepted();
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/next/handler.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/next/handler.ts src/next/handler.test.ts
git commit -m "feat(next): allowedAppIds option for the ingest handler"
```

---

### Task 3: Owner ignore link (GET) and dropping ignored POSTs

**Files:**
- Create: `src/next/ignore.ts`
- Create: `src/next/ignore.test.ts`
- Modify: `src/next/handler.ts`
- Test: `src/next/handler.test.ts`

**Interfaces:**
- Consumes: Task 1–2 `handler.ts` (`MIN_SECRET_LENGTH`, `appIdAllowed`, `resolveWriter`, `resolveSalt`).
- Produces (in `src/next/ignore.ts`):
  - `IGNORE_COOKIE = "rta_ignore"`
  - `hasIgnoreCookie(cookieHeader: string | null): boolean`
  - `ignoreCookie(path: string, clear?: boolean): string`
  - `keyMatches(given: string, key: string): boolean`
  - `type IgnoreState = "excluded" | "already" | "included"`
  - `ignorePage(state: IgnoreState, key: string): string`
- Produces (handler): `HandlerOptions.ignoreKey?: string`; `createAnalyticsHandler()` returns `{ GET(req: Request): Promise<Response>; POST(req: Request): Promise<Response> }`.

- [ ] **Step 1: Write the failing helper tests**

Create `src/next/ignore.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { hasIgnoreCookie, ignoreCookie, ignorePage, keyMatches } from "./ignore.js";

describe("hasIgnoreCookie", () => {
  it("matches the exact cookie among others", () => {
    expect(hasIgnoreCookie("rta_ignore=1")).toBe(true);
    expect(hasIgnoreCookie("a=b; rta_ignore=1; c=d")).toBe(true);
    expect(hasIgnoreCookie("a=b;rta_ignore=1")).toBe(true);
  });

  it("does not match similar names or values", () => {
    expect(hasIgnoreCookie("xrta_ignore=1")).toBe(false);
    expect(hasIgnoreCookie("rta_ignore=10")).toBe(false);
    expect(hasIgnoreCookie("rta_ignore=0")).toBe(false);
    expect(hasIgnoreCookie("")).toBe(false);
    expect(hasIgnoreCookie(null)).toBe(false);
  });
});

describe("ignoreCookie", () => {
  it("sets a long-lived, path-scoped, HttpOnly cookie", () => {
    expect(ignoreCookie("/api/a")).toBe(
      "rta_ignore=1; Path=/api/a; Max-Age=34560000; HttpOnly; Secure; SameSite=Lax",
    );
  });

  it("clears it with Max-Age=0", () => {
    expect(ignoreCookie("/api/a", true)).toBe("rta_ignore=1; Path=/api/a; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
  });
});

describe("keyMatches", () => {
  const key = "ignore-key-0123456789";

  it("accepts the exact key and rejects others", () => {
    expect(keyMatches(key, key)).toBe(true);
    expect(keyMatches("ignore-key-0123456780", key)).toBe(false);
    expect(keyMatches("", key)).toBe(false);
  });

  it("does not throw on non-ASCII input of the same string length", () => {
    const sameLength = "ä".repeat(key.length);
    expect(() => keyMatches(sameLength, key)).not.toThrow();
    expect(keyMatches(sameLength, key)).toBe(false);
  });
});

describe("ignorePage", () => {
  const special = 'a b&c"d<e+f-0123456789';

  function linkFrom(html: string): URLSearchParams {
    const href = /<a href="([^"]*)"/.exec(html)![1]!.replaceAll("&amp;", "&");
    return new URLSearchParams(href.slice(1));
  }

  it("says excluded and links to undo with the same key", () => {
    const html = ignorePage("excluded", special);
    expect(html).toContain("now excluded");
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    const params = linkFrom(html);
    expect(params.get("ignore")).toBe(special);
    expect(params.get("undo")).toBe("1");
  });

  it("is HTML-safe for any key", () => {
    const html = ignorePage("excluded", special);
    expect(html).not.toContain('c"d<e');
  });

  it("says already excluded", () => {
    expect(ignorePage("already", special)).toContain("already excluded");
  });

  it("after undo, links to exclude again without undo", () => {
    const html = ignorePage("included", special);
    expect(html).toContain("counted in analytics again");
    const params = linkFrom(html);
    expect(params.get("ignore")).toBe(special);
    expect(params.has("undo")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/next/ignore.test.ts`
Expected: FAIL, "Failed to resolve import ./ignore.js".

- [ ] **Step 3: Create `src/next/ignore.ts`**

```ts
import { createHash, timingSafeEqual } from "node:crypto";

export const IGNORE_COOKIE = "rta_ignore";
/** 400 days, the maximum Chrome accepts. Refreshed on every ignored POST. */
const MAX_AGE_S = 34_560_000;

export type IgnoreState = "excluded" | "already" | "included";

export function hasIgnoreCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(";").some((part) => part.trim() === `${IGNORE_COOKIE}=1`);
}

export function ignoreCookie(path: string, clear = false): string {
  return `${IGNORE_COOKIE}=1; Path=${path}; Max-Age=${clear ? 0 : MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax`;
}

// Hashing first gives equal-length buffers (timingSafeEqual throws otherwise) and hides the key length.
export function keyMatches(given: string, key: string): boolean {
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(key, "utf8").digest();
  return timingSafeEqual(a, b);
}

const MESSAGES: Record<IgnoreState, string> = {
  excluded: "This browser is now excluded from analytics for this site.",
  already: "This browser was already excluded from analytics for this site.",
  included: "This browser is counted in analytics again.",
};

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

export function ignorePage(state: IgnoreState, key: string): string {
  const params = new URLSearchParams({ ignore: key });
  if (state !== "included") params.set("undo", "1");
  const label = state === "included" ? "Exclude this browser again" : "Undo";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>rt-analytics</title>
</head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 1rem">
<p>${MESSAGES[state]}</p>
<p><a href="${escapeHtml(`?${params.toString()}`)}">${label}</a></p>
</body>
</html>
`;
}
```

- [ ] **Step 4: Run the helper tests**

Run: `npx vitest run src/next/ignore.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing handler tests**

Append to `src/next/handler.test.ts` (top level, after the existing `describe`):
```ts
describe("ignore link", () => {
  const KEY = "ignore-key-0123456789";
  let written: EventRow[][];
  let writer: RowWriter;

  const get = (query: string, headers: Record<string, string> = {}) =>
    new Request(`https://wordle.example.com/api/a${query}`, { headers: { "user-agent": UA, ...headers } });

  const make = (ignoreKey?: string) => createAnalyticsHandler({ writer, salt: SALT, now: () => NOW, ignoreKey });

  beforeEach(() => {
    written = [];
    writer = { write: vi.fn(async (rows: EventRow[]) => void written.push(rows)) };
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("sets the cookie and shows the page for the right key", async () => {
    const res = await make(KEY).GET(get(`?ignore=${KEY}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBe(
      "rta_ignore=1; Path=/api/a; Max-Age=34560000; HttpOnly; Secure; SameSite=Lax",
    );
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(await res.text()).toContain("now excluded");
  });

  it("reads the key from ANALYTICS_IGNORE_KEY", async () => {
    vi.stubEnv("ANALYTICS_IGNORE_KEY", KEY);
    const res = await make().GET(get(`?ignore=${KEY}`));
    expect(res.status).toBe(200);
  });

  it("says already excluded when the cookie is present", async () => {
    const res = await make(KEY).GET(get(`?ignore=${KEY}`, { cookie: "rta_ignore=1" }));
    expect(await res.text()).toContain("already excluded");
  });

  it("clears the cookie on undo", async () => {
    const res = await make(KEY).GET(get(`?ignore=${KEY}&undo=1`, { cookie: "rta_ignore=1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await res.text()).toContain("counted in analytics again");
  });

  it("accepts a key with URL and HTML special characters", async () => {
    const special = 'a b&c"d<e+f-0123456789';
    const res = await make(special).GET(get(`?ignore=${encodeURIComponent(special)}`));
    expect(res.status).toBe(200);
  });

  it("answers 404 with an empty body for wrong, missing, empty, repeated or non-ASCII keys", async () => {
    const h = make(KEY);
    for (const query of ["", "?ignore=wrong", "?ignore=", `?ignore=wrong&ignore=${KEY}`, `?ignore=${encodeURIComponent("ä".repeat(KEY.length))}`]) {
      const res = await h.GET(get(query));
      expect(res.status, query).toBe(404);
      expect(res.headers.get("set-cookie")).toBeNull();
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.text()).toBe("");
    }
  });

  it("answers 404 when no key is configured", async () => {
    vi.stubEnv("ANALYTICS_IGNORE_KEY", "");
    const res = await make().GET(get("?ignore=anything-long-enough-123"));
    expect(res.status).toBe(404);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("answers 404 and logs once for a key shorter than 16 characters", async () => {
    const h = make("short");
    await h.GET(get("?ignore=short"));
    const res = await h.GET(get("?ignore=short"));
    expect(res.status).toBe(404);
    const keyErrors = vi.mocked(console.error).mock.calls.filter((c) => String(c[0]).includes("ANALYTICS_IGNORE_KEY"));
    expect(keyErrors).toHaveLength(1);
  });

  it("drops POSTs carrying the cookie, marks them and refreshes the cookie", async () => {
    const res = await make(KEY).POST(request(batchBody(), { cookie: "a=b; rta_ignore=1" }));
    expect(res.status).toBe(202);
    expect(res.headers.get("x-rta")).toBe("ignored");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=34560000");
    expect(written).toHaveLength(0);
  });

  it("drops POSTs carrying the cookie even when no key is configured", async () => {
    vi.stubEnv("ANALYTICS_IGNORE_KEY", "");
    await make().POST(request(batchBody(), { cookie: "rta_ignore=1" }));
    expect(written).toHaveLength(0);
  });

  it("writes POSTs with similar but different cookies, without the marker header", async () => {
    const res = await make(KEY).POST(request(batchBody(), { cookie: "xrta_ignore=1" }));
    expect(res.headers.get("x-rta")).toBeNull();
    expect(written).toHaveLength(1);
  });
});
```

Note: `request()`, `batchBody()`, `UA`, `NOW`, `SALT` are the module-level helpers already in this file.

- [ ] **Step 6: Run to see them fail**

Run: `npx vitest run src/next/handler.test.ts -t "ignore link"`
Expected: FAIL (`GET` is not a function; ignored POSTs are written).

- [ ] **Step 7: Implement in `src/next/handler.ts`**

Add the import:
```ts
import { hasIgnoreCookie, ignoreCookie, ignorePage, keyMatches, type IgnoreState } from "./ignore.js";
```

Add to `HandlerOptions` (after `allowedAppIds`):
```ts
  /** Secret for the owner's ignore link, at least 16 characters. Default process.env.ANALYTICS_IGNORE_KEY */
  ignoreKey?: string;
```

Add module-level, below `accepted()`:
```ts
const GET_HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" };

function notFound(): Response {
  return new Response(null, { status: 404, headers: GET_HEADERS });
}
```

Inside `createAnalyticsHandler`, below `appIdAllowed`:
```ts
  let keyErrorLogged = false;

  function resolveIgnoreKey(): string | null {
    const key = opts.ignoreKey ?? process.env.ANALYTICS_IGNORE_KEY ?? "";
    if (key.length >= MIN_SECRET_LENGTH) return key;
    if (key.length > 0 && !keyErrorLogged) {
      keyErrorLogged = true;
      console.error(
        `rt-analytics: ANALYTICS_IGNORE_KEY is shorter than ${MIN_SECRET_LENGTH} characters; the ignore link is disabled`,
      );
    }
    return null;
  }

  async function GET(req: Request): Promise<Response> {
    try {
      // Read the request first: with Cache Components (and Next 14's static detection) a GET handler
      // that returns before touching the request can be prerendered, which would bake in a 404.
      const url = new URL(req.url);
      const key = resolveIgnoreKey();
      const given = url.searchParams.getAll("ignore");
      if (!key || given.length !== 1 || !keyMatches(given[0]!, key)) return notFound();

      const undo = url.searchParams.get("undo") === "1";
      const state: IgnoreState = undo ? "included" : hasIgnoreCookie(req.headers.get("cookie")) ? "already" : "excluded";
      return new Response(ignorePage(state, key), {
        status: 200,
        headers: {
          ...GET_HEADERS,
          "content-type": "text/html; charset=utf-8",
          "set-cookie": ignoreCookie(url.pathname, undo),
        },
      });
    } catch (err) {
      console.error("rt-analytics ignore link error:", err);
      return notFound();
    }
  }
```

In `POST`, directly after the origin check line:
```ts
      // The owner's own browsers (see GET). Refresh the cookie so it never expires while in use.
      if (hasIgnoreCookie(req.headers.get("cookie"))) {
        return new Response(null, {
          status: 202,
          headers: { "x-rta": "ignored", "set-cookie": ignoreCookie(new URL(req.url).pathname) },
        });
      }
```

Change the return to:
```ts
  return { GET, POST };
```

- [ ] **Step 8: Run the handler and helper tests**

Run: `npx vitest run src/next`
Expected: PASS, all tests.

- [ ] **Step 9: Commit**

```bash
git add src/next/ignore.ts src/next/ignore.test.ts src/next/handler.ts src/next/handler.test.ts
git commit -m "feat(next): owner ignore link that drops own traffic via an rta_ignore cookie"
```

---

### Task 4: Storage that never throws

**Files:**
- Create: `src/core/safe-storage.ts`
- Create: `src/core/safe-storage.test.ts`
- Modify: `src/test-utils.ts`
- Modify: `src/core/analytics.ts` (storage lines only)
- Test: `src/core/analytics.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `safeStorage(get: () => Storage | null | undefined): Storage | null` in `src/core/safe-storage.ts`; test helpers `throwingStorage(): Storage` and `quotaFullStorage(): Storage` in `src/test-utils.ts`.

Refinement of spec 3.3 (Review Focus 3): a write that fails is kept in memory for the page, so a full quota does not start a new session on every event. Reads that fail return `null`.

- [ ] **Step 1: Add test helpers to `src/test-utils.ts`**

Append:
```ts
/** Every access throws, like Safari with blocked site data. */
export function throwingStorage(): Storage {
  const fail = (): never => {
    throw new DOMException("blocked", "SecurityError");
  };
  return {
    getItem: fail,
    setItem: fail,
    removeItem: fail,
    clear: fail,
    key: fail,
    get length() {
      return fail();
    },
  } as unknown as Storage;
}

/** Reads work, writes throw, like a full quota. */
export function quotaFullStorage(): Storage {
  const base = fakeStorage();
  return {
    ...base,
    getItem: base.getItem,
    removeItem: base.removeItem,
    setItem: () => {
      throw new DOMException("full", "QuotaExceededError");
    },
  } as Storage;
}
```

- [ ] **Step 2: Write the failing unit tests**

Create `src/core/safe-storage.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { safeStorage } from "./safe-storage.js";
import { fakeStorage, quotaFullStorage, throwingStorage } from "../test-utils.js";

describe("safeStorage", () => {
  it("returns null when reading the storage itself throws", () => {
    expect(
      safeStorage(() => {
        throw new DOMException("blocked", "SecurityError");
      }),
    ).toBeNull();
  });

  it("returns null for missing storage", () => {
    expect(safeStorage(() => null)).toBeNull();
    expect(safeStorage(() => undefined)).toBeNull();
  });

  it("passes through to a working storage", () => {
    const base = fakeStorage();
    const s = safeStorage(() => base)!;
    s.setItem("k", "v");
    expect(base.getItem("k")).toBe("v");
    expect(s.getItem("k")).toBe("v");
    s.removeItem("k");
    expect(base.getItem("k")).toBeNull();
  });

  it("never throws when every method throws", () => {
    const s = safeStorage(() => throwingStorage())!;
    expect(s.getItem("k")).toBeNull();
    expect(() => s.setItem("k", "v")).not.toThrow();
    expect(() => s.removeItem("k")).not.toThrow();
    expect(() => s.clear()).not.toThrow();
    expect(s.key(0)).toBeNull();
    expect(s.length).toBe(0);
  });

  it("keeps a failed write in memory so it can be read back", () => {
    const s = safeStorage(() => quotaFullStorage())!;
    s.setItem("k", "v");
    expect(s.getItem("k")).toBe("v");
    s.removeItem("k");
    expect(s.getItem("k")).toBeNull();
  });
});
```

- [ ] **Step 3: Write the failing integration tests**

In `src/core/analytics.test.ts` change the test-utils import to:
```ts
import { fakeStorage, quotaFullStorage, throwingStorage } from "../test-utils.js";
```
and append inside `describe("createAnalytics", ...)`:
```ts
  it("keeps sending when every storage access throws", () => {
    const a = createAnalytics({ appId: "wordle" }, { ...deps, localStorage: throwingStorage(), sessionStorage: throwingStorage() });
    expect(() => {
      a.acceptConsent();
      a.page();
      a.flush();
    }).not.toThrow();
    expect(batches.flatMap((b) => b.events).some((e) => e.name === "$pageview")).toBe(true);
  });

  it("keeps one session when storage writes fail (quota full)", () => {
    const a = createAnalytics({ appId: "wordle" }, { ...deps, localStorage: quotaFullStorage(), sessionStorage: quotaFullStorage() });
    a.acceptConsent();
    a.page();
    a.page();
    a.flush();
    const starts = batches.flatMap((b) => b.events).filter((e) => e.name === "$session_start");
    expect(starts).toHaveLength(1);
  });
```

- [ ] **Step 4: Run to see them fail**

Run: `npx vitest run src/core/safe-storage.test.ts src/core/analytics.test.ts`
Expected: FAIL (`safe-storage.js` missing; the throwing-storage test throws; the quota test counts more than one `$session_start`).

- [ ] **Step 5: Create `src/core/safe-storage.ts`**

```ts
/**
 * Storage that never throws. Blocked site data, sandboxed iframes and full quotas would otherwise
 * break tracking. A write that fails is kept in memory for this page, so sessions still work.
 */
export function safeStorage(get: () => Storage | null | undefined): Storage | null {
  let found: Storage | null | undefined;
  try {
    found = get();
  } catch {
    return null;
  }
  if (!found) return null;
  const storage = found;
  const fallback = new Map<string, string>();

  return {
    getItem(key: string): string | null {
      if (fallback.has(key)) return fallback.get(key) ?? null;
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string): void {
      try {
        storage.setItem(key, value);
        fallback.delete(key);
      } catch {
        fallback.set(key, String(value));
      }
    },
    removeItem(key: string): void {
      fallback.delete(key);
      try {
        storage.removeItem(key);
      } catch {
        // blocked; nothing to remove then
      }
    },
    clear(): void {
      fallback.clear();
      try {
        storage.clear();
      } catch {
        // blocked
      }
    },
    key(index: number): string | null {
      try {
        return storage.key(index);
      } catch {
        return null;
      }
    },
    get length(): number {
      try {
        return storage.length;
      } catch {
        return 0;
      }
    },
  } as Storage;
}
```

- [ ] **Step 6: Use it in `src/core/analytics.ts`**

Add the import:
```ts
import { safeStorage } from "./safe-storage.js";
```
Replace the two storage lines:
```ts
  const ls = deps.localStorage !== undefined ? deps.localStorage : isBrowser ? window.localStorage : null;
  const ss = deps.sessionStorage !== undefined ? deps.sessionStorage : isBrowser ? window.sessionStorage : null;
```
with:
```ts
  const ls = safeStorage(() => (deps.localStorage !== undefined ? deps.localStorage : isBrowser ? window.localStorage : null));
  const ss = safeStorage(() => (deps.sessionStorage !== undefined ? deps.sessionStorage : isBrowser ? window.sessionStorage : null));
```

- [ ] **Step 7: Run all core tests**

Run: `npx vitest run src/core`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/core/safe-storage.ts src/core/safe-storage.test.ts src/core/analytics.ts src/core/analytics.test.ts src/test-utils.ts
git commit -m "feat(core): storage access that never throws, with an in-memory fallback for failed writes"
```

---

### Task 5: `cookieless` config flag

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/analytics.ts`
- Test: `src/core/analytics.test.ts`

**Interfaces:**
- Consumes: Task 4 `safeStorage`.
- Produces: `AnalyticsConfig.cookieless?: boolean`.

- [ ] **Step 1: Write the failing tests**

Append inside `describe("createAnalytics", ...)` in `src/core/analytics.test.ts`:
```ts
  describe("cookieless", () => {
    it("never touches the storages, even when deps provide them", () => {
      const a = createAnalytics({ appId: "wordle", cookieless: true }, deps);
      a.page();
      a.acceptConsent();
      a.page();
      a.flush();
      expect(deps.localStorage!.length).toBe(0);
      expect(deps.sessionStorage!.length).toBe(0);
    });

    it("keeps consent pending, sends no $consent and no visitor id", () => {
      const a = createAnalytics({ appId: "wordle", cookieless: true }, deps);
      const seen: string[] = [];
      a.onConsentChange((s) => seen.push(s));
      a.acceptConsent();
      a.declineConsent();
      a.page();
      a.flush();
      const events = batches.flatMap((b) => b.events);
      expect(a.getConsent()).toBe("pending");
      expect(seen).toEqual([]);
      expect(events.some((e) => e.name === "$consent")).toBe(false);
      expect(events.every((e) => e.visitorId === null)).toBe(true);
      expect(batches.every((b) => b.consentState === "pending")).toBe(true);
    });

    it("keeps one in-memory session", () => {
      const a = createAnalytics({ appId: "wordle", cookieless: true }, deps);
      a.page();
      a.page();
      a.flush();
      const events = batches.flatMap((b) => b.events);
      expect(events.filter((e) => e.name === "$session_start")).toHaveLength(1);
      expect(new Set(events.map((e) => e.sessionId)).size).toBe(1);
    });
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/core/analytics.test.ts -t cookieless`
Expected: FAIL (storages are written; `$consent` is emitted).

- [ ] **Step 3: Implement**

In `src/core/types.ts`, add to `AnalyticsConfig` (after `captureErrors`):
```ts
  /** Never touch localStorage/sessionStorage. Consent stays "pending"; accept/decline do nothing. Default false */
  cookieless?: boolean;
```

In `src/core/analytics.ts`, replace the two `const ls`/`const ss` lines from Task 4 with:
```ts
  const cookieless = config.cookieless === true;
  const ls = cookieless
    ? null
    : safeStorage(() => (deps.localStorage !== undefined ? deps.localStorage : isBrowser ? window.localStorage : null));
  const ss = cookieless
    ? null
    : safeStorage(() => (deps.sessionStorage !== undefined ? deps.sessionStorage : isBrowser ? window.sessionStorage : null));
```

and in the returned object replace the two consent methods:
```ts
    acceptConsent: () => {
      if (!cookieless) consent.accept();
    },
    declineConsent: () => {
      if (!cookieless) consent.decline();
    },
```

- [ ] **Step 4: Run all core tests**

Run: `npx vitest run src/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/analytics.ts src/core/analytics.test.ts
git commit -m "feat(core): cookieless config flag"
```

---

### Task 6: Start/stop lifecycle for the automatic listeners

**Files:**
- Modify: `src/core/analytics.ts`
- Modify: `src/core/webvitals.ts` (no signature change; see note)
- Create: `src/core/lifecycle.test.ts`

**Interfaces:**
- Consumes: Task 4–5 `analytics.ts`.
- Produces (in `src/core/analytics.ts`, NOT exported from `src/index.ts`):
  ```ts
  export interface StartableAnalytics<E extends EventMap = EventMap> {
    analytics: Analytics<E>;
    /** Attach the automatic listeners. Idempotent while active. Returns stop(). */
    start: () => () => void;
  }
  /** @internal Used by AnalyticsProvider. Not exported from any package entry. */
  export function createAnalyticsUnstarted<E extends EventMap = EventMap>(config: AnalyticsConfig, deps?: AnalyticsDeps): StartableAnalytics<E>;
  ```
  `createAnalytics` keeps its signature and behavior (starts at once). Task 7 imports `createAnalyticsUnstarted`.

- [ ] **Step 1: Write the failing tests**

Create `src/core/lifecycle.test.ts`:
```ts
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

type VitalHandler = (m: { name: string; value: number; rating: string }) => void;
const vitalHandlers: VitalHandler[] = [];
vi.mock("web-vitals", () => ({
  onCLS: (h: VitalHandler) => void vitalHandlers.push(h),
  onINP: (h: VitalHandler) => void vitalHandlers.push(h),
  onLCP: (h: VitalHandler) => void vitalHandlers.push(h),
}));

import { createAnalytics, createAnalyticsUnstarted } from "./analytics.js";
import { fakeStorage } from "../test-utils.js";
import type { Batch } from "./types.js";

// Each instance gets its own array: listeners of earlier instances may still be attached.
function depsFor(sent: Batch[]) {
  return {
    localStorage: fakeStorage(),
    sessionStorage: fakeStorage(),
    transport: { send: (_u: string, body: string) => void sent.push(JSON.parse(body)) },
  };
}
const count = (sent: Batch[], name: string) => sent.flatMap((b) => b.events).filter((e) => e.name === name).length;
const fireError = () => window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));

describe("listener lifecycle", () => {
  beforeEach(() => {
    vitalHandlers.length = 0;
  });

  it("createAnalytics captures errors right away (unchanged for direct users)", () => {
    const sent: Batch[] = [];
    const a = createAnalytics({ appId: "t" }, depsFor(sent));
    fireError();
    a.flush();
    expect(count(sent, "$error")).toBe(1);
  });

  it("an unstarted instance tracks, but captures errors only between start() and stop()", () => {
    const sent: Batch[] = [];
    const { analytics, start } = createAnalyticsUnstarted({ appId: "t" }, depsFor(sent));
    analytics.page();
    fireError();
    analytics.flush();
    expect(count(sent, "$pageview")).toBe(1);
    expect(count(sent, "$error")).toBe(0);

    const stop = start();
    fireError();
    analytics.flush();
    expect(count(sent, "$error")).toBe(1);

    stop();
    fireError();
    analytics.flush();
    expect(count(sent, "$error")).toBe(1);
  });

  it("start() is idempotent while active", () => {
    const sent: Batch[] = [];
    const { analytics, start } = createAnalyticsUnstarted({ appId: "t" }, depsFor(sent));
    start();
    const stop = start();
    fireError();
    analytics.flush();
    expect(count(sent, "$error")).toBe(1);
    stop();
  });

  it("registers Web Vitals once per instance and reports them only while active", () => {
    const sent: Batch[] = [];
    const { analytics, start } = createAnalyticsUnstarted({ appId: "t" }, depsFor(sent));
    start()();
    const stop = start();
    expect(vitalHandlers).toHaveLength(3);

    stop();
    vitalHandlers[0]!({ name: "CLS", value: 0.1, rating: "good" });
    analytics.flush();
    expect(count(sent, "$web_vital")).toBe(0);

    start();
    vitalHandlers[0]!({ name: "CLS", value: 0.1, rating: "good" });
    analytics.flush();
    expect(count(sent, "$web_vital")).toBe(1);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/core/lifecycle.test.ts`
Expected: FAIL, `createAnalyticsUnstarted` is not exported.

- [ ] **Step 3: Implement in `src/core/analytics.ts`**

`src/core/webvitals.ts` stays as it is (`setupWebVitals(report)` returns `void`; web-vitals has no unsubscribe). Gating happens in the report callback.

Rename the current `createAnalytics` function to `createAnalyticsUnstarted`, change its return type, and replace the `if (isBrowser) { ... }` listener block and the final `return analytics;`. The full changed parts:

Below the `AnalyticsDeps` interface add:
```ts
export interface StartableAnalytics<E extends EventMap = EventMap> {
  analytics: Analytics<E>;
  /** Attach the automatic listeners. Idempotent while active. Returns stop(). */
  start: () => () => void;
}
```

Function head and server branch:
```ts
/** @internal Used by AnalyticsProvider, which starts the instance in an effect. Not exported from any package entry. */
export function createAnalyticsUnstarted<E extends EventMap = EventMap>(
  config: AnalyticsConfig,
  deps: AnalyticsDeps = {},
): StartableAnalytics<E> {
  const isBrowser = typeof window !== "undefined";
  if (!isBrowser && deps.transport === undefined) return { analytics: noop() as Analytics<E>, start: () => () => {} };
```

Delete this block:
```ts
  if (isBrowser) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") queue.flush(true);
    });
    if (config.captureWebVitals !== false) setupWebVitals(emit);
    if (config.captureErrors !== false) setupErrorCapture(emit);
  }
```

and add, directly before `const analytics: Analytics<E> = {`:
```ts
  let active = false;
  let vitalsRegistered = false;
  let detach: (() => void) | null = null;

  function stop(): void {
    if (!active) return;
    active = false;
    detach?.();
    detach = null;
  }

  function start(): () => void {
    if (!isBrowser || active) return stop;
    active = true;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") queue.flush(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    const stopErrors = config.captureErrors !== false ? setupErrorCapture(emit) : () => {};
    // web-vitals cannot unsubscribe, so register once and gate on `active`.
    if (config.captureWebVitals !== false && !vitalsRegistered) {
      vitalsRegistered = true;
      setupWebVitals((name, props) => {
        if (active) emit(name, props);
      });
    }
    detach = () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopErrors();
    };
    return stop;
  }
```

Replace the final `return analytics;` of that function with:
```ts
  return { analytics, start };
}

export function createAnalytics<E extends EventMap = EventMap>(
  config: AnalyticsConfig,
  deps: AnalyticsDeps = {},
): Analytics<E> {
  const { analytics, start } = createAnalyticsUnstarted<E>(config, deps);
  start();
  return analytics;
}
```

Do not touch `src/index.ts`: it keeps exporting only `createAnalytics`, `Analytics`, `AnalyticsDeps`.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: PASS (lifecycle tests plus everything else, including the existing provider and tracker tests).

- [ ] **Step 5: Check the public surface did not change**

Run: `grep -n "Unstarted" src/index.ts src/react/index.ts src/next/index.ts src/next/client/index.ts`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/core/analytics.ts src/core/lifecycle.test.ts
git commit -m "refactor(core): start/stop lifecycle for automatic listeners"
```

---

### Task 7: Provider: typed instances and StrictMode-safe start

**Files:**
- Modify: `src/react/provider.tsx` (whole file)
- Create: `src/react/provider.test-d.tsx`
- Create: `src/react/provider.ssr.test.tsx`
- Test: `src/react/provider.test.tsx`

**Interfaces:**
- Consumes: Task 6 `createAnalyticsUnstarted(config, deps?) → { analytics, start }`.
- Produces:
  ```ts
  export type AnalyticsProviderProps<E extends EventMap = EventMap> = { children: ReactNode } & (
    | (AnalyticsConfig & { instance?: undefined })
    | (Partial<AnalyticsConfig> & { instance: Analytics<E> })
  );
  export function AnalyticsProvider<E extends EventMap = EventMap>(props: AnalyticsProviderProps<E>): JSX.Element;
  ```
  `useAnalytics` unchanged.

- [ ] **Step 1: Write the failing type test**

Create `src/react/provider.test-d.tsx` (checked by `npm run typecheck`; the `.test-d.tsx` name keeps Vitest from running it):
```tsx
import { createAnalytics } from "../core/analytics.js";
import { AnalyticsProvider } from "./provider.js";

type Events = { subscribe_click: { target: "app" | "copy" } };
const typed = createAnalytics<Events>({ appId: "t" });

export const typedInstanceWithoutAppId = <AnalyticsProvider instance={typed}>x</AnalyticsProvider>;
export const typedInstanceWithAppId = (
  <AnalyticsProvider appId="t" instance={typed}>
    x
  </AnalyticsProvider>
);
export const configOnly = <AnalyticsProvider appId="t">x</AnalyticsProvider>;
// @ts-expect-error appId is required without an instance
export const neither = <AnalyticsProvider>x</AnalyticsProvider>;
```

- [ ] **Step 2: Run typecheck to see it fail**

Run: `npm run typecheck`
Expected: FAIL with errors in `provider.test-d.tsx` (missing `appId` on `typedInstanceWithoutAppId`; typed instance not assignable to `Analytics<EventMap>`).

- [ ] **Step 3: Write the failing StrictMode tests and the SSR pin**

Replace `src/react/provider.test.tsx` with:
```tsx
// @vitest-environment happy-dom
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AnalyticsProvider, useAnalytics } from "./provider.js";
import type { Batch } from "../core/types.js";

function Probe() {
  const analytics = useAnalytics();
  return <span>{analytics.getConsent()}</span>;
}

describe("AnalyticsProvider", () => {
  afterEach(cleanup);

  it("provides an analytics instance to children", () => {
    render(
      <AnalyticsProvider appId="test-app">
        <Probe />
      </AnalyticsProvider>,
    );
    expect(screen.getByText("pending")).toBeTruthy();
  });

  it("useAnalytics throws outside the provider", () => {
    expect(() => render(<Probe />)).toThrow(/AnalyticsProvider/);
  });
});

describe("AnalyticsProvider listeners", () => {
  let bodies: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    bodies = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(String(init.body));
        return new Response(null, { status: 202 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const tree = () => (
    <StrictMode>
      <AnalyticsProvider appId="t" captureWebVitals={false}>
        <span>child</span>
      </AnalyticsProvider>
    </StrictMode>
  );

  function errorsSent(): number {
    vi.advanceTimersByTime(6000);
    return bodies
      .flatMap((b) => (JSON.parse(b) as Batch).events)
      .filter((e) => e.name === "$error").length;
  }

  it("sends one $error per error under StrictMode", () => {
    render(tree());
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    expect(errorsSent()).toBe(1);
  });

  it("does not stack listeners across unmount and remount", () => {
    const first = render(tree());
    first.unmount();
    render(tree());
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    expect(errorsSent()).toBe(1);
  });
});
```

Create `src/react/provider.ssr.test.tsx` (node environment, no happy-dom):
```tsx
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { AnalyticsProvider } from "./provider.js";

describe("AnalyticsProvider on the server", () => {
  it("renders without an instance and without touching window", () => {
    const html = renderToString(
      <AnalyticsProvider appId="t">
        <span>ok</span>
      </AnalyticsProvider>,
    );
    expect(html).toContain("ok");
  });
});
```

- [ ] **Step 4: Run to see the StrictMode tests fail**

Run: `npx vitest run src/react`
Expected: FAIL in "sends one $error per error under StrictMode" (2 or more) and "does not stack listeners…" (more than 1). The SSR test PASSES already (it pins existing behavior).

- [ ] **Step 5: Rewrite `src/react/provider.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createAnalyticsUnstarted, type Analytics } from "../core/analytics.js";
import type { AnalyticsConfig, EventMap } from "../core/types.js";

const AnalyticsContext = createContext<Analytics | null>(null);

export type AnalyticsProviderProps<E extends EventMap = EventMap> = { children: ReactNode } & (
  | (AnalyticsConfig & { instance?: undefined })
  /** A prebuilt instance (from createAnalytics). Config props are then ignored. */
  | (Partial<AnalyticsConfig> & { instance: Analytics<E> })
);

export function AnalyticsProvider<E extends EventMap = EventMap>(props: AnalyticsProviderProps<E>) {
  // StrictMode runs this initializer twice in dev. The instance is created unstarted, so the
  // discarded one never attaches listeners; the kept one starts in the effect below.
  const [created] = useState(() => {
    if (props.instance !== undefined) return null;
    const { children: _children, instance: _instance, ...config } = props;
    return createAnalyticsUnstarted(config);
  });
  useEffect(() => (created ? created.start() : undefined), [created]);

  const analytics = (props.instance ?? created!.analytics) as unknown as Analytics;
  return <AnalyticsContext.Provider value={analytics}>{props.children}</AnalyticsContext.Provider>;
}

export function useAnalytics<E extends EventMap = EventMap>(): Analytics<E> {
  const analytics = useContext(AnalyticsContext);
  if (!analytics) throw new Error("useAnalytics must be used inside <AnalyticsProvider>");
  return analytics as Analytics<E>;
}
```

If TypeScript does not narrow `props` after `props.instance !== undefined` (so `config` lacks `appId`), cast inside the initializer: `return createAnalyticsUnstarted(config as AnalyticsConfig);` and keep the type test as the guard.

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS for both. The pageview-tracker test (passes `appId` and `instance`) still compiles.

- [ ] **Step 7: Commit**

```bash
git add src/react/provider.tsx src/react/provider.test.tsx src/react/provider.test-d.tsx src/react/provider.ssr.test.tsx
git commit -m "feat(react): typed instances in AnalyticsProvider; start listeners in an effect"
```

---

### Task 8: One pageview under StrictMode

**Files:**
- Modify: `src/next/client/pageview-tracker.tsx`
- Test: `src/next/client/pageview-tracker.test.tsx`

**Interfaces:**
- Consumes: Task 7 provider (`instance` without `appId` allowed).
- Produces: no API change.

- [ ] **Step 1: Write the failing test**

In `src/next/client/pageview-tracker.test.tsx` add `import { StrictMode } from "react";` at the top (after the `vitest` import) and append inside the `describe`:
```tsx
  it("sends one pageview per path under StrictMode", () => {
    pathname = "/strict";
    const batches: Batch[] = [];
    const analytics = createAnalytics(
      { appId: "t" },
      {
        localStorage: fakeStorage(), sessionStorage: fakeStorage(),
        transport: { send: (_u, body) => void batches.push(JSON.parse(body)) },
      },
    );
    const ui = () => (
      <StrictMode>
        <AnalyticsProvider instance={analytics}>
          <PageviewTracker />
        </AnalyticsProvider>
      </StrictMode>
    );
    const count = () => {
      analytics.flush();
      return batches.flatMap((b) => b.events).filter((e) => e.name === "$pageview").length;
    };

    const { rerender } = render(ui());
    expect(count()).toBe(1);
    pathname = "/strict-next";
    rerender(ui());
    expect(count()).toBe(2);
  });
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/next/client`
Expected: FAIL, first count is 2.

- [ ] **Step 3: Implement**

Replace `src/next/client/pageview-tracker.tsx` with:
```tsx
"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAnalytics } from "rt-analytics/react";

export function PageviewTracker(): null {
  const analytics = useAnalytics();
  const pathname = usePathname();
  // StrictMode runs effects twice in dev; refs survive that, so each path counts once.
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (lastTracked.current === pathname) return;
    lastTracked.current = pathname;
    analytics.page();
  }, [analytics, pathname]);

  return null;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/next/client`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/next/client/pageview-tracker.tsx src/next/client/pageview-tracker.test.tsx
git commit -m "fix(next/client): one pageview per path under React StrictMode"
```

---

### Task 9: Packaging, version 0.2.0, setup script, example app

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `src/core/version.ts`, `src/smoke.test.ts`
- Modify: `scripts/setup-gcp.ts` (end of `main`)
- Modify: `example/app/api/a/route.ts`
- Create (gitignored): `claude-tmp-helpers/check-require.cjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `SDK_VERSION === "0.2.0"`; exports with `"default"`.

- [ ] **Step 1: Write the failing version test**

In `src/smoke.test.ts` change the expectation to:
```ts
    expect(SDK_VERSION).toBe("0.2.0");
```

- [ ] **Step 2: Write the require check (gitignored helper)**

Create `claude-tmp-helpers/check-require.cjs`:
```js
// Usage: node claude-tmp-helpers/check-require.cjs
// Checks that the package resolves through CommonJS require() (the "default" export condition).
// Run `npm run build` first. Needs Node >= 22.12 for require(esm).
for (const entry of ["rt-analytics", "rt-analytics/next"]) {
  const mod = require(entry);
  console.log(entry, "->", Object.keys(mod).sort().join(", "));
}
```

- [ ] **Step 3: Run both to see them fail**

Run: `npx vitest run src/smoke.test.ts; npm run build && node claude-tmp-helpers/check-require.cjs`
Expected: the test FAILS (`0.1.0`); the script fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

- [ ] **Step 4: Implement the packaging changes**

`src/core/version.ts`:
```ts
export const SDK_VERSION = "0.2.0";
```

In `package.json`:
- `"version": "0.2.0"`
- `"files": ["dist", "CHANGELOG.md"]`
- `"repository": { "type": "git", "url": "git+https://github.com/RobinThues/rt-analytics.git" }` (after `"license"`)
- `"exports"` becomes:
```json
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "default": "./dist/index.js" },
    "./react": { "types": "./dist/react/index.d.ts", "import": "./dist/react/index.js", "default": "./dist/react/index.js" },
    "./next": { "types": "./dist/next/index.d.ts", "import": "./dist/next/index.js", "default": "./dist/next/index.js" },
    "./next/client": { "types": "./dist/next/client/index.d.ts", "import": "./dist/next/client/index.js", "default": "./dist/next/client/index.js" }
  },
```
- add to `"scripts"`: `"prepublishOnly": "npm test && npm run typecheck"`

Then update the lock file:
```bash
npm install --package-lock-only --ignore-scripts
```

In `scripts/setup-gcp.ts`, below `const salt = randomBytes(16).toString("hex");` add:
```ts
  const ignoreKey = randomBytes(16).toString("hex");
```
and replace the printing block's end so it reads:
```ts
  console.log("\n=== Vercel env vars (per app, Production only; salt may be shared across apps) ===");
  console.log("ANALYTICS_GCP_CREDENTIALS:");
  console.log(keyOneLine);
  console.log("\nANALYTICS_DAILY_SALT (generated now; reuse the same value everywhere):");
  console.log(salt);
  console.log("\nANALYTICS_IGNORE_KEY (optional, generated now; opens the ignore link /api/a?ignore=<key>):");
  console.log(ignoreKey);
  console.log("\nDone.");
```

`example/app/api/a/route.ts`:
```ts
import { createAnalyticsHandler } from "rt-analytics/next";

export const { GET, POST } = createAnalyticsHandler({ allowedAppIds: ["example"] });
```

- [ ] **Step 5: Verify**

Run: `npx vitest run && npm run typecheck && npm run build && node claude-tmp-helpers/check-require.cjs`
Expected: tests PASS, typecheck clean, build OK, script prints both entries with their export names (e.g. `rt-analytics -> SDK_VERSION, createAnalytics`).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/core/version.ts src/smoke.test.ts scripts/setup-gcp.ts example/app/api/a/route.ts
git commit -m "chore: 0.2.0 packaging (default export condition, prepublishOnly, repository), ignore key in setup:gcp"
```

---

### Task 10: README and CHANGELOG

**Files:**
- Modify: `README.md`
- Create: `CHANGELOG.md`

**Interfaces:** docs only; must match the code from Tasks 1–9.

- [ ] **Step 1: Quickstart step 1** — replace lines 19–25 (the route snippet) with:

````markdown
**1. Add the ingestion route** (`app/api/a/route.ts`):

```ts
import { createAnalyticsHandler } from "rt-analytics/next";

export const { GET, POST } = createAnalyticsHandler({ allowedAppIds: ["my-app"] });
```

`POST` receives the events. `GET` serves the optional [ignore link](#exclude-your-own-visits).
`allowedAppIds` drops batches for any other app id (exact match).
````

- [ ] **Step 2: Quickstart step 2** — the layout code block stays as it is. Add this paragraph right after it:

```markdown
Use one `AnalyticsProvider` per page. The provider starts error and Web Vitals capture in an effect,
so errors thrown during the very first render or hydration are not captured. If you need those,
create the instance yourself with `createAnalytics()` and pass it as `instance`.
```

- [ ] **Step 3: Quickstart step 3** — replace lines 48–58 with:

````markdown
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
````

- [ ] **Step 4: GCP setup** — replace item 6 and the paragraph after the list (lines 106–111) with:

```markdown
6. Creates a key for that service account (`key.json`, gitignored) if one doesn't already exist
   locally, and generates a random `ANALYTICS_DAILY_SALT` and `ANALYTICS_IGNORE_KEY`.

At the end it prints the env var values to your terminal. Paste them into your Vercel project's
environment variables (Project Settings → Environment Variables) for **Production only**, then
redeploy (env vars only apply to new deployments).
```

- [ ] **Step 5: New sections after "GCP setup"** — insert before `## Consent model`:

```markdown
## Exclude your own visits

Set `ANALYTICS_IGNORE_KEY` (at least 16 characters) and redeploy. Then open this link once in each
browser you use:

    https://your-site.example/api/a?ignore=<ANALYTICS_IGNORE_KEY>

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
```

- [ ] **Step 6: Consent model** — after the paragraph ending "...unlinkable day-to-day." (line 135) add:

```markdown
**Fully cookieless mode.** Pass `cookieless: true` (to `createAnalytics` or the provider) and the SDK
never touches `localStorage` or `sessionStorage`. Consent stays `pending`, `acceptConsent()` and
`declineConsent()` do nothing, there is no persistent visitor id, and the session lives in memory.
Don't combine it with `<ConsentBanner />`.

**Storage errors.** If storage is blocked or full, the SDK keeps working: reads return nothing and
failed writes are kept in memory for the current page.

**The one cookie.** The only cookie this package ever sets is `rta_ignore`, and only in the browser
of someone who opens the secret [ignore link](#exclude-your-own-visits) on purpose (the site owner).
Visitors never get it.
```

- [ ] **Step 7: API reference** — update these lines:

Line 143 (`AnalyticsConfig`) becomes:
```markdown
  - `AnalyticsConfig`: `{ appId: string; endpoint?: string /* default "/api/a" */; flushIntervalMs?: number /* default 5000 */; maxBatchSize?: number /* default 10 */; captureWebVitals?: boolean /* default true */; captureErrors?: boolean /* default true */; cookieless?: boolean /* default false */ }`
```

Line 157 (provider) becomes:
```markdown
- `<AnalyticsProvider appId="..." endpoint?, flushIntervalMs?, maxBatchSize?, captureWebVitals?, captureErrors?, cookieless? />` or `<AnalyticsProvider instance={analytics} />` — provides one `Analytics` instance via context. Without `instance` it creates one from the config props and starts its automatic listeners in an effect. With `instance` (any `Analytics<E>`, typed events included) the config props are optional and ignored. Use one provider per page.
```

Lines 167–169 (handler) become:
```markdown
- `createAnalyticsHandler(options?: HandlerOptions): { GET: (req: Request) => Promise<Response>; POST: (req: Request) => Promise<Response> }` — drop into `app/api/a/route.ts` as `export const { GET, POST } = ...`.
  - `HandlerOptions`: `{ datasetId?: string /* default "analytics" */; tableId?: string /* default "events" */; maxBodyBytes?: number /* default 50000 */; salt?: string /* default process.env.ANALYTICS_DAILY_SALT, at least 16 characters */; allowedAppIds?: string[] /* exact match; unset accepts any app id and warns once */; ignoreKey?: string /* default process.env.ANALYTICS_IGNORE_KEY, at least 16 characters */; writer?: RowWriter /* inject a custom writer, e.g. for tests */; now?: () => Date }`
  - Reads GCP credentials from `process.env.ANALYTICS_GCP_CREDENTIALS` (one-line service-account JSON) unless a `writer` is injected. Checks credentials first, then the salt; the salt rule also applies with an injected writer.
  - `GET` serves the [ignore link](#exclude-your-own-visits) and answers `200` or `404`.
```

- [ ] **Step 8: New sections before `## License`**

````markdown
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
````

- [ ] **Step 9: Create `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-10-13

### Added
- Ignore link for the site owner: `GET /api/a?ignore=<key>` sets an `rta_ignore` cookie, and the
  handler drops batches that carry it (`x-rta: ignored`). Key from `ANALYTICS_IGNORE_KEY` or
  `ignoreKey`.
- `allowedAppIds` handler option.
- `cookieless` config flag: never touch browser storage.
- `AnalyticsProvider` accepts typed instances (`Analytics<E>`) without a cast or `appId`.
- `"default"` export condition, so CommonJS resolvers (Jest) find the package.
- `setup:gcp` prints a generated `ANALYTICS_IGNORE_KEY`.

### Changed
- **Breaking:** the salt must be at least 16 characters, otherwise all events are dropped. The
  handler checks credentials first, then the salt.
- **Breaking (types):** `AnalyticsProviderProps` is a union type.
- The provider starts error and Web Vitals capture in an effect and stops it on unmount.
- README: credentials for Production only; WAF rate-limit rule.

### Fixed
- Doubled `$error` / `$web_vital` events and doubled pageviews under React StrictMode in dev.
- Storage access no longer throws when storage is blocked or full.

## [0.1.0] - 2026-10-12

### Added
- Initial release: browser SDK with consent model, sessions, Web Vitals and error capture; React
  provider and consent banner; Next.js pageview tracker and ingest handler writing to BigQuery via
  the Storage Write API; `setup:gcp` script, SQL views and query templates.

[0.2.0]: https://github.com/RobinThues/rt-analytics/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/RobinThues/rt-analytics/releases/tag/v0.1.0
```

Set the 0.2.0 date to the actual publish date when publishing (Task 12).

- [ ] **Step 10: Check the README against the code**

Run: `grep -n "createAnalyticsHandler()" README.md example/app/api/a/route.ts; grep -n "Development" README.md`
Expected: no remaining `export const { POST } = createAnalyticsHandler()` quickstart and no "Production, Preview, and Development" advice.

- [ ] **Step 11: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: README and CHANGELOG for 0.2.0"
```

---

### Task 11: Pre-publish verification

**Files:**
- Modify (gitignored): `claude-tmp-helpers/smoke-example.sh`

- [ ] **Step 1: Update `smoke-example.sh`**

Change the server start line to pass a salt and add a GET check. Replace:
```bash
npx next start -p "$PORT" >/tmp/rt-example-smoke.log 2>&1 &
```
with:
```bash
ANALYTICS_DAILY_SALT=smoke-salt-0123456789 npx next start -p "$PORT" >/tmp/rt-example-smoke.log 2>&1 &
```
and add after the `GET /` echo line:
```bash
echo "GET /api/a (no key) -> $(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/a?ignore=x")  (expect 404)"
```

- [ ] **Step 2: Full local verification**

Run, in order:
```bash
npm test
npm run typecheck
npm run build
npx tsx claude-tmp-helpers/smoke-bq-encode.ts
npx tsx claude-tmp-helpers/smoke-handler.ts
node claude-tmp-helpers/check-require.cjs
(cd example && npm install && npm run build)
claude-tmp-helpers/smoke-example.sh
npm pack --dry-run
```
Expected:
- tests and typecheck PASS, build OK (the tsdown "TypeScript 7.0 does not yet have a stable API" line is harmless).
- smoke-bq-encode: round-trip OK. smoke-handler: `status 202, rows written: 1`.
- check-require prints both entries.
- smoke-example: `GET / -> 200`, `GET /api/a (no key) -> 404`, `POST /api/a -> 202`, and the server log contains `ANALYTICS_GCP_CREDENTIALS is not set` (not a salt error).
- `npm pack --dry-run` lists `dist/**`, `CHANGELOG.md`, `README.md`, `LICENSE`, `package.json` and nothing else (no `.env*`, no `key.json`, no `claude-tmp-helpers`).

- [ ] **Step 3: Whole-branch review**

Dispatch one fresh reviewer over `git diff 3d8582d..HEAD` against the spec. Fix findings in new commits, re-run Step 2.

---

### Task 12: Publish and tag (needs Robin)

- [ ] **Step 1:** Set the 0.2.0 date in `CHANGELOG.md` to today, commit `docs: date the 0.2.0 changelog entry`.
- [ ] **Step 2:** Ask Robin to run in his own terminal (npm 2FA): `npm publish` (runs `prepublishOnly` → tests + typecheck, and `prepare` → build).
- [ ] **Step 3:** Verify: `npm view rt-analytics@0.2.0 version gitHead`. Expected `0.2.0` and the release commit hash.
- [ ] **Step 4:** Tag: `git tag v0.1.0 3d8582d` and `git tag v0.2.0 <gitHead from Step 3>`.
- [ ] **Step 5:** With Robin's OK: `git push origin main --tags`.

---

### Task 13: wetter-in-kalender code changes (separate repo, one PR)

Repo: `/home/robin/projects/dwd-wetter-in-calendar`. Branch first: `git switch -c chore/rt-analytics-0.2.0`.

**Files:**
- Modify: `package.json`, `package-lock.json` (`npm install rt-analytics@^0.2.0`)
- Modify: `src/app/api/a/route.ts`, `src/lib/analytics.ts`, `src/components/Analytics.tsx`, `jest.config.ts`
- Test: `src/__tests__/api-a-route.test.ts`

- [ ] **Step 1: Add failing route tests** in `src/__tests__/api-a-route.test.ts`. Change the import to:
```ts
import { GET, POST } from '@/app/api/a/route'
```
Append inside `describe('POST /api/a', ...)` (the `allowedAppIds` check runs before the credentials check, so nothing is logged):
```ts
  test('drops batches for other app ids before the credentials check', async () => {
    const res = await post(JSON.stringify({ ...batch(), appId: 'someone-else' }))
    expect(res.status).toBe(202)
    expect(consoleError).not.toHaveBeenCalled()
  })
```
Append at the end of the file:
```ts
describe('GET /api/a', () => {
  test('answers 404 without a configured ignore key', async () => {
    delete process.env.ANALYTICS_IGNORE_KEY
    const res = await GET(new Request('https://www.wetter-in-kalender.de/api/a?ignore=anything-0123456789'))
    expect(res.status).toBe(404)
  })
})
```
Run `npm test -- api-a-route`. Expected: FAIL before the route change (`GET is not a function`; the other-app batch reaches the credentials log).

- [ ] **Step 2: Install and change the code**

```bash
npm install rt-analytics@^0.2.0
```

`src/app/api/a/route.ts`:
```ts
import { createAnalyticsHandler } from 'rt-analytics/next'
import { ANALYTICS_APP_ID } from '@/lib/analytics'

// Ingest for rt-analytics (see src/lib/analytics.ts). POST always answers 202 and writes to BigQuery
// when ANALYTICS_GCP_CREDENTIALS and ANALYTICS_DAILY_SALT are set (Vercel Production only).
// GET serves the owner's ignore link when ANALYTICS_IGNORE_KEY is set.
export const { GET, POST } = createAnalyticsHandler({ allowedAppIds: [ANALYTICS_APP_ID] })
```

`src/lib/analytics.ts` — replace the comment and call at the bottom:
```ts
/**
 * One instance for the whole site, cookieless (no consent banner, nothing stored in the browser,
 * even if rta_consent=accepted ever lands on this origin). On the server createAnalytics returns
 * an inert no-op, so SSR and prerender can import this.
 */
export const analytics = createAnalytics<Events>({ appId: ANALYTICS_APP_ID, cookieless: true })
```

`src/components/Analytics.tsx`:
```tsx
'use client'

import { PageviewTracker } from 'rt-analytics/next/client'
import { AnalyticsProvider } from 'rt-analytics/react'
import { analytics } from '@/lib/analytics'

/** Site-wide analytics: pageviews on every App Router navigation, Web Vitals and JS errors. Cookieless. */
export function Analytics({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AnalyticsProvider instance={analytics}>
      <PageviewTracker />
      {children}
    </AnalyticsProvider>
  )
}
```

`jest.config.ts` — replace the `moduleNameMapper` and its comment with:
```ts
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // rt-analytics is ESM-only; Jest finds it via its "default" export condition, swc transforms it.
  transformIgnorePatterns: ['/node_modules/(?!rt-analytics/)'],
```

- [ ] **Step 3: Verify**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all PASS, including `analytics-storage.test.ts` (cookieless never reads storage) and `analytics-provider.test.tsx`.

- [ ] **Step 4: Commit and open the PR**

```bash
git add package.json package-lock.json src/app/api/a/route.ts src/lib/analytics.ts src/components/Analytics.tsx jest.config.ts src/__tests__/api-a-route.test.ts
git commit -m "chore: rt-analytics 0.2.0 (ignore link, allowedAppIds, cookieless flag)"
git push -u origin chore/rt-analytics-0.2.0
gh pr create --fill
```
Merge only with Robin's OK.

---

### Task 14: Production changes for wetter-in-kalender (each one confirmed with Robin first)

- [ ] **Step 1:** Generate the key into the existing gitignored secrets file, never print it into the chat:
  ```bash
  umask 077
  printf 'ANALYTICS_IGNORE_KEY=%s\n' "$(openssl rand -hex 16)" >> ~/projects/rt-analytics/.env.analytics
  ```
  Check first that `.env.analytics` is still listed in `~/projects/rt-analytics/.gitignore`. Then, from `~/projects/dwd-wetter-in-calendar`, add it to Vercel as a sensitive variable for **Production only**:
  ```bash
  grep '^ANALYTICS_IGNORE_KEY=' ~/projects/rt-analytics/.env.analytics | cut -d= -f2 | tr -d '\n' \
    | vercel env add ANALYTICS_IGNORE_KEY production --sensitive
  ```
  Redeploy production (the PR merge from Task 13 does that if it happens after this step). Robin reads the key from `.env.analytics` himself for Step 3.
- [ ] **Step 2:** Add the WAF rate-limit rule on the dwd Vercel project: path equals `/api/a`, fixed window 60 s, 120 requests, key IP, action default (429). Publish the firewall change.
- [ ] **Step 3:** Robin opens `https://www.wetter-in-kalender.de/api/a?ignore=<key>` in each real browser app on each device (Mac, Windows, iPhone: Safari and Chrome separately; Home Screen app if used).
- [ ] **Step 4:** Robin checks each browser: desktop DevTools shows `x-rta: ignored` on `/api/a`; on any device, reopening the link says "already excluded". The moment the last browser is done (UTC) is the **cutoff**.

---

### Task 15: Fresh start in BigQuery (confirmed with Robin)

- [ ] **Step 1: Look first.** Run (with the cutoff filled in):
```bash
bq query --use_legacy_sql=false --project_id=robin-thues '
  SELECT app_id, COUNT(*) AS n, MIN(timestamp) AS first, MAX(timestamp) AS last
  FROM `robin-thues.analytics.events`
  WHERE timestamp < TIMESTAMP("<CUTOFF_UTC>")
  GROUP BY app_id'
```
Expected: only `wetter-in-kalender`. Show the result to Robin. If other app ids show up, stop and discuss.

- [ ] **Step 2: Delete after Robin's OK.**
```bash
bq query --use_legacy_sql=false --project_id=robin-thues '
  DELETE FROM `robin-thues.analytics.events`
  WHERE timestamp < TIMESTAMP("<CUTOFF_UTC>")'
```
No wait is needed (gRPC Storage Write API rows can be deleted right away). If BigQuery answers with a recent-write error, wait 30 minutes and retry. A few events with older client timestamps that arrive after the cutoff are deleted too; accepted as lost.

- [ ] **Step 3: Check.** Re-run Step 1. Expected: no rows. Then update the project memory (`next-steps-gcp-publish.md`): 0.2.0 live, follow-ups 1, 2 and 6 done.
