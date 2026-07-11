# rt-analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public npm package `rt-analytics` that captures pageviews, sessions, custom events, Web Vitals and JS errors from Next.js apps into BigQuery, at $0, with consent-gated identity.

**Architecture:** Browser SDK (framework-agnostic core + React layer) batches events to a Next.js route handler shipped by the package (`POST /api/a`, same origin). The handler validates, enriches (geo header, UA parse, cookieless daily hash) and writes to BigQuery via the **Storage Write API default stream** (free tier). A scripted, idempotent GCP setup creates dataset/table/views/service account. Spec: `docs/superpowers/specs/2026-07-11-rt-analytics-design.md`.

**Tech Stack:** TypeScript (strict, ESM), tsup, Vitest (+happy-dom, @testing-library/react), `web-vitals`, `@google-cloud/bigquery-storage` (runtime), `@google-cloud/bigquery` + `tsx` (dev, setup script), React 19 / Next.js (peer).

## Global Constraints

- $0 rule: BigQuery writes ONLY via Storage Write API default stream. Never `tabledata.insertAll` (paid).
- Runtime dependencies: exactly `web-vitals` and `@google-cloud/bigquery-storage`. Everything else dev or peer.
- ESM only, TypeScript strict, Node >= 20. Relative imports inside `src/` use `.js` extensions (ESM).
- Auto-event names are `$`-prefixed: `$pageview`, `$session_start`, `$web_vital`, `$error`, `$identify`, `$consent`.
- Browser storage keys: `rta_consent`, `rta_vid` (localStorage), `rta_sid`, `rta_sla` (sessionStorage). No storage writes unless consent is `accepted` (exception: `rta_consent` itself, written only on explicit accept/decline).
- Ingestion defaults: endpoint `/api/a`, body cap 50 000 bytes, batch cap 25 events, flush every 5 s or 10 events, session timeout 30 min. Invalid input → silent `202`.
- Env vars consumed by apps: `ANALYTICS_GCP_CREDENTIALS` (service-account key JSON, one line), `ANALYTICS_DAILY_SALT`.
- BigQuery: dataset `analytics` (location `EU`), table `events` partitioned by `DATE(timestamp)`, clustered by `app_id, event_name`.
- Package exports: `.`, `./react`, `./next`, `./next/client` (the extra `next/client` export exists because `"use client"` must not appear in the server handler bundle).
- Dependency versions in Task 1 are minimums from planning time; if `npm install` rejects one, use `@latest`.
- Every commit message ends with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (omitted from snippets below for brevity — always add it).

## File Map

```
package.json  tsconfig.json  tsup.config.ts  vitest.config.ts  .gitignore  LICENSE  README.md
src/index.ts                     — core public export
src/test-utils.ts                — fakeStorage() helper (tests only)
src/core/types.ts                — shared types (AnalyticsEvent, Batch, config)
src/core/version.ts              — SDK_VERSION constant
src/core/consent.ts|.test.ts     — ConsentManager
src/core/visitor.ts|.test.ts     — VisitorManager
src/core/session.ts|.test.ts     — SessionManager
src/core/queue.ts|.test.ts       — EventQueue + Transport
src/core/webvitals.ts            — setupWebVitals
src/core/errors.ts|.test.ts      — setupErrorCapture
src/core/analytics.ts|.test.ts   — createAnalytics factory
src/react/provider.tsx|.test.tsx — AnalyticsProvider + useAnalytics
src/react/consent-banner.tsx|.test.tsx
src/react/index.ts
src/next/validate.ts|.test.ts    — batch validation
src/next/enrich.ts|.test.ts      — UA parse, bot filter, daily hash
src/next/bigquery-writer.ts|.test.ts
src/next/handler.ts|.test.ts     — createAnalyticsHandler
src/next/index.ts
src/next/client/pageview-tracker.tsx|.test.tsx
src/next/client/index.ts
sql/views/{identity_map,sessions,daily_stats}.sql
sql/templates/{funnel,retention,web_vitals,errors,delete_visitor}.sql
scripts/setup-gcp.ts
example/                         — minimal Next.js playground app
```

---

### Task 1: Project scaffolding & toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `.gitignore`, `LICENSE`, `src/index.ts`, `src/core/version.ts`, `src/react/index.ts`, `src/next/index.ts`, `src/next/client/index.ts`, `src/smoke.test.ts`

**Interfaces:**
- Produces: build/test toolchain; `SDK_VERSION` constant used by Task 5/6.

- [ ] **Step 1: Write config files**

`package.json`:

```json
{
  "name": "rt-analytics",
  "version": "0.1.0",
  "description": "Self-owned, free web analytics for Next.js apps on Vercel, backed by BigQuery",
  "license": "MIT",
  "type": "module",
  "sideEffects": false,
  "engines": { "node": ">=20" },
  "files": ["dist"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./react": { "types": "./dist/react/index.d.ts", "import": "./dist/react/index.js" },
    "./next": { "types": "./dist/next/index.d.ts", "import": "./dist/next/index.js" },
    "./next/client": { "types": "./dist/next/client/index.d.ts", "import": "./dist/next/client/index.js" }
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "setup:gcp": "tsx scripts/setup-gcp.ts",
    "prepare": "tsup"
  },
  "dependencies": {
    "@google-cloud/bigquery-storage": "^4.1.0",
    "web-vitals": "^4.2.0"
  },
  "peerDependencies": { "next": ">=14", "react": ">=18" },
  "peerDependenciesMeta": { "next": { "optional": true }, "react": { "optional": true } },
  "devDependencies": {
    "@google-cloud/bigquery": "^7.9.0",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "happy-dom": "^15.11.0",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tsup": "^8.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "scripts", "tsup.config.ts", "vitest.config.ts"]
}
```

`tsup.config.ts` (two configs: client-directive entries get the banner; second config must NOT clean):

```ts
import { defineConfig } from "tsup";

const shared = {
  format: ["esm"] as const,
  dts: true,
  sourcemap: true,
  external: ["react", "next", "@google-cloud/bigquery-storage", "rt-analytics/react"],
};

export default defineConfig([
  {
    ...shared,
    entry: { index: "src/index.ts", "next/index": "src/next/index.ts" },
    clean: true,
  },
  {
    ...shared,
    entry: { "react/index": "src/react/index.ts", "next/client/index": "src/next/client/index.ts" },
    clean: false,
    banner: { js: '"use client";' },
  },
]);
```

`vitest.config.ts` (alias lets tests resolve the package self-reference used by `next/client`):

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "rt-analytics/react": fileURLToPath(new URL("./src/react/index.ts", import.meta.url)),
    },
  },
  test: { environment: "node" },
});
```

`.gitignore`:

```
node_modules/
dist/
*.tsbuildinfo
key.json
.env*
example/.next/
example/node_modules/
```

`LICENSE`: standard MIT text, copyright `2026 Robin Thues`.

- [ ] **Step 2: Write placeholder entry points and smoke test**

`src/core/version.ts`:

```ts
export const SDK_VERSION = "0.1.0";
```

`src/index.ts`:

```ts
export { SDK_VERSION } from "./core/version.js";
```

`src/react/index.ts`, `src/next/index.ts`, `src/next/client/index.ts` (identical placeholder for now):

```ts
export {};
```

`src/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SDK_VERSION } from "./index.js";

describe("toolchain", () => {
  it("resolves the core entry", () => {
    expect(SDK_VERSION).toBe("0.1.0");
  });
});
```

- [ ] **Step 3: Install and verify**

Run: `npm install` (expect success; if a pinned version 404s, `npm install <pkg>@latest` for that package)
Run: `npm test` — expect 1 passing test.
Run: `npm run build` — expect `dist/index.js`, `dist/next/index.js`, `dist/react/index.js`, `dist/next/client/index.js` plus `.d.ts` files.
Run: `head -1 dist/react/index.js` — expect `"use client";`. `head -1 dist/next/index.js` — expect NO `"use client"`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold rt-analytics toolchain (tsup, vitest, exports)"
```

---

### Task 2: Core types + ConsentManager

**Files:**
- Create: `src/core/types.ts`, `src/core/consent.ts`, `src/test-utils.ts`
- Test: `src/core/consent.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Produces: all core types below (used verbatim by every later task); `class ConsentManager { constructor(storage: Storage | null); get(): ConsentState; accept(): void; decline(): void; onChange(fn: (s: ConsentState) => void): () => void }`; `fakeStorage(): Storage` test helper.

- [ ] **Step 1: Write types (no test needed — types only)**

`src/core/types.ts`:

```ts
export type ConsentState = "pending" | "accepted" | "declined";

export interface AnalyticsEvent {
  eventId: string;
  name: string;
  ts: string; // ISO 8601
  sessionId: string;
  visitorId: string | null;
  userId: string | null;
  pagePath: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  viewportW: number | null;
  viewportH: number | null;
  props: Record<string, unknown>;
}

export interface Batch {
  appId: string;
  sdkVersion: string;
  consentState: ConsentState;
  events: AnalyticsEvent[];
}

export interface AnalyticsConfig {
  appId: string;
  /** Ingestion endpoint, default "/api/a" */
  endpoint?: string;
  /** Default 5000 */
  flushIntervalMs?: number;
  /** Default 10 */
  maxBatchSize?: number;
  /** Default true */
  captureWebVitals?: boolean;
  /** Default true */
  captureErrors?: boolean;
}

export type EventMap = Record<string, Record<string, unknown>>;
```

`src/test-utils.ts`:

```ts
export function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}
```

- [ ] **Step 2: Write the failing test**

`src/core/consent.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ConsentManager } from "./consent.js";
import { fakeStorage } from "../test-utils.js";

describe("ConsentManager", () => {
  it("defaults to pending and stores nothing until a choice is made", () => {
    const storage = fakeStorage();
    const c = new ConsentManager(storage);
    expect(c.get()).toBe("pending");
    expect(storage.length).toBe(0);
  });

  it("persists accept and decline", () => {
    const storage = fakeStorage();
    new ConsentManager(storage).accept();
    expect(new ConsentManager(storage).get()).toBe("accepted");
    new ConsentManager(storage).decline();
    expect(new ConsentManager(storage).get()).toBe("declined");
  });

  it("treats garbage stored values as pending", () => {
    const storage = fakeStorage();
    storage.setItem("rta_consent", "banana");
    expect(new ConsentManager(storage).get()).toBe("pending");
  });

  it("notifies listeners and supports unsubscribe", () => {
    const c = new ConsentManager(fakeStorage());
    const fn = vi.fn();
    const off = c.onChange(fn);
    c.accept();
    expect(fn).toHaveBeenCalledWith("accepted");
    off();
    c.decline();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("works with null storage (SSR)", () => {
    const c = new ConsentManager(null);
    expect(c.get()).toBe("pending");
    expect(() => c.accept()).not.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/core/consent.test.ts`
Expected: FAIL — cannot resolve `./consent.js`.

- [ ] **Step 4: Implement**

`src/core/consent.ts`:

```ts
import type { ConsentState } from "./types.js";

const KEY = "rta_consent";

export class ConsentManager {
  private listeners = new Set<(state: ConsentState) => void>();

  constructor(private storage: Storage | null) {}

  get(): ConsentState {
    const raw = this.storage?.getItem(KEY);
    return raw === "accepted" || raw === "declined" ? raw : "pending";
  }

  accept(): void {
    this.set("accepted");
  }

  decline(): void {
    this.set("declined");
  }

  onChange(fn: (state: ConsentState) => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private set(state: ConsentState): void {
    this.storage?.setItem(KEY, state);
    for (const fn of this.listeners) fn(state);
  }
}
```

Append to `src/index.ts`:

```ts
export type { AnalyticsConfig, AnalyticsEvent, Batch, ConsentState, EventMap } from "./core/types.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/core/consent.test.ts` — expect 5 passing. Then `npm run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(core): shared types and consent state machine"
```

---

### Task 3: VisitorManager

**Files:**
- Create: `src/core/visitor.ts`
- Test: `src/core/visitor.test.ts`

**Interfaces:**
- Consumes: `ConsentState` from `./types.js`.
- Produces: `class VisitorManager { constructor(storage: Storage | null); getId(consent: ConsentState): string | null; clear(): void }`.

- [ ] **Step 1: Write the failing test**

`src/core/visitor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { VisitorManager } from "./visitor.js";
import { fakeStorage } from "../test-utils.js";

describe("VisitorManager", () => {
  it("returns null and stores nothing without accepted consent", () => {
    const storage = fakeStorage();
    const v = new VisitorManager(storage);
    expect(v.getId("pending")).toBeNull();
    expect(v.getId("declined")).toBeNull();
    expect(storage.length).toBe(0);
  });

  it("creates a stable persistent id once accepted", () => {
    const storage = fakeStorage();
    const v = new VisitorManager(storage);
    const id = v.getId("accepted");
    expect(id).toBeTruthy();
    expect(v.getId("accepted")).toBe(id);
    expect(new VisitorManager(storage).getId("accepted")).toBe(id);
  });

  it("clear() removes the stored id so a new one is generated", () => {
    const storage = fakeStorage();
    const v = new VisitorManager(storage);
    const first = v.getId("accepted");
    v.clear();
    expect(v.getId("accepted")).not.toBe(first);
  });

  it("handles null storage", () => {
    const v = new VisitorManager(null);
    expect(v.getId("accepted")).toBeNull();
    expect(() => v.clear()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/visitor.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement**

`src/core/visitor.ts`:

```ts
import type { ConsentState } from "./types.js";

const KEY = "rta_vid";

export class VisitorManager {
  constructor(private storage: Storage | null) {}

  getId(consent: ConsentState): string | null {
    if (consent !== "accepted" || !this.storage) return null;
    let id = this.storage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      this.storage.setItem(KEY, id);
    }
    return id;
  }

  clear(): void {
    this.storage?.removeItem(KEY);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/visitor.test.ts` — expect 4 passing.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): consent-gated visitor id manager"
```

---

### Task 4: SessionManager

**Files:**
- Create: `src/core/session.ts`
- Test: `src/core/session.test.ts`

**Interfaces:**
- Consumes: `ConsentState`.
- Produces: `interface SessionTouch { id: string; isNew: boolean }`; `class SessionManager { constructor(storage: Storage | null, now?: () => number); touch(consent: ConsentState): SessionTouch; reset(): void }`. 30-min inactivity timeout. Without accepted consent the session lives in memory only; with consent it persists in the given (session)storage. A consent transition starts a fresh session (documented behavior).

- [ ] **Step 1: Write the failing test**

`src/core/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SessionManager } from "./session.js";
import { fakeStorage } from "../test-utils.js";

const MIN = 60_000;

describe("SessionManager", () => {
  it("starts a new session on first touch, reuses it within 30 min", () => {
    let t = 0;
    const s = new SessionManager(null, () => t);
    const first = s.touch("pending");
    expect(first.isNew).toBe(true);
    t += 29 * MIN;
    const second = s.touch("pending");
    expect(second).toEqual({ id: first.id, isNew: false });
  });

  it("rotates the session after 30 min of inactivity", () => {
    let t = 0;
    const s = new SessionManager(null, () => t);
    const first = s.touch("pending");
    t += 31 * MIN;
    const second = s.touch("pending");
    expect(second.isNew).toBe(true);
    expect(second.id).not.toBe(first.id);
  });

  it("persists the session in storage when consent is accepted", () => {
    let t = 0;
    const storage = fakeStorage();
    const a = new SessionManager(storage, () => t);
    const first = a.touch("accepted");
    // Simulates a reload: a fresh manager over the same sessionStorage.
    const b = new SessionManager(storage, () => t);
    expect(b.touch("accepted")).toEqual({ id: first.id, isNew: false });
  });

  it("does not write storage without accepted consent", () => {
    const storage = fakeStorage();
    new SessionManager(storage, () => 0).touch("declined");
    expect(storage.length).toBe(0);
  });

  it("reset() forgets the current session", () => {
    let t = 0;
    const storage = fakeStorage();
    const s = new SessionManager(storage, () => t);
    const first = s.touch("accepted");
    s.reset();
    const second = s.touch("accepted");
    expect(second.isNew).toBe(true);
    expect(second.id).not.toBe(first.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/session.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement**

`src/core/session.ts`:

```ts
import type { ConsentState } from "./types.js";

const TIMEOUT_MS = 30 * 60 * 1000;
const ID_KEY = "rta_sid";
const ACTIVITY_KEY = "rta_sla";

export interface SessionTouch {
  id: string;
  isNew: boolean;
}

export class SessionManager {
  private memId: string | null = null;
  private memLast = 0;

  constructor(
    private storage: Storage | null,
    private now: () => number = Date.now,
  ) {}

  touch(consent: ConsentState): SessionTouch {
    const t = this.now();
    const persisted = consent === "accepted" ? this.storage : null;
    let id = persisted ? persisted.getItem(ID_KEY) : this.memId;
    const last = persisted ? Number(persisted.getItem(ACTIVITY_KEY) ?? 0) : this.memLast;
    const isNew = !id || t - last > TIMEOUT_MS;
    if (isNew) id = crypto.randomUUID();
    if (persisted) {
      persisted.setItem(ID_KEY, id as string);
      persisted.setItem(ACTIVITY_KEY, String(t));
    } else {
      this.memId = id as string;
      this.memLast = t;
    }
    return { id: id as string, isNew };
  }

  reset(): void {
    this.memId = null;
    this.memLast = 0;
    this.storage?.removeItem(ID_KEY);
    this.storage?.removeItem(ACTIVITY_KEY);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/session.test.ts` — expect 5 passing.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): session manager with 30-min timeout and consent-gated persistence"
```

---

### Task 5: EventQueue + Transport

**Files:**
- Create: `src/core/queue.ts`
- Test: `src/core/queue.test.ts`

**Interfaces:**
- Consumes: `AnalyticsEvent`, `Batch`, `ConsentState`.
- Produces:
  - `interface BatchMeta { appId: string; sdkVersion: string; consentState: ConsentState }`
  - `interface Transport { send(url: string, body: string, useBeacon: boolean): void }`
  - `const fetchTransport: Transport` (fetch keepalive; `navigator.sendBeacon` when `useBeacon`)
  - `class EventQueue { constructor(opts: { endpoint: string; flushIntervalMs: number; maxBatchSize: number; transport: Transport; getMeta: () => BatchMeta }); enqueue(e: AnalyticsEvent): void; flush(useBeacon?: boolean): void }`

- [ ] **Step 1: Write the failing test**

`src/core/queue.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventQueue, type Transport } from "./queue.js";
import type { AnalyticsEvent, Batch } from "./types.js";

function ev(name: string): AnalyticsEvent {
  return {
    eventId: crypto.randomUUID(), name, ts: new Date().toISOString(),
    sessionId: "s1", visitorId: null, userId: null, pagePath: "/", referrer: null,
    utmSource: null, utmMedium: null, utmCampaign: null, viewportW: null, viewportH: null, props: {},
  };
}

describe("EventQueue", () => {
  const sent: { url: string; batch: Batch; beacon: boolean }[] = [];
  const transport: Transport = {
    send: (url, body, beacon) => void sent.push({ url, batch: JSON.parse(body), beacon }),
  };
  const makeQueue = () =>
    new EventQueue({
      endpoint: "/api/a", flushIntervalMs: 5000, maxBatchSize: 3, transport,
      getMeta: () => ({ appId: "test", sdkVersion: "0.1.0", consentState: "pending" }),
    });

  beforeEach(() => {
    sent.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("flushes when maxBatchSize is reached", () => {
    const q = makeQueue();
    q.enqueue(ev("a")); q.enqueue(ev("b"));
    expect(sent).toHaveLength(0);
    q.enqueue(ev("c"));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.batch.events.map((e) => e.name)).toEqual(["a", "b", "c"]);
    expect(sent[0]!.batch.appId).toBe("test");
  });

  it("flushes on the interval timer", () => {
    const q = makeQueue();
    q.enqueue(ev("a"));
    vi.advanceTimersByTime(5000);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.batch.events).toHaveLength(1);
  });

  it("manual flush(true) uses the beacon path and empties the buffer", () => {
    const q = makeQueue();
    q.enqueue(ev("a"));
    q.flush(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.beacon).toBe(true);
    q.flush();
    expect(sent).toHaveLength(1); // nothing left to send
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/queue.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement**

`src/core/queue.ts`:

```ts
import type { AnalyticsEvent, Batch, ConsentState } from "./types.js";

export interface BatchMeta {
  appId: string;
  sdkVersion: string;
  consentState: ConsentState;
}

export interface Transport {
  send(url: string, body: string, useBeacon: boolean): void;
}

export const fetchTransport: Transport = {
  send(url, body, useBeacon) {
    if (useBeacon && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  },
};

export class EventQueue {
  private buffer: AnalyticsEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private opts: {
      endpoint: string;
      flushIntervalMs: number;
      maxBatchSize: number;
      transport: Transport;
      getMeta: () => BatchMeta;
    },
  ) {}

  enqueue(event: AnalyticsEvent): void {
    this.buffer.push(event);
    if (this.buffer.length >= this.opts.maxBatchSize) {
      this.flush();
      return;
    }
    if (!this.timer) {
      this.timer = setInterval(() => this.flush(), this.opts.flushIntervalMs);
    }
  }

  flush(useBeacon = false): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.buffer.length === 0) return;
    const batch: Batch = { ...this.opts.getMeta(), events: this.buffer };
    this.buffer = [];
    this.opts.transport.send(this.opts.endpoint, JSON.stringify(batch), useBeacon);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/queue.test.ts` — expect 3 passing.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): batching event queue with fetch/beacon transport"
```

---

### Task 6: createAnalytics factory

**Files:**
- Create: `src/core/analytics.ts`
- Test: `src/core/analytics.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `ConsentManager`, `VisitorManager`, `SessionManager`, `EventQueue`, `fetchTransport`, `SDK_VERSION`, core types.
- Produces (relied on by Tasks 7–9, 14):

```ts
export interface Analytics<E extends EventMap = EventMap> {
  track<K extends keyof E & string>(name: K, props: E[K]): void;
  page(): void;
  identify(userId: string): void;
  reset(): void;
  flush(useBeacon?: boolean): void;
  getConsent(): ConsentState;
  acceptConsent(): void;
  declineConsent(): void;
  onConsentChange(fn: (s: ConsentState) => void): () => void;
}
export interface AnalyticsDeps {
  localStorage?: Storage | null;
  sessionStorage?: Storage | null;
  transport?: Transport;
  now?: () => number;
}
export function createAnalytics<E extends EventMap = EventMap>(
  config: AnalyticsConfig,
  deps?: AnalyticsDeps,
): Analytics<E>;
```

Behavior: every emit touches the session; a new session prepends a `$session_start` event. `identify` sets `userId` on all subsequent events and emits `$identify`. `reset` clears user, visitor id, session. `acceptConsent`/`declineConsent` emit `$consent` with `{ state }`; declining also clears the stored visitor id. On the server without injected deps, returns an inert no-op instance. In the browser: auto-flush via beacon on `visibilitychange → hidden`; Web Vitals/error capture wired in Task 7.

- [ ] **Step 1: Write the failing test**

`src/core/analytics.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createAnalytics, type AnalyticsDeps } from "./analytics.js";
import type { Batch } from "./types.js";
import type { Transport } from "./queue.js";
import { fakeStorage } from "../test-utils.js";

describe("createAnalytics", () => {
  let batches: Batch[];
  let deps: Required<Pick<AnalyticsDeps, "localStorage" | "sessionStorage" | "transport" | "now">>;

  beforeEach(() => {
    batches = [];
    const transport: Transport = { send: (_u, body) => void batches.push(JSON.parse(body)) };
    deps = { localStorage: fakeStorage(), sessionStorage: fakeStorage(), transport, now: () => 1_750_000_000_000 };
  });

  const make = () => createAnalytics<{ game_won: { attempts: number } }>({ appId: "wordle" }, deps);

  it("emits $session_start before the first event", () => {
    const a = make();
    a.track("game_won", { attempts: 3 });
    a.flush();
    const names = batches[0]!.events.map((e) => e.name);
    expect(names).toEqual(["$session_start", "game_won"]);
    expect(batches[0]!.events[1]!.props).toEqual({ attempts: 3 });
    expect(batches[0]!.appId).toBe("wordle");
  });

  it("keeps visitorId null before consent, sets it after accept", () => {
    const a = make();
    a.page();
    a.flush();
    expect(batches[0]!.events.every((e) => e.visitorId === null)).toBe(true);
    a.acceptConsent();
    a.page();
    a.flush();
    const last = batches.at(-1)!;
    expect(last.consentState).toBe("accepted");
    expect(last.events.at(-1)!.visitorId).toBeTruthy();
  });

  it("emits $consent on accept and decline, and decline clears the visitor id", () => {
    const a = make();
    a.acceptConsent();
    a.page();
    a.declineConsent();
    a.page();
    a.flush();
    const all = batches.flatMap((b) => b.events);
    expect(all.filter((e) => e.name === "$consent")).toHaveLength(2);
    expect(all.at(-1)!.visitorId).toBeNull();
    expect(deps.localStorage.getItem("rta_vid")).toBeNull();
  });

  it("identify stamps userId on subsequent events; reset clears it", () => {
    const a = make();
    a.identify("user-42");
    a.page();
    a.reset();
    a.page();
    a.flush();
    const all = batches.flatMap((b) => b.events);
    expect(all.find((e) => e.name === "$identify")!.userId).toBe("user-42");
    expect(all.at(-1)!.userId).toBeNull();
  });

  it("returns an inert no-op instance on the server (no deps)", () => {
    const a = createAnalytics({ appId: "x" });
    expect(() => {
      a.track("anything", {});
      a.flush();
    }).not.toThrow();
    expect(a.getConsent()).toBe("pending");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/analytics.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement**

`src/core/analytics.ts`:

```ts
import { ConsentManager } from "./consent.js";
import { VisitorManager } from "./visitor.js";
import { SessionManager } from "./session.js";
import { EventQueue, fetchTransport, type Transport } from "./queue.js";
import { SDK_VERSION } from "./version.js";
import type { AnalyticsConfig, AnalyticsEvent, ConsentState, EventMap } from "./types.js";

export interface Analytics<E extends EventMap = EventMap> {
  track<K extends keyof E & string>(name: K, props: E[K]): void;
  page(): void;
  identify(userId: string): void;
  reset(): void;
  flush(useBeacon?: boolean): void;
  getConsent(): ConsentState;
  acceptConsent(): void;
  declineConsent(): void;
  onConsentChange(fn: (s: ConsentState) => void): () => void;
}

export interface AnalyticsDeps {
  localStorage?: Storage | null;
  sessionStorage?: Storage | null;
  transport?: Transport;
  now?: () => number;
}

function noop(): Analytics<never> {
  return {
    track: () => {}, page: () => {}, identify: () => {}, reset: () => {}, flush: () => {},
    getConsent: () => "pending", acceptConsent: () => {}, declineConsent: () => {},
    onConsentChange: () => () => {},
  } as unknown as Analytics<never>;
}

export function createAnalytics<E extends EventMap = EventMap>(
  config: AnalyticsConfig,
  deps: AnalyticsDeps = {},
): Analytics<E> {
  const isBrowser = typeof window !== "undefined";
  if (!isBrowser && deps.transport === undefined) return noop() as Analytics<E>;

  const ls = deps.localStorage !== undefined ? deps.localStorage : isBrowser ? window.localStorage : null;
  const ss = deps.sessionStorage !== undefined ? deps.sessionStorage : isBrowser ? window.sessionStorage : null;
  const now = deps.now ?? Date.now;

  const consent = new ConsentManager(ls);
  const visitor = new VisitorManager(ls);
  const session = new SessionManager(ss, now);
  const queue = new EventQueue({
    endpoint: config.endpoint ?? "/api/a",
    flushIntervalMs: config.flushIntervalMs ?? 5000,
    maxBatchSize: config.maxBatchSize ?? 10,
    transport: deps.transport ?? fetchTransport,
    getMeta: () => ({ appId: config.appId, sdkVersion: SDK_VERSION, consentState: consent.get() }),
  });

  let userId: string | null = null;

  function buildEvent(name: string, props: Record<string, unknown>, sessionId: string, state: ConsentState): AnalyticsEvent {
    const url = isBrowser ? new URL(window.location.href) : null;
    return {
      eventId: crypto.randomUUID(),
      name,
      ts: new Date(now()).toISOString(),
      sessionId,
      visitorId: visitor.getId(state),
      userId,
      pagePath: url?.pathname ?? "",
      referrer: isBrowser && document.referrer ? document.referrer : null,
      utmSource: url?.searchParams.get("utm_source") ?? null,
      utmMedium: url?.searchParams.get("utm_medium") ?? null,
      utmCampaign: url?.searchParams.get("utm_campaign") ?? null,
      viewportW: isBrowser ? window.innerWidth : null,
      viewportH: isBrowser ? window.innerHeight : null,
      props,
    };
  }

  function emit(name: string, props: Record<string, unknown>): void {
    const state = consent.get();
    const s = session.touch(state);
    if (s.isNew) queue.enqueue(buildEvent("$session_start", {}, s.id, state));
    queue.enqueue(buildEvent(name, props, s.id, state));
  }

  consent.onChange((state) => {
    if (state === "declined") visitor.clear();
    emit("$consent", { state });
  });

  if (isBrowser) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") queue.flush(true);
    });
  }

  const analytics: Analytics<E> = {
    track: (name, props) => emit(name, (props ?? {}) as Record<string, unknown>),
    page: () => emit("$pageview", {}),
    identify: (uid) => {
      userId = uid;
      emit("$identify", {});
    },
    reset: () => {
      userId = null;
      visitor.clear();
      session.reset();
    },
    flush: (useBeacon = false) => queue.flush(useBeacon),
    getConsent: () => consent.get(),
    acceptConsent: () => consent.accept(),
    declineConsent: () => consent.decline(),
    onConsentChange: (fn) => consent.onChange(fn),
  };
  return analytics;
}
```

Replace `src/index.ts` content with:

```ts
export { SDK_VERSION } from "./core/version.js";
export { createAnalytics, type Analytics, type AnalyticsDeps } from "./core/analytics.js";
export type { Transport } from "./core/queue.js";
export type { AnalyticsConfig, AnalyticsEvent, Batch, ConsentState, EventMap } from "./core/types.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/analytics.test.ts` — expect 5 passing. Then `npm test` (all suites) and `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): createAnalytics factory with sessions, consent and identify"
```

---

### Task 7: Auto-capture — Web Vitals & errors

**Files:**
- Create: `src/core/webvitals.ts`, `src/core/errors.ts`
- Test: `src/core/errors.test.ts`
- Modify: `src/core/analytics.ts` (wire up in browser)

**Interfaces:**
- Produces: `setupWebVitals(report: (name: string, props: Record<string, unknown>) => void): void`; `setupErrorCapture(report: (name: string, props: Record<string, unknown>) => void): () => void` (returns teardown). Wired inside `createAnalytics` only when `isBrowser` and the respective config flag is not `false`.

- [ ] **Step 1: Write the failing test**

`src/core/errors.test.ts` (happy-dom gives us `window`):

```ts
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { setupErrorCapture } from "./errors.js";

describe("setupErrorCapture", () => {
  it("reports window error events truncated to 500 chars", () => {
    const report = vi.fn();
    const teardown = setupErrorCapture(report);
    window.dispatchEvent(new ErrorEvent("error", { message: "x".repeat(600), filename: "app.js", lineno: 7 }));
    expect(report).toHaveBeenCalledWith("$error", {
      message: "x".repeat(500),
      source: "app.js",
      line: 7,
    });
    teardown();
    window.dispatchEvent(new ErrorEvent("error", { message: "after" }));
    expect(report).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/errors.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement**

`src/core/errors.ts`:

```ts
type Report = (name: string, props: Record<string, unknown>) => void;

export function setupErrorCapture(report: Report): () => void {
  const onError = (e: ErrorEvent) =>
    report("$error", {
      message: String(e.message ?? "").slice(0, 500),
      source: e.filename || null,
      line: e.lineno ?? null,
    });
  const onRejection = (e: PromiseRejectionEvent) =>
    report("$error", {
      message: String(e.reason ?? "").slice(0, 500),
      source: "unhandledrejection",
      line: null,
    });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
```

`src/core/webvitals.ts` (thin wiring over `web-vitals`; no unit test — the logic is one callback):

```ts
import { onCLS, onINP, onLCP, type Metric } from "web-vitals";

type Report = (name: string, props: Record<string, unknown>) => void;

export function setupWebVitals(report: Report): void {
  const handler = (metric: Metric) =>
    report("$web_vital", { metric: metric.name, value: metric.value, rating: metric.rating });
  onCLS(handler);
  onINP(handler);
  onLCP(handler);
}
```

In `src/core/analytics.ts`, add imports and extend the existing `if (isBrowser) { ... }` block:

```ts
import { setupErrorCapture } from "./errors.js";
import { setupWebVitals } from "./webvitals.js";
```

```ts
  if (isBrowser) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") queue.flush(true);
    });
    if (config.captureWebVitals !== false) setupWebVitals(emit);
    if (config.captureErrors !== false) setupErrorCapture(emit);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — all suites pass (existing analytics tests still run in node where the browser block is skipped).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): auto-capture web vitals and unhandled errors"
```

---

### Task 8: React — AnalyticsProvider + useAnalytics

**Files:**
- Create: `src/react/provider.tsx`
- Test: `src/react/provider.test.tsx`
- Modify: `src/react/index.ts`

**Interfaces:**
- Consumes: `createAnalytics`, `Analytics`, `AnalyticsConfig`, `EventMap` from `../core/*`.
- Produces (relied on by Task 9 and Task 14):

```ts
export interface AnalyticsProviderProps extends AnalyticsConfig {
  children: ReactNode;
  /** Escape hatch for tests/advanced use: supply a prebuilt instance. */
  instance?: Analytics;
}
export function AnalyticsProvider(props: AnalyticsProviderProps): JSX.Element;
export function useAnalytics<E extends EventMap = EventMap>(): Analytics<E>; // throws outside provider
```

- [ ] **Step 1: Write the failing test**

`src/react/provider.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AnalyticsProvider, useAnalytics } from "./provider.js";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/react/provider.test.tsx` — expect FAIL (module not found).

- [ ] **Step 3: Implement**

`src/react/provider.tsx`:

```tsx
import { createContext, useContext, useState, type ReactNode } from "react";
import { createAnalytics, type Analytics } from "../core/analytics.js";
import type { AnalyticsConfig, EventMap } from "../core/types.js";

const AnalyticsContext = createContext<Analytics | null>(null);

export interface AnalyticsProviderProps extends AnalyticsConfig {
  children: ReactNode;
  /** Escape hatch for tests/advanced use: supply a prebuilt instance. */
  instance?: Analytics;
}

export function AnalyticsProvider({ children, instance, ...config }: AnalyticsProviderProps) {
  const [analytics] = useState<Analytics>(() => instance ?? createAnalytics(config));
  return <AnalyticsContext.Provider value={analytics}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics<E extends EventMap = EventMap>(): Analytics<E> {
  const analytics = useContext(AnalyticsContext);
  if (!analytics) throw new Error("useAnalytics must be used inside <AnalyticsProvider>");
  return analytics as Analytics<E>;
}
```

`src/react/index.ts`:

```ts
export { AnalyticsProvider, useAnalytics, type AnalyticsProviderProps } from "./provider.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/react/provider.test.tsx` — expect 2 passing.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(react): AnalyticsProvider and useAnalytics hook"
```

---

### Task 9: React — ConsentBanner

**Files:**
- Create: `src/react/consent-banner.tsx`
- Test: `src/react/consent-banner.test.tsx`
- Modify: `src/react/index.ts`

**Interfaces:**
- Consumes: `useAnalytics` from Task 8; `ConsentState`.
- Produces: `ConsentBanner(props: ConsentBannerProps)` — renders `null` unless consent is `pending`; mounted-gate avoids hydration mismatch (server always renders null). Unstyled, class names `rta-banner`, `rta-banner-message`, `rta-banner-actions` for consumer CSS.

- [ ] **Step 1: Write the failing test**

`src/react/consent-banner.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnalyticsProvider } from "./provider.js";
import { ConsentBanner } from "./consent-banner.js";
import { createAnalytics } from "../core/analytics.js";
import { fakeStorage } from "../test-utils.js";

function make() {
  return createAnalytics(
    { appId: "t" },
    { localStorage: fakeStorage(), sessionStorage: fakeStorage(), transport: { send: () => {} } },
  );
}

describe("ConsentBanner", () => {
  afterEach(cleanup);

  it("shows while pending and hides after accept", () => {
    render(
      <AnalyticsProvider appId="t" instance={make()}>
        <ConsentBanner />
      </AnalyticsProvider>,
    );
    fireEvent.click(screen.getByText("Accept"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hides after decline and stays hidden when consent was already given", () => {
    const analytics = make();
    analytics.declineConsent();
    render(
      <AnalyticsProvider appId="t" instance={analytics}>
        <ConsentBanner />
      </AnalyticsProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("supports custom labels and message", () => {
    render(
      <AnalyticsProvider appId="t" instance={make()}>
        <ConsentBanner message="Kekse?" acceptLabel="Ja" declineLabel="Nein" />
      </AnalyticsProvider>,
    );
    expect(screen.getByText("Kekse?")).toBeTruthy();
    fireEvent.click(screen.getByText("Nein"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/react/consent-banner.test.tsx` — expect FAIL (module not found).

- [ ] **Step 3: Implement**

`src/react/consent-banner.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useAnalytics } from "./provider.js";
import type { ConsentState } from "../core/types.js";

export interface ConsentBannerProps {
  message?: string;
  acceptLabel?: string;
  declineLabel?: string;
  className?: string;
}

const DEFAULT_MESSAGE =
  "This site collects anonymous usage statistics. Allow a small identifier in your browser so returning visits can be recognized? No personal data is collected either way.";

export function ConsentBanner({
  message = DEFAULT_MESSAGE,
  acceptLabel = "Accept",
  declineLabel = "Decline",
  className,
}: ConsentBannerProps) {
  const analytics = useAnalytics();
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<ConsentState>("pending");

  useEffect(() => {
    setMounted(true);
    setState(analytics.getConsent());
    return analytics.onConsentChange(setState);
  }, [analytics]);

  if (!mounted || state !== "pending") return null;

  return (
    <div role="dialog" aria-label="Analytics consent" className={className ?? "rta-banner"}>
      <p className="rta-banner-message">{message}</p>
      <div className="rta-banner-actions">
        <button type="button" onClick={() => analytics.declineConsent()}>
          {declineLabel}
        </button>
        <button type="button" onClick={() => analytics.acceptConsent()}>
          {acceptLabel}
        </button>
      </div>
    </div>
  );
}
```

Append to `src/react/index.ts`:

```ts
export { ConsentBanner, type ConsentBannerProps } from "./consent-banner.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/react/consent-banner.test.tsx` — expect 3 passing.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(react): consent banner component"
```

---

### Task 10: Next — batch validation

**Files:**
- Create: `src/next/validate.ts`
- Test: `src/next/validate.test.ts`

**Interfaces:**
- Consumes: `AnalyticsEvent`, `Batch`, `ConsentState` from `../core/types.js`.
- Produces: `validateBatch(input: unknown): Batch | null`. Rejects (returns null): non-object, bad `appId` (`/^[a-z0-9_-]{1,32}$/i`), bad consent state, missing sdkVersion, empty or >25 events, any invalid event. Event rules: `name` matches `/^\$?[a-z0-9_]{1,64}$/i`, `eventId`/`sessionId` required strings, `ts` parseable date; strings capped at 1024 chars; `props` object ≤ 4096 bytes JSON else replaced with `{}`; unknown fields dropped.

- [ ] **Step 1: Write the failing test**

`src/next/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateBatch } from "./validate.js";

function validEvent(over: Record<string, unknown> = {}) {
  return {
    eventId: "e1", name: "$pageview", ts: "2026-07-11T10:00:00.000Z", sessionId: "s1",
    visitorId: null, userId: null, pagePath: "/x", referrer: null,
    utmSource: null, utmMedium: null, utmCampaign: null,
    viewportW: 800, viewportH: 600, props: {},
    ...over,
  };
}

function validBatch(over: Record<string, unknown> = {}) {
  return { appId: "wordle", sdkVersion: "0.1.0", consentState: "pending", events: [validEvent()], ...over };
}

describe("validateBatch", () => {
  it("accepts a valid batch", () => {
    const b = validateBatch(validBatch());
    expect(b).not.toBeNull();
    expect(b!.events[0]!.name).toBe("$pageview");
  });

  it("rejects non-objects, bad appId, bad consent, empty and oversized batches", () => {
    expect(validateBatch("nope")).toBeNull();
    expect(validateBatch(validBatch({ appId: "has spaces!" }))).toBeNull();
    expect(validateBatch(validBatch({ consentState: "maybe" }))).toBeNull();
    expect(validateBatch(validBatch({ events: [] }))).toBeNull();
    expect(validateBatch(validBatch({ events: Array(26).fill(validEvent()) }))).toBeNull();
  });

  it("rejects the whole batch when any event is invalid", () => {
    expect(validateBatch(validBatch({ events: [validEvent(), validEvent({ name: "has spaces" })] }))).toBeNull();
    expect(validateBatch(validBatch({ events: [validEvent({ ts: "not-a-date" })] }))).toBeNull();
    expect(validateBatch(validBatch({ events: [validEvent({ sessionId: 42 })] }))).toBeNull();
  });

  it("truncates long strings and drops oversized or non-object props", () => {
    const long = "p".repeat(3000);
    const b = validateBatch(validBatch({ events: [validEvent({ pagePath: long, props: { blob: "x".repeat(5000) } })] }));
    expect(b!.events[0]!.pagePath).toHaveLength(1024);
    expect(b!.events[0]!.props).toEqual({});
    const arr = validateBatch(validBatch({ events: [validEvent({ props: [1, 2] })] }));
    expect(arr!.events[0]!.props).toEqual({});
  });

  it("normalizes wrong-typed optional fields to null", () => {
    const b = validateBatch(validBatch({ events: [validEvent({ referrer: 7, viewportW: "wide" })] }));
    expect(b!.events[0]!.referrer).toBeNull();
    expect(b!.events[0]!.viewportW).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/next/validate.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement**

`src/next/validate.ts`:

```ts
import type { AnalyticsEvent, Batch, ConsentState } from "../core/types.js";

const MAX_EVENTS = 25;
const MAX_STRING = 1024;
const MAX_PROPS_BYTES = 4096;
const NAME_RE = /^\$?[a-z0-9_]{1,64}$/i;
const APP_ID_RE = /^[a-z0-9_-]{1,32}$/i;

function str(v: unknown, max = MAX_STRING): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function validateEvent(raw: unknown): AnalyticsEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const e = raw as Record<string, unknown>;
  const name = typeof e.name === "string" && NAME_RE.test(e.name) ? e.name : null;
  const eventId = str(e.eventId, 64);
  const ts = typeof e.ts === "string" && !Number.isNaN(Date.parse(e.ts)) ? e.ts : null;
  const sessionId = str(e.sessionId, 64);
  if (!name || !eventId || !ts || !sessionId) return null;

  let props: Record<string, unknown> = {};
  if (typeof e.props === "object" && e.props !== null && !Array.isArray(e.props)) {
    const json = JSON.stringify(e.props);
    if (json.length <= MAX_PROPS_BYTES) props = e.props as Record<string, unknown>;
  }

  return {
    eventId,
    name,
    ts,
    sessionId,
    visitorId: str(e.visitorId, 64),
    userId: str(e.userId, 128),
    pagePath: str(e.pagePath) ?? "",
    referrer: str(e.referrer),
    utmSource: str(e.utmSource, 128),
    utmMedium: str(e.utmMedium, 128),
    utmCampaign: str(e.utmCampaign, 128),
    viewportW: num(e.viewportW),
    viewportH: num(e.viewportH),
    props,
  };
}

export function validateBatch(input: unknown): Batch | null {
  if (typeof input !== "object" || input === null) return null;
  const b = input as Record<string, unknown>;
  const appId = typeof b.appId === "string" && APP_ID_RE.test(b.appId) ? b.appId : null;
  const consentState =
    b.consentState === "accepted" || b.consentState === "declined" || b.consentState === "pending"
      ? (b.consentState as ConsentState)
      : null;
  const sdkVersion = str(b.sdkVersion, 32);
  if (!appId || !consentState || !sdkVersion || !Array.isArray(b.events)) return null;
  if (b.events.length === 0 || b.events.length > MAX_EVENTS) return null;

  const events: AnalyticsEvent[] = [];
  for (const raw of b.events) {
    const e = validateEvent(raw);
    if (!e) return null;
    events.push(e);
  }
  return { appId, sdkVersion, consentState, events };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/next/validate.test.ts` — expect 5 passing.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(next): strict ingest batch validation"
```

---

### Task 11: Next — enrichment (UA parse, bot filter, daily hash)

**Files:**
- Create: `src/next/enrich.ts`
- Test: `src/next/enrich.test.ts`

**Interfaces:**
- Produces: `interface UAInfo { browser: string; os: string; deviceType: string }`; `parseUserAgent(ua: string): UAInfo`; `isBot(ua: string | null): boolean` (null/empty UA counts as bot); `dailyVisitorId(salt: string, ip: string, ua: string, appId: string, date: Date): string` — `"d_" + first 32 hex chars of SHA256("salt:YYYY-MM-DD:ip:ua:appId")`, rotates with the UTC date.

- [ ] **Step 1: Write the failing test**

`src/next/enrich.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dailyVisitorId, isBot, parseUserAgent } from "./enrich.js";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const FIREFOX_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0";

describe("parseUserAgent", () => {
  it("identifies common browsers, OS and device type", () => {
    expect(parseUserAgent(CHROME_MAC)).toEqual({ browser: "Chrome", os: "macOS", deviceType: "desktop" });
    expect(parseUserAgent(SAFARI_IPHONE)).toEqual({ browser: "Safari", os: "iOS", deviceType: "mobile" });
    expect(parseUserAgent(FIREFOX_WIN)).toEqual({ browser: "Firefox", os: "Windows", deviceType: "desktop" });
  });
});

describe("isBot", () => {
  it("flags bots, headless browsers, curl and missing UA", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("Mozilla/5.0 HeadlessChrome/126.0")).toBe(true);
    expect(isBot("curl/8.6.0")).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(isBot(CHROME_MAC)).toBe(false);
  });
});

describe("dailyVisitorId", () => {
  it("is deterministic within a day, differs across days/ips/apps", () => {
    const d1 = new Date("2026-07-11T08:00:00Z");
    const d1later = new Date("2026-07-11T22:00:00Z");
    const d2 = new Date("2026-07-12T08:00:00Z");
    const id = dailyVisitorId("salt", "1.2.3.4", CHROME_MAC, "wordle", d1);
    expect(id).toMatch(/^d_[0-9a-f]{32}$/);
    expect(dailyVisitorId("salt", "1.2.3.4", CHROME_MAC, "wordle", d1later)).toBe(id);
    expect(dailyVisitorId("salt", "1.2.3.4", CHROME_MAC, "wordle", d2)).not.toBe(id);
    expect(dailyVisitorId("salt", "5.6.7.8", CHROME_MAC, "wordle", d1)).not.toBe(id);
    expect(dailyVisitorId("salt", "1.2.3.4", CHROME_MAC, "phase10", d1)).not.toBe(id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/next/enrich.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement**

`src/next/enrich.ts`:

```ts
import { createHash } from "node:crypto";

export interface UAInfo {
  browser: string;
  os: string;
  deviceType: string;
}

const BOT_RE =
  /bot|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|monitor|scrape|curl|wget|python-requests|node-fetch|axios/i;

export function isBot(ua: string | null): boolean {
  return !ua || BOT_RE.test(ua);
}

export function parseUserAgent(ua: string): UAInfo {
  const browser =
    /edg\//i.test(ua) ? "Edge"
    : /opr\//i.test(ua) ? "Opera"
    : /chrome|crios/i.test(ua) ? "Chrome"
    : /firefox|fxios/i.test(ua) ? "Firefox"
    : /safari/i.test(ua) ? "Safari"
    : "Other";
  const os =
    /windows/i.test(ua) ? "Windows"
    : /android/i.test(ua) ? "Android"
    : /iphone|ipad|ipod/i.test(ua) ? "iOS"
    : /mac os/i.test(ua) ? "macOS"
    : /linux/i.test(ua) ? "Linux"
    : "Other";
  const deviceType = /ipad|tablet/i.test(ua) ? "tablet" : /mobile|iphone|android/i.test(ua) ? "mobile" : "desktop";
  return { browser, os, deviceType };
}

export function dailyVisitorId(salt: string, ip: string, ua: string, appId: string, date: Date): string {
  const day = date.toISOString().slice(0, 10);
  const hash = createHash("sha256").update(`${salt}:${day}:${ip}:${ua}:${appId}`).digest("hex");
  return `d_${hash.slice(0, 32)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/next/enrich.test.ts` — expect 3 passing.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(next): UA parsing, bot filter and daily visitor hash"
```

---

### Task 12: Next — BigQuery writer (Storage Write API)

**Files:**
- Create: `src/next/bigquery-writer.ts`
- Test: `src/next/bigquery-writer.test.ts`

**Interfaces:**
- Produces (relied on by Task 13):

```ts
export interface EventRow {
  event_id: string; app_id: string; event_name: string; timestamp: Date;
  visitor_id: string | null; session_id: string | null; user_id: string | null;
  page_path: string | null; referrer: string | null;
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
  country: string | null; browser: string | null; os: string | null; device_type: string | null;
  viewport_w: number | null; viewport_h: number | null;
  props: string | null; // JSON-serialized
  consent_state: string; sdk_version: string;
}
export interface RowWriter { write(rows: EventRow[]): Promise<void> }
export interface WriterConfig {
  projectId: string; datasetId: string; tableId: string;
  credentials: { client_email: string; private_key: string };
}
export function createBigQueryWriter(cfg: WriterConfig): RowWriter;
```

- Docs: this follows the official default-stream sample `append_rows_json_writer_default.js` in `googleapis/nodejs-bigquery-storage`. Key facts verified: `managedwriter.WriterClient`, `managedwriter.JSONWriter`, `managedwriter.DefaultStream`, `adapt.convertStorageSchemaToProto2Descriptor(writeStream.tableSchema, "root")`; JS `Date` values are accepted for TIMESTAMP columns; `appendRows(rows)` returns a pending write whose `.getResult()` resolves. `null` values must be omitted from row objects (proto2 optional fields). The connection/writer is cached at module level so warm Vercel instances reuse it; on write error the cache is dropped so the next request reconnects.

- [ ] **Step 1: Write the failing test**

`src/next/bigquery-writer.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const appendRows = vi.fn(() => ({ getResult: vi.fn().mockResolvedValue({}) }));
const getWriteStream = vi.fn().mockResolvedValue({ tableSchema: { fields: [] } });
const createStreamConnection = vi.fn().mockResolvedValue({ connected: true });

vi.mock("@google-cloud/bigquery-storage", () => ({
  adapt: { convertStorageSchemaToProto2Descriptor: vi.fn(() => ({ descriptor: true })) },
  managedwriter: {
    DefaultStream: "_default",
    WriterClient: vi.fn(function (this: Record<string, unknown>) {
      this.getWriteStream = getWriteStream;
      this.createStreamConnection = createStreamConnection;
    }),
    JSONWriter: vi.fn(function (this: Record<string, unknown>) {
      this.appendRows = appendRows;
    }),
  },
}));

import { createBigQueryWriter, type EventRow } from "./bigquery-writer.js";

function row(over: Partial<EventRow> = {}): EventRow {
  return {
    event_id: "e1", app_id: "wordle", event_name: "$pageview",
    timestamp: new Date("2026-07-11T10:00:00Z"),
    visitor_id: null, session_id: "s1", user_id: null, page_path: "/", referrer: null,
    utm_source: null, utm_medium: null, utm_campaign: null, country: "DE",
    browser: "Chrome", os: "macOS", device_type: "desktop",
    viewport_w: 800, viewport_h: 600, props: null,
    consent_state: "pending", sdk_version: "0.1.0",
    ...over,
  };
}

describe("createBigQueryWriter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("appends rows with null fields omitted and Date preserved", async () => {
    const w = createBigQueryWriter({
      projectId: "p", datasetId: "analytics", tableId: "events",
      credentials: { client_email: "sa@p.iam", private_key: "k" },
    });
    await w.write([row()]);
    expect(appendRows).toHaveBeenCalledTimes(1);
    const sent = appendRows.mock.calls[0]![0] as Record<string, unknown>[];
    expect(sent[0]!.timestamp).toBeInstanceOf(Date);
    expect("visitor_id" in sent[0]!).toBe(false);
    expect(sent[0]!.country).toBe("DE");
  });

  it("initializes the stream connection once across writes", async () => {
    const w = createBigQueryWriter({
      projectId: "p", datasetId: "analytics", tableId: "events",
      credentials: { client_email: "sa@p.iam", private_key: "k" },
    });
    await w.write([row()]);
    await w.write([row({ event_id: "e2" })]);
    expect(createStreamConnection).toHaveBeenCalledTimes(1);
    expect(appendRows).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/next/bigquery-writer.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement**

`src/next/bigquery-writer.ts`:

```ts
import { adapt, managedwriter } from "@google-cloud/bigquery-storage";

export interface EventRow {
  event_id: string;
  app_id: string;
  event_name: string;
  timestamp: Date;
  visitor_id: string | null;
  session_id: string | null;
  user_id: string | null;
  page_path: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  country: string | null;
  browser: string | null;
  os: string | null;
  device_type: string | null;
  viewport_w: number | null;
  viewport_h: number | null;
  /** JSON-serialized custom props */
  props: string | null;
  consent_state: string;
  sdk_version: string;
}

export interface RowWriter {
  write(rows: EventRow[]): Promise<void>;
}

export interface WriterConfig {
  projectId: string;
  datasetId: string;
  tableId: string;
  credentials: { client_email: string; private_key: string };
}

type JsonWriter = { appendRows(rows: Record<string, unknown>[]): { getResult(): Promise<unknown> } };

// Module-level cache: warm serverless instances reuse the stream connection.
let cachedWriter: Promise<JsonWriter> | null = null;

async function connect(cfg: WriterConfig): Promise<JsonWriter> {
  const { WriterClient, JSONWriter, DefaultStream } = managedwriter;
  const destinationTable = `projects/${cfg.projectId}/datasets/${cfg.datasetId}/tables/${cfg.tableId}`;
  const client = new WriterClient({ projectId: cfg.projectId, credentials: cfg.credentials });
  const writeStream = await client.getWriteStream({
    streamId: `${destinationTable}/streams/_default`,
    view: "FULL",
  });
  const protoDescriptor = adapt.convertStorageSchemaToProto2Descriptor(writeStream.tableSchema!, "root");
  const connection = await client.createStreamConnection({ streamId: DefaultStream, destinationTable });
  return new JSONWriter({ connection, protoDescriptor }) as unknown as JsonWriter;
}

export function createBigQueryWriter(cfg: WriterConfig): RowWriter {
  return {
    async write(rows: EventRow[]): Promise<void> {
      try {
        cachedWriter ??= connect(cfg);
        const writer = await cachedWriter;
        const clean = rows.map((r) =>
          Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)),
        );
        await writer.appendRows(clean).getResult();
      } catch (err) {
        cachedWriter = null; // force reconnect on next request
        throw err;
      }
    },
  };
}
```

Note for implementer: if the mocked constructor typing fights you, `WriterClient`/`JSONWriter` may be typed loosely — the `as unknown as JsonWriter` cast plus the local `JsonWriter` structural type keeps our surface typed without depending on the lib's generated types. If `getWriteStream`'s option shape differs in the installed version, check `node_modules/@google-cloud/bigquery-storage/build/src/managedwriter/writer_client.d.ts` and adjust — the sample name to search for is `append_rows_json_writer_default`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/next/bigquery-writer.test.ts` — expect 2 passing.

- [ ] **Step 5: Add the opt-in real-dataset integration test (skipped by default)**

Create `src/next/bigquery-writer.integration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createBigQueryWriter } from "./bigquery-writer.js";

// Opt-in: only runs when RTA_TEST_CREDENTIALS points at a key.json for a dev dataset.
// Example: RTA_TEST_CREDENTIALS=$(cat key.json) npx vitest run src/next/bigquery-writer.integration.test.ts
const raw = process.env.RTA_TEST_CREDENTIALS;

describe.skipIf(!raw)("BigQueryWriter (real dataset)", () => {
  it("writes one row to analytics.events", async () => {
    const creds = JSON.parse(raw as string) as { project_id: string; client_email: string; private_key: string };
    const writer = createBigQueryWriter({
      projectId: creds.project_id,
      datasetId: "analytics",
      tableId: "events",
      credentials: { client_email: creds.client_email, private_key: creds.private_key },
    });
    await expect(
      writer.write([
        {
          event_id: crypto.randomUUID(), app_id: "rta_integration_test", event_name: "$pageview",
          timestamp: new Date(), visitor_id: "d_test", session_id: "s-test", user_id: null,
          page_path: "/integration-test", referrer: null, utm_source: null, utm_medium: null,
          utm_campaign: null, country: null, browser: "Test", os: "Test", device_type: "desktop",
          viewport_w: null, viewport_h: null, props: null, consent_state: "pending", sdk_version: "0.1.0",
        },
      ]),
    ).resolves.toBeUndefined();
  });
});
```

Caveat: this file shares the module-level writer cache with the mocked unit test only within a single process; Vitest isolates test files by default, so no interference. Run `npm test` — the integration suite reports as skipped.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(next): BigQuery Storage Write API row writer with cached stream"
```

---

### Task 13: Next — createAnalyticsHandler

**Files:**
- Create: `src/next/handler.ts`
- Test: `src/next/handler.test.ts`
- Modify: `src/next/index.ts`

**Interfaces:**
- Consumes: `validateBatch` (Task 10), `isBot`/`parseUserAgent`/`dailyVisitorId` (Task 11), `createBigQueryWriter`/`EventRow`/`RowWriter` (Task 12).
- Produces (used by consumer apps and the example app):

```ts
export interface HandlerOptions {
  datasetId?: string;    // default "analytics"
  tableId?: string;      // default "events"
  maxBodyBytes?: number; // default 50_000
  salt?: string;         // default process.env.ANALYTICS_DAILY_SALT
  writer?: RowWriter;    // injectable for tests
  now?: () => Date;
}
export function createAnalyticsHandler(opts?: HandlerOptions): { POST(req: Request): Promise<Response> };
```

Behavior: always responds `202` with empty body (even on errors — no feedback to probing clients). Drops silently when: cross-origin `Origin` header, bot/missing UA, body too large, invalid JSON, invalid batch. Enrichment: `country` from `x-vercel-ip-country`; UA parsed once per batch; `visitor_id` falls back to `dailyVisitorId` (IP from first `x-forwarded-for` entry, else `"0.0.0.0"`); timestamps more than 48 h from server time are clamped to server time; `props` serialized to JSON string or null when empty. Credentials read lazily from `ANALYTICS_GCP_CREDENTIALS` (JSON with `project_id`, `client_email`, `private_key`); missing creds → log error, still `202`.

- [ ] **Step 1: Write the failing test**

`src/next/handler.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAnalyticsHandler } from "./handler.js";
import type { EventRow, RowWriter } from "./bigquery-writer.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const NOW = new Date("2026-07-11T12:00:00.000Z");

function batchBody(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    appId: "wordle",
    sdkVersion: "0.1.0",
    consentState: "pending",
    events: [
      {
        eventId: "e1", name: "$pageview", ts: "2026-07-11T11:59:00.000Z", sessionId: "s1",
        visitorId: null, userId: null, pagePath: "/play", referrer: null,
        utmSource: null, utmMedium: null, utmCampaign: null,
        viewportW: 800, viewportH: 600, props: { a: 1 },
      },
    ],
    ...over,
  });
}

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://wordle.example.com/api/a", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "user-agent": UA,
      origin: "https://wordle.example.com",
      "x-forwarded-for": "1.2.3.4, 10.0.0.1",
      "x-vercel-ip-country": "DE",
      ...headers,
    },
  });
}

describe("createAnalyticsHandler", () => {
  let written: EventRow[][];
  let writer: RowWriter;
  let handler: { POST(req: Request): Promise<Response> };

  beforeEach(() => {
    written = [];
    writer = { write: vi.fn(async (rows: EventRow[]) => void written.push(rows)) };
    handler = createAnalyticsHandler({ writer, salt: "test-salt", now: () => NOW });
  });

  it("writes enriched rows and returns 202", async () => {
    const res = await handler.POST(request(batchBody()));
    expect(res.status).toBe(202);
    const row = written[0]![0]!;
    expect(row).toMatchObject({
      app_id: "wordle", event_name: "$pageview", country: "DE",
      browser: "Chrome", os: "macOS", device_type: "desktop",
      page_path: "/play", consent_state: "pending", props: '{"a":1}',
    });
    expect(row.timestamp).toEqual(new Date("2026-07-11T11:59:00.000Z"));
    expect(row.visitor_id).toMatch(/^d_[0-9a-f]{32}$/); // cookieless daily hash fallback
  });

  it("keeps a client-provided visitorId (consented mode)", async () => {
    const body = JSON.parse(batchBody({ consentState: "accepted" }));
    body.events[0].visitorId = "v-persistent";
    await handler.POST(request(JSON.stringify(body)));
    expect(written[0]![0]!.visitor_id).toBe("v-persistent");
  });

  it("clamps timestamps more than 48h from server time", async () => {
    const body = JSON.parse(batchBody());
    body.events[0].ts = "1999-01-01T00:00:00.000Z";
    await handler.POST(request(JSON.stringify(body)));
    expect(written[0]![0]!.timestamp).toEqual(NOW);
  });

  it("silently drops: cross-origin, bots, oversized bodies, invalid JSON, invalid batches", async () => {
    const cases = [
      request(batchBody(), { origin: "https://evil.example.net" }),
      request(batchBody(), { "user-agent": "Googlebot/2.1" }),
      request("x".repeat(50_001)),
      request("{not json"),
      request(JSON.stringify({ appId: "wordle" })),
    ];
    for (const req of cases) {
      const res = await handler.POST(req);
      expect(res.status).toBe(202);
    }
    expect(written).toHaveLength(0);
  });

  it("returns 202 even when the writer throws", async () => {
    const failing = createAnalyticsHandler({
      writer: { write: vi.fn().mockRejectedValue(new Error("boom")) },
      salt: "s", now: () => NOW,
    });
    const res = await failing.POST(request(batchBody()));
    expect(res.status).toBe(202);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/next/handler.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement**

`src/next/handler.ts`:

```ts
import { validateBatch } from "./validate.js";
import { dailyVisitorId, isBot, parseUserAgent } from "./enrich.js";
import { createBigQueryWriter, type EventRow, type RowWriter } from "./bigquery-writer.js";

export interface HandlerOptions {
  datasetId?: string;
  tableId?: string;
  maxBodyBytes?: number;
  salt?: string;
  writer?: RowWriter;
  now?: () => Date;
}

const MAX_SKEW_MS = 48 * 60 * 60 * 1000;

function accepted(): Response {
  return new Response(null, { status: 202 });
}

export function createAnalyticsHandler(opts: HandlerOptions = {}) {
  let writer: RowWriter | null = opts.writer ?? null;

  async function POST(req: Request): Promise<Response> {
    try {
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== new URL(req.url).host) return accepted();

      const ua = req.headers.get("user-agent");
      if (isBot(ua)) return accepted();

      const text = await req.text();
      if (text.length > (opts.maxBodyBytes ?? 50_000)) return accepted();

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return accepted();
      }
      const batch = validateBatch(parsed);
      if (!batch) return accepted();

      const now = opts.now ? opts.now() : new Date();
      const uaInfo = parseUserAgent(ua as string);
      const country = req.headers.get("x-vercel-ip-country");
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
      const salt = opts.salt ?? process.env.ANALYTICS_DAILY_SALT ?? "";

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

      if (!writer) {
        const raw = process.env.ANALYTICS_GCP_CREDENTIALS;
        if (!raw) {
          console.error("rt-analytics: ANALYTICS_GCP_CREDENTIALS is not set; dropping events");
          return accepted();
        }
        const creds = JSON.parse(raw) as { project_id: string; client_email: string; private_key: string };
        writer = createBigQueryWriter({
          projectId: creds.project_id,
          datasetId: opts.datasetId ?? "analytics",
          tableId: opts.tableId ?? "events",
          credentials: { client_email: creds.client_email, private_key: creds.private_key },
        });
      }
      await writer.write(rows);
      return accepted();
    } catch (err) {
      console.error("rt-analytics ingest error:", err);
      return accepted();
    }
  }

  return { POST };
}
```

`src/next/index.ts` (replace placeholder):

```ts
export { createAnalyticsHandler, type HandlerOptions } from "./handler.js";
export type { EventRow, RowWriter, WriterConfig } from "./bigquery-writer.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/next/handler.test.ts` — expect 5 passing. Then `npm test` and `npm run typecheck` — all green.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(next): hardened ingest route handler with enrichment"
```

---

### Task 14: Next — PageviewTracker client component

**Files:**
- Create: `src/next/client/pageview-tracker.tsx`
- Test: `src/next/client/pageview-tracker.test.tsx`
- Modify: `src/next/client/index.ts`

**Interfaces:**
- Consumes: `useAnalytics` imported from the **package self-reference** `"rt-analytics/react"` (kept external in tsup so the consumer's bundler resolves it to the same module instance as their `<AnalyticsProvider>` — a relative import would bundle a duplicate React context and break `useContext`). `usePathname` from `next/navigation`.
- Produces: `PageviewTracker(): null` — fires `analytics.page()` on mount and on every pathname change.

- [ ] **Step 1: Write the failing test**

`src/next/client/pageview-tracker.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

let pathname = "/start";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { AnalyticsProvider } from "../../react/provider.js";
import { PageviewTracker } from "./pageview-tracker.js";
import { createAnalytics } from "../../core/analytics.js";
import { fakeStorage } from "../../test-utils.js";
import type { Batch } from "../../core/types.js";

describe("PageviewTracker", () => {
  afterEach(cleanup);

  it("tracks a pageview on mount and on pathname change", () => {
    const batches: Batch[] = [];
    const analytics = createAnalytics(
      { appId: "t" },
      {
        localStorage: fakeStorage(), sessionStorage: fakeStorage(),
        transport: { send: (_u, body) => void batches.push(JSON.parse(body)) },
      },
    );
    const ui = (
      <AnalyticsProvider appId="t" instance={analytics}>
        <PageviewTracker />
      </AnalyticsProvider>
    );
    const { rerender } = render(ui);
    pathname = "/next-page";
    rerender(
      <AnalyticsProvider appId="t" instance={analytics}>
        <PageviewTracker />
      </AnalyticsProvider>,
    );
    analytics.flush();
    const pageviews = batches.flatMap((b) => b.events).filter((e) => e.name === "$pageview");
    expect(pageviews).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/next/client/pageview-tracker.test.tsx` — expect FAIL (module not found).

- [ ] **Step 3: Implement**

`src/next/client/pageview-tracker.tsx`:

```tsx
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAnalytics } from "rt-analytics/react";

export function PageviewTracker(): null {
  const analytics = useAnalytics();
  const pathname = usePathname();

  useEffect(() => {
    analytics.page();
  }, [analytics, pathname]);

  return null;
}
```

`src/next/client/index.ts` (replace placeholder):

```ts
export { PageviewTracker } from "./pageview-tracker.js";
```

- [ ] **Step 4: Run tests + full build to verify**

Run: `npx vitest run src/next/client/pageview-tracker.test.tsx` — expect 1 passing.
Run: `npm run build`, then `grep -c '"use client"' dist/next/client/index.js` — expect `1`; `grep -c 'rt-analytics/react' dist/next/client/index.js` — expect ≥1 (kept external).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(next): PageviewTracker for App Router route changes"
```

---

### Task 15: SQL views/templates + GCP setup script

**Files:**
- Create: `sql/views/identity_map.sql`, `sql/views/sessions.sql`, `sql/views/daily_stats.sql`, `sql/templates/funnel.sql`, `sql/templates/retention.sql`, `sql/templates/web_vitals.sql`, `sql/templates/errors.sql`, `sql/templates/delete_visitor.sql`, `scripts/setup-gcp.ts`

**Interfaces:**
- Consumes: the `EventRow` column set from Task 12 (snake_case, exact names).
- Produces: BigQuery dataset `analytics` (EU), table `events`, three views. View SQL files use `{{PROJECT}}` and `{{DATASET}}` placeholders substituted by the script. Script is idempotent: `npm run setup:gcp [-- --project <gcp-project-id>]`, uses local `gcloud` ADC for BigQuery and shells out to `gcloud` for the service account + key.

- [ ] **Step 1: Write the SQL files**

`sql/views/identity_map.sql`:

```sql
CREATE OR REPLACE VIEW `{{PROJECT}}.{{DATASET}}.identity_map` AS
SELECT
  visitor_id,
  user_id,
  MIN(timestamp) AS first_linked_at
FROM `{{PROJECT}}.{{DATASET}}.events`
WHERE event_name = '$identify'
  AND visitor_id IS NOT NULL
  AND user_id IS NOT NULL
GROUP BY visitor_id, user_id;
```

`sql/views/sessions.sql`:

```sql
CREATE OR REPLACE VIEW `{{PROJECT}}.{{DATASET}}.sessions` AS
SELECT
  app_id,
  session_id,
  ANY_VALUE(visitor_id) AS visitor_id,
  ANY_VALUE(user_id) AS user_id,
  MIN(timestamp) AS started_at,
  MAX(timestamp) AS ended_at,
  TIMESTAMP_DIFF(MAX(timestamp), MIN(timestamp), SECOND) AS duration_s,
  COUNTIF(event_name = '$pageview') AS pageviews,
  ARRAY_AGG(IF(event_name = '$pageview', page_path, NULL) IGNORE NULLS ORDER BY timestamp ASC LIMIT 1)[SAFE_OFFSET(0)] AS entry_path,
  ARRAY_AGG(IF(event_name = '$pageview', page_path, NULL) IGNORE NULLS ORDER BY timestamp DESC LIMIT 1)[SAFE_OFFSET(0)] AS exit_path,
  ANY_VALUE(referrer) AS referrer,
  ANY_VALUE(country) AS country,
  ANY_VALUE(device_type) AS device_type,
  COUNTIF(event_name = '$pageview') <= 1 AS bounced
FROM `{{PROJECT}}.{{DATASET}}.events`
GROUP BY app_id, session_id;
```

`sql/views/daily_stats.sql`:

```sql
CREATE OR REPLACE VIEW `{{PROJECT}}.{{DATASET}}.daily_stats` AS
SELECT
  app_id,
  DATE(timestamp) AS day,
  COUNTIF(event_name = '$pageview') AS pageviews,
  COUNT(DISTINCT visitor_id) AS unique_visitors,
  COUNT(DISTINCT session_id) AS sessions,
  COUNT(DISTINCT user_id) AS identified_users
FROM `{{PROJECT}}.{{DATASET}}.events`
GROUP BY app_id, day;
```

`sql/templates/funnel.sql`:

```sql
-- Funnel: replace the three step event names and the app/date filter.
-- Counts visitors who completed each step in order within the window.
WITH per_visitor AS (
  SELECT
    visitor_id,
    MIN(IF(event_name = 'STEP_1_EVENT', timestamp, NULL)) AS t1,
    MIN(IF(event_name = 'STEP_2_EVENT', timestamp, NULL)) AS t2,
    MIN(IF(event_name = 'STEP_3_EVENT', timestamp, NULL)) AS t3
  FROM `PROJECT.analytics.events`
  WHERE app_id = 'APP_ID'
    AND DATE(timestamp) BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'
  GROUP BY visitor_id
)
SELECT
  COUNT(t1) AS step1,
  COUNTIF(t2 > t1) AS step2,
  COUNTIF(t3 > t2 AND t2 > t1) AS step3
FROM per_visitor;
```

`sql/templates/retention.sql`:

```sql
-- Weekly retention cohorts (persistent visitor ids only, i.e. consented visitors).
WITH firsts AS (
  SELECT visitor_id, DATE_TRUNC(MIN(DATE(timestamp)), WEEK(MONDAY)) AS cohort_week
  FROM `PROJECT.analytics.events`
  WHERE app_id = 'APP_ID' AND visitor_id NOT LIKE 'd_%'
  GROUP BY visitor_id
),
activity AS (
  SELECT DISTINCT visitor_id, DATE_TRUNC(DATE(timestamp), WEEK(MONDAY)) AS active_week
  FROM `PROJECT.analytics.events`
  WHERE app_id = 'APP_ID' AND visitor_id NOT LIKE 'd_%'
)
SELECT
  f.cohort_week,
  DATE_DIFF(a.active_week, f.cohort_week, WEEK) AS week_n,
  COUNT(DISTINCT a.visitor_id) AS visitors
FROM firsts f
JOIN activity a USING (visitor_id)
GROUP BY cohort_week, week_n
ORDER BY cohort_week, week_n;
```

`sql/templates/web_vitals.sql`:

```sql
-- p75 Web Vitals per app and metric over the last 28 days.
SELECT
  app_id,
  JSON_VALUE(props, '$.metric') AS metric,
  APPROX_QUANTILES(CAST(JSON_VALUE(props, '$.value') AS FLOAT64), 100)[OFFSET(75)] AS p75
FROM `PROJECT.analytics.events`
WHERE event_name = '$web_vital'
  AND DATE(timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL 28 DAY)
GROUP BY app_id, metric
ORDER BY app_id, metric;
```

`sql/templates/errors.sql`:

```sql
-- Most frequent JS errors in the last 7 days.
SELECT
  app_id,
  JSON_VALUE(props, '$.message') AS message,
  COUNT(*) AS occurrences,
  MAX(timestamp) AS last_seen
FROM `PROJECT.analytics.events`
WHERE event_name = '$error'
  AND DATE(timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY app_id, message
ORDER BY occurrences DESC
LIMIT 50;
```

`sql/templates/delete_visitor.sql`:

```sql
-- GDPR helper: delete every event of one visitor id.
DELETE FROM `PROJECT.analytics.events`
WHERE visitor_id = 'VISITOR_ID';
```

- [ ] **Step 2: Write the setup script**

`scripts/setup-gcp.ts`:

```ts
/**
 * Idempotent GCP setup for rt-analytics.
 * Usage: npm run setup:gcp [-- --project <gcp-project-id>]
 * Requires: gcloud CLI authenticated (`gcloud auth application-default login`).
 */
import { BigQuery } from "@google-cloud/bigquery";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DATASET = "analytics";
const TABLE = "events";
const LOCATION = "EU";
const SA_NAME = "rt-analytics-writer";
const KEY_FILE = "key.json";

const SCHEMA = [
  { name: "event_id", type: "STRING", mode: "REQUIRED" },
  { name: "app_id", type: "STRING", mode: "REQUIRED" },
  { name: "event_name", type: "STRING", mode: "REQUIRED" },
  { name: "timestamp", type: "TIMESTAMP", mode: "REQUIRED" },
  { name: "visitor_id", type: "STRING" },
  { name: "session_id", type: "STRING" },
  { name: "user_id", type: "STRING" },
  { name: "page_path", type: "STRING" },
  { name: "referrer", type: "STRING" },
  { name: "utm_source", type: "STRING" },
  { name: "utm_medium", type: "STRING" },
  { name: "utm_campaign", type: "STRING" },
  { name: "country", type: "STRING" },
  { name: "browser", type: "STRING" },
  { name: "os", type: "STRING" },
  { name: "device_type", type: "STRING" },
  { name: "viewport_w", type: "INT64" },
  { name: "viewport_h", type: "INT64" },
  { name: "props", type: "JSON" },
  { name: "consent_state", type: "STRING" },
  { name: "sdk_version", type: "STRING" },
];

function gcloud(...args: string[]): string {
  return execFileSync("gcloud", args, { encoding: "utf8" }).trim();
}

function resolveProject(): string {
  const flag = process.argv.indexOf("--project");
  if (flag !== -1 && process.argv[flag + 1]) return process.argv[flag + 1] as string;
  const fromConfig = gcloud("config", "get-value", "project");
  if (!fromConfig || fromConfig === "(unset)") {
    console.error("No GCP project. Pass --project <id> or run: gcloud config set project <id>");
    process.exit(1);
  }
  return fromConfig;
}

async function main(): Promise<void> {
  const projectId = resolveProject();
  console.log(`Project: ${projectId}`);
  const bq = new BigQuery({ projectId });

  // 1. Dataset
  const dataset = bq.dataset(DATASET);
  const [dsExists] = await dataset.exists();
  if (!dsExists) {
    await bq.createDataset(DATASET, { location: LOCATION });
    console.log(`Created dataset ${DATASET} (${LOCATION})`);
  } else {
    console.log(`Dataset ${DATASET} exists`);
  }

  // 2. Table
  const table = dataset.table(TABLE);
  const [tExists] = await table.exists();
  if (!tExists) {
    await dataset.createTable(TABLE, {
      schema: SCHEMA,
      timePartitioning: { type: "DAY", field: "timestamp" },
      clustering: { fields: ["app_id", "event_name"] },
    });
    console.log(`Created table ${TABLE} (partitioned by day, clustered by app_id, event_name)`);
  } else {
    console.log(`Table ${TABLE} exists`);
  }

  // 3. Views (CREATE OR REPLACE — safe upgrade path)
  const viewsDir = join(import.meta.dirname, "..", "sql", "views");
  for (const file of readdirSync(viewsDir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(viewsDir, file), "utf8")
      .replaceAll("{{PROJECT}}", projectId)
      .replaceAll("{{DATASET}}", DATASET);
    await bq.query({ query: sql, location: LOCATION });
    console.log(`Applied view ${file}`);
  }

  // 4. Service account (write-only access, scoped to the dataset)
  const saEmail = `${SA_NAME}@${projectId}.iam.gserviceaccount.com`;
  const existing = gcloud("iam", "service-accounts", "list", `--project=${projectId}`, `--filter=email:${saEmail}`, "--format=value(email)");
  if (!existing) {
    gcloud("iam", "service-accounts", "create", SA_NAME, `--project=${projectId}`, "--display-name=rt-analytics ingest writer");
    console.log(`Created service account ${saEmail}`);
  } else {
    console.log(`Service account ${saEmail} exists`);
  }

  // 5. Dataset-scoped WRITER access (equivalent to dataEditor, but only this dataset)
  const [meta] = await dataset.getMetadata();
  const access: { role?: string; userByEmail?: string }[] = meta.access ?? [];
  if (!access.some((a) => a.userByEmail === saEmail)) {
    access.push({ role: "WRITER", userByEmail: saEmail });
    await dataset.setMetadata({ access });
    console.log("Granted dataset WRITER to service account");
  } else {
    console.log("Dataset access already granted");
  }

  // 6. Key (only if key.json not present)
  if (!existsSync(KEY_FILE)) {
    gcloud("iam", "service-accounts", "keys", "create", KEY_FILE, `--iam-account=${saEmail}`, `--project=${projectId}`);
    console.log(`Created ${KEY_FILE} (gitignored)`);
  } else {
    console.log(`${KEY_FILE} already present — reusing`);
  }

  const keyOneLine = JSON.stringify(JSON.parse(readFileSync(KEY_FILE, "utf8")));
  const salt = randomBytes(16).toString("hex");

  console.log("\n=== Vercel env vars (per app; salt may be shared across apps) ===");
  console.log("ANALYTICS_GCP_CREDENTIALS:");
  console.log(keyOneLine);
  console.log("\nANALYTICS_DAILY_SALT (generated now; reuse the same value everywhere):");
  console.log(salt);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck` — passes (script is type-checked; `import.meta.dirname` needs Node 20.11+, available per engines).
Run: `npm test` — all suites still green.
Live run (`npm run setup:gcp`) is deferred to the rollout phase — do not run it during implementation without the user.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(gcp): idempotent BigQuery setup script, views and query templates"
```

---

### Task 16: Example app, README, publish prep

**Files:**
- Create: `example/package.json`, `example/next.config.ts`, `example/tsconfig.json`, `example/app/layout.tsx`, `example/app/page.tsx`, `example/app/api/a/route.ts`, `README.md`

**Interfaces:**
- Consumes: the full public API from Tasks 6, 8, 9, 13, 14 — this task is the end-to-end proof that the four exports compose.

- [ ] **Step 1: Write the example app**

`example/package.json`:

```json
{
  "name": "rt-analytics-example",
  "private": true,
  "scripts": { "dev": "next dev", "build": "next build" },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "rt-analytics": "file:.."
  }
}
```

`example/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};
export default nextConfig;
```

`example/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noEmit": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["app", "next.config.ts", "next-env.d.ts"]
}
```

`example/app/layout.tsx`:

```tsx
import { AnalyticsProvider, ConsentBanner } from "rt-analytics/react";
import { PageviewTracker } from "rt-analytics/next/client";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AnalyticsProvider appId="example">
          <PageviewTracker />
          {children}
          <ConsentBanner />
        </AnalyticsProvider>
      </body>
    </html>
  );
}
```

`example/app/page.tsx`:

```tsx
"use client";
import { useAnalytics } from "rt-analytics/react";

export default function Home() {
  const analytics = useAnalytics<{ button_clicked: { label: string } }>();
  return (
    <main>
      <h1>rt-analytics playground</h1>
      <button onClick={() => analytics.track("button_clicked", { label: "demo" })}>Track event</button>
      <button onClick={() => analytics.identify("demo-user-1")}>Identify</button>
      <button onClick={() => analytics.reset()}>Reset</button>
      <button onClick={() => analytics.flush()}>Flush now</button>
    </main>
  );
}
```

`example/app/api/a/route.ts`:

```ts
import { createAnalyticsHandler } from "rt-analytics/next";

export const { POST } = createAnalyticsHandler();
```

- [ ] **Step 2: Verify the example builds**

```bash
npm run build                      # package dist must be fresh
cd example && npm install && npm run build && cd ..
```

Expected: `next build` succeeds — proves exports resolve, `"use client"` boundaries are correct, and the handler compiles in a real App Router project.

- [ ] **Step 3: Write README.md**

Sections (write real content, concise): what it is (own your analytics, $0, BigQuery); quickstart (the three integration steps + env vars, copy-paste from example app); GCP setup (`npm run setup:gcp`, what it creates, where to paste env vars in Vercel); consent model table (pending/declined = cookieless daily hash, accepted = persistent id — and why there's no banner obligation in cookieless mode); API reference (`createAnalytics`, `track/page/identify/reset/flush`, consent methods, `AnalyticsProvider`, `ConsentBanner` props, `PageviewTracker`, `createAnalyticsHandler` options); HTTP ingestion contract (POST `/api/a`, batch JSON shape — so Go/Python SDKs can be written later); querying (bq CLI one-liner examples against `daily_stats` and `sessions`, pointer to `sql/templates/`); event name rules (`$` prefix reserved).

- [ ] **Step 4: Publish dry run**

```bash
npm run build && npm test && npm publish --dry-run
```

Expected: tarball contains `dist/**`, `README.md`, `LICENSE`, `package.json` — no `src/`, no `example/`, no `sql/` (sql stays repo-only), no `key.json`. **Actual `npm publish --access public` is a manual gate: requires the user's npm login; ask before publishing.**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "docs: example app and README; publish prep"
```

---

## Post-implementation (separate sessions, per spec rollout)

Not part of this plan's tasks — listed for continuity: run `npm run setup:gcp` with the user; `npm publish --access public` (user gate); integrate wordle-next; then a Firebase-auth app to exercise `identify()`; own dashboard app later.
