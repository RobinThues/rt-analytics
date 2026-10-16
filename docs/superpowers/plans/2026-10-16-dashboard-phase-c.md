# Dashboard Phase C (overview, explorer, funnels, secrets guide) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The three data pages of the dashboard (overview, events explorer, funnel builder with saved funnels) on top of the Phase B shell, plus the Phase B deferred fixes and the HTML guide for storing the dashboard's secrets in Chrome Password Manager.

**Architecture:** Pure query builders in `src/queries/` return `{ sql, params, types }` and share one period model: every data query reads one window `[read_from, read_to)` and labels each event or session `'cur'`, `'prev'` or NULL in SQL, so one query answers both the range and the previous period. Pure model functions (`src/overview/`, `src/explorer/`, `src/funnels/`) turn rows into view data. Pages are thin: they build a `QueryContext`, and every panel is an async server component inside its own Suspense and error boundary that calls `dataQuery()`.

**Tech Stack:** Next.js 16.4 (App Router, `cacheComponents`), React 19.3, TypeScript 6.0.3, Tailwind 4.3, shadcn/ui chart component on Recharts 3, @google-cloud/bigquery 9.3, Vitest 5 + happy-dom + Testing Library, Playwright 1.64.

**Spec:** [docs/superpowers/specs/2026-10-14-dashboard-design.md](../specs/2026-10-14-dashboard-design.md), sections 3 (routes and URL state), 5 (query layer, errors), 6 (metric definitions), 7 (pages), 9 (testing), 10 (deployment, secrets), 11 PRs 8–11. Read sections 5–7 before Task 2.

## Global Constraints

- TypeScript `6.0.3`; Node 24. New dependencies at their latest stable version (`npm view <pkg> version --prefer-online`) at install time. Checked 2026-10-16: `recharts` 3.10.1, `shadcn` 4.22.0.
- No user input in SQL text. Event names, prop keys, prop values, app id, timezone, hosts: parameters only. SQL text may only contain table names from `readEnv()`, constants from `rt-analytics/schema` and fixed fragments from this plan.
- Built-in event names, the `d_` prefix and `"server"` come from `rt-analytics/schema` (`EVENTS`, `DAILY_VISITOR_PREFIX`, `SERVER_CONSENT_STATE`), never as literals in dashboard code.
- Every query on `analytics.events` filters `app_id = @app_id` and a `timestamp` range.
- No request-time values in params: params depend only on the range, today's date in the app timezone and settings. "Now" is `CURRENT_TIMESTAMP()` in SQL.
- Prop keys used in SQL are validated: `isUsablePropKey` and present in discovery for that event (or in a saved funnel of that app, funnels only).
- Every data query goes through `dataQuery()` (tag `rtd:bq:<appId>`, respects Live). Config reads use tag `rtd:config`. All tags start with `rtd:`.
- "Per day" numbers: sum of daily distinct counts divided by the calendar days of the range (today counts as one day). Never count daily ids across days.
- Before writing any chart component, load the `dataviz` skill and follow it (colors as tokens, light and dark).
- UI copy in plain, short English.
- Commits without attribution trailers; author from Robin's git config.
- External actions (push, merge to main, Vercel deploy, env changes) only after Robin's OK (Task 12).
- Throw-away commands go into files under `claude-tmp-helpers/` (gitignored).

## Review Focus

1. **A new app or a range with no data** (all counts 0, previous period 0, coverage 0): tiles show `0` or `–`, never `NaN`, `Infinity` or `-100 %`; change against 0 shows "new". Pinned in Task 2 (`change`, `perDay`, `alignSeries` with no rows) and Task 5 (`KpiTile` with `change: null`).
2. **A bookmarked or hand-edited URL with an event or prop key that discovery no longer knows** (typo, event stopped 31 days ago, prop renamed): the page renders with that part dropped; no error page and the key never reaches SQL. Pinned in Task 7 (`parseExplorer`) and Task 9 (`validateSteps`).
3. **Prop values with `:`, `|`, spaces, unicode or `%`** in filters and funnel steps survive the URL round trip (`kind:a:b` means key `kind`, value `a:b`). Pinned in Task 7 and Task 9 parse/encode tests.
4. **Ranges across a DST change or in a non-Berlin timezone** (Berlin 2026-10-25, Santiago, UTC): one row per calendar day, previous period aligned by day offset, day starts at the first real instant of the day. Pinned in Task 1 (`rangeBounds` property test) and Task 2 (`alignSeries` across 2026-10-25).
5. **Breakdowns with fewer than 20 values, with NULL values, and previous-period values outside the current top 20**: "Other" only appears when it has data, NULL becomes "(none)", previous values outside the top land in "Other". Pinned in Task 3 (`toBreakdown`).

---

## PR 8: Overview (branch `feat/dashboard-overview` from `main`)

### Task 1: Phase B deferred fixes

**Files:**
- Modify: `apps/dashboard/vercel.json`, `apps/dashboard/src/time/range.ts`, `apps/dashboard/src/time/range.test.ts`, `apps/dashboard/src/config/settings.ts`, `apps/dashboard/src/config/settings.test.ts`, `apps/dashboard/src/app/[appId]/actions.ts`, `apps/dashboard/src/app/[appId]/settings/page.tsx`, `apps/dashboard/src/auth/test-login.ts`, `apps/dashboard/src/auth/auth.test.ts`, `apps/dashboard/src/env.ts`, `apps/dashboard/src/env.test.ts`, `apps/dashboard/src/instrumentation.ts`

**Interfaces:**
- Produces: `dayStart(day: string, tz: string): string` (ISO UTC instant of the first moment of `day` in `tz`, exported from `time/range.ts`); `parseHostList(input: string): { hosts: string[]; invalid: string[] }`; `secretMatches(given: string | null | undefined, expected: string): boolean`; `startupCheck(env: Record<string, string | undefined>): void`.

- [ ] **Step 1.1: Failing tests**

`src/time/range.test.ts` (add):

```ts
describe("dayStart", () => {
  // Days that start inside a DST gap (00:00 does not exist) and normal DST days.
  const cases: Array<[string, string]> = [
    ["America/Santiago", "2026-09-06"],
    ["America/Havana", "2026-03-08"],
    ["Europe/Berlin", "2026-03-29"],
    ["Europe/Berlin", "2026-10-25"],
    ["UTC", "2026-10-16"],
  ];
  it.each(cases)("%s %s starts at the first instant of that day", (tz, day) => {
    const start = Date.parse(dayStart(day, tz));
    expect(todayIn(tz, new Date(start))).toBe(day);
    expect(todayIn(tz, new Date(start - 1000))).toBe(addDays(day, -1));
  });
  it("Berlin summer and winter", () => {
    expect(dayStart("2026-07-01", "Europe/Berlin")).toBe("2026-06-30T22:00:00.000Z");
    expect(dayStart("2026-12-01", "Europe/Berlin")).toBe("2026-11-30T23:00:00.000Z");
  });
});
```

If one of the gap dates above turns out not to be a gap day in the installed tz data, replace it with one that is (check with `Intl` in a helper script) and note it in the commit message; the test must contain at least one real gap day.

`src/config/settings.test.ts` (add):

```ts
it("timezones: only IANA names Intl lists, plus UTC, case-sensitive", () => {
  expect(isTimezone("Europe/Berlin")).toBe(true);
  expect(isTimezone("UTC")).toBe(true);
  expect(isTimezone("europe/berlin")).toBe(false);
  expect(isTimezone("Not/AZone")).toBe(false);
});
it("host list: splits on whitespace and commas, reports invalid entries", () => {
  expect(parseHostList("Example.com\n www.example.com, ")).toEqual({
    hosts: ["example.com", "www.example.com"],
    invalid: [],
  });
  expect(parseHostList("example.com https://x.de a_b")).toEqual({
    hosts: ["example.com"],
    invalid: ["https://x.de", "a_b"],
  });
});
```

`src/auth/auth.test.ts` (add):

```ts
it("secretMatches compares in constant time and rejects missing values", () => {
  expect(secretMatches(secret, secret)).toBe(true);
  expect(secretMatches(`${secret}x`, secret)).toBe(false);
  expect(secretMatches(null, secret)).toBe(false);
  expect(secretMatches(undefined, secret)).toBe(false);
});
```

`src/env.test.ts` (add):

```ts
describe("startupCheck", () => {
  const full = {
    GCP_PROJECT_ID: "robin-thues",
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "s",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "https://example.vercel.app",
    DASHBOARD_ALLOWED_EMAILS: "a@b.de",
  };
  it("passes with a complete environment", () => expect(() => startupCheck(full)).not.toThrow());
  it("names the missing variable", () => {
    expect(() => startupCheck({ ...full, GOOGLE_CLIENT_SECRET: undefined })).toThrow(/GOOGLE_CLIENT_SECRET/);
    expect(() => startupCheck({ ...full, DASHBOARD_ALLOWED_EMAILS: " , " })).toThrow(/DASHBOARD_ALLOWED_EMAILS/);
    expect(() => startupCheck({ ...full, GCP_PROJECT_ID: undefined })).toThrow(/GCP_PROJECT_ID/);
  });
  it("skips the variable check on previews (no GCP or Google values there)", () => {
    expect(() => startupCheck({ VERCEL_ENV: "preview" })).not.toThrow();
  });
  it("still refuses the test login in a deployment", () => {
    expect(() => startupCheck({ ...full, VERCEL_ENV: "production", DASHBOARD_TEST_LOGIN: "1" })).toThrow();
  });
});
```

- [ ] **Step 1.2: Run to see them fail**

Run: `cd apps/dashboard && npx vitest run src/time src/config src/auth src/env.test.ts`
Expected: FAIL (`dayStart`, `parseHostList`, `secretMatches`, `startupCheck` not exported; the Santiago and Havana cases fail on the old `localMidnight`).

- [ ] **Step 1.3: Implement**

- `dayStart`: keep `offsetMinutes`. Compute both candidates `guess - offset(guess)` and `guess - offset(first)` (as today), keep those whose local day (`todayIn(tz, …)`) equals `day`, return the earliest as ISO. On a gap day only the later candidate lies on `day` (Santiago: 03:00Z is still the previous day, 04:00Z is 01:00 local), which is the fix. If no candidate matches, return the later one. `rangeBounds` uses `dayStart`.
- `isTimezone`: `tz === "UTC" || Intl.supportedValuesOf("timeZone").includes(tz)` (cache the list in a module `Set`). The settings page select adds `"UTC"` when the list lacks it.
- `parseHostList`: split on `/[\s,]+/`, drop empties, lowercase and trim, valid if `HOST_RE` matches, at most 20 hosts kept. `saveSettings` uses it and redirects to `?error=hosts` when `invalid.length > 0` (nothing saved). Settings page `ERRORS.hosts = "Some hostnames are not valid. Use plain hostnames like example.com, one per line."`.
- `refreshApp` and `toggleLive`: call `appPath(appId)` (validation) before `updateTag` or cookie changes.
- `secretMatches`: SHA-256 both strings, `crypto.timingSafeEqual` on the digests; `null`/`undefined` → `false`. The test-login endpoint uses it.
- `startupCheck(env)`: calls `assertSafeTestLogin(env)`; then returns early when `env.VERCEL_ENV === "preview"`; otherwise requires non-empty `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, at least one email in `DASHBOARD_ALLOWED_EMAILS`, and calls `readEnv(env)`. Error message: `Missing environment variable <NAME>`. `instrumentation.ts` `register()` calls `startupCheck(process.env)` only when `process.env.NEXT_RUNTIME === "nodejs"`.
- `vercel.json`: add `"buildCommand": "cd ../.. && npm run build -w rt-analytics && npm run build -w rt-analytics-dashboard"` next to the existing `ignoreCommand`.

- [ ] **Step 1.4: Tests pass**

Run: `cd apps/dashboard && npx vitest run && npm run lint && npm run typecheck`
Expected: all PASS.

- [ ] **Step 1.5: Build command works from a clean library**

Run: `bash claude-tmp-helpers/vercel-build-local.sh` (new helper: deletes `packages/rt-analytics/dist`, then runs the `buildCommand` string from `apps/dashboard/vercel.json` inside `apps/dashboard`, the way Vercel does).
Expected: library `dist/` exists again and `next build` finishes.

- [ ] **Step 1.6: Commit**

```bash
git add apps/dashboard
git commit -m "fix(dashboard): Phase B deferred fixes (DST gap days, strict timezones, host errors, constant-time test secret, startup env check, library-first build)"
```

---

### Task 2: Period model, query context and dry-run harness

**Files:**
- Modify: `apps/dashboard/src/time/range.ts`, `apps/dashboard/src/time/range.test.ts`
- Create: `apps/dashboard/src/queries/context.ts`, `apps/dashboard/src/queries/context.test.ts`, `apps/dashboard/src/queries/series.ts`, `apps/dashboard/src/queries/series.test.ts`, `apps/dashboard/src/queries/dry-run.integration.test.ts`
- Modify: `apps/dashboard/src/bq/query.ts` (add `dataQuery`)

**Interfaces:**
- Consumes: `dayStart`, `addDays`, `daysBetween`, `DateRange` (Task 1 / Phase B); `AppSettings`.
- Produces:
  - `previousRange(range: DateRange): DateRange`, `rangeDays(range: DateRange): number`, `eachDay(range: DateRange): string[]` in `time/range.ts`.
  - `type Period = "cur" | "prev"`.
  - `interface QueryContext { table: string; appId: string; tz: string; hosts: readonly string[]; range: DateRange; prev: DateRange; compare: boolean; today: string; days: number; params: PeriodParams }`.
  - `interface PeriodParams { app_id: string; tz: string; from_ts: string; to_ts: string; prev_from_ts: string; prev_to_ts: string; prev_last_day_start: string; today_start: string; partial_today: boolean; compare: boolean; read_from_ts: string; read_to_ts: string }`.
  - `buildContext(input: { table: string; appId: string; settings: AppSettings; range: DateRange; compare: boolean; today: string }): QueryContext`.
  - `periodOf(ts: string): string` (SQL expression), `EVENT_COLUMNS` (readonly list of column names), `eventsCte(table: string, columns: readonly EventColumn[]): string`, `sessionsCte(): string`, `persistentCond(prefix?: string): string`.
  - `toSpec(sql: string, params: Record<string, QueryParam>, types?: Record<string, string | string[]>): QuerySpec` (keeps only params whose `@name` occurs in `sql`). In `bq/run-query.ts`, export `type QueryParam = string | number | boolean | string[] | null` (the existing param value type) and widen `QuerySpec.types` to `Record<string, string | string[]>` (array params need `["STRING"]`).
  - `alignSeries(rows: Array<{ period: Period; day: string; n: number }>, ctx: Pick<QueryContext, "range" | "prev" | "compare">): Array<{ day: string; cur: number; prev: number | null }>`; `change(cur: number, prev: number | null | undefined): number | null`; `perDay(sum: number, days: number): number`.
  - `dataQuery<T>(spec: QuerySpec, appId: string, live: boolean): Promise<QueryResult<T>>` in `bq/query.ts`.

- [ ] **Step 2.1: Failing tests**

`src/time/range.test.ts` (add):

```ts
it("previous period: same number of calendar days, ending the day before from", () => {
  expect(previousRange({ from: "2026-10-01", to: "2026-10-16" })).toEqual({ from: "2026-09-15", to: "2026-09-30" });
  expect(previousRange({ from: "2026-03-01", to: "2026-03-01" })).toEqual({ from: "2026-02-28", to: "2026-02-28" });
  expect(rangeDays({ from: "2026-10-01", to: "2026-10-16" })).toBe(16);
  expect(eachDay({ from: "2026-10-24", to: "2026-10-26" })).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
});
```

`src/queries/context.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildContext, eventsCte, periodOf, sessionsCte, toSpec } from "./context";

const base = { table: "`p.analytics.events`", appId: "demo", settings: { timezone: "Europe/Berlin", hosts: [] } };

describe("buildContext", () => {
  it("range including today: partial cut, read window covers the previous period plus one day each side", () => {
    const ctx = buildContext({ ...base, range: { from: "2026-10-01", to: "2026-10-16" }, compare: true, today: "2026-10-16" });
    expect(ctx.days).toBe(16);
    expect(ctx.prev).toEqual({ from: "2026-09-15", to: "2026-09-30" });
    expect(ctx.params).toEqual({
      app_id: "demo",
      tz: "Europe/Berlin",
      from_ts: "2026-09-30T22:00:00.000Z",
      to_ts: "2026-10-16T22:00:00.000Z",
      prev_from_ts: "2026-09-14T22:00:00.000Z",
      prev_to_ts: "2026-09-30T22:00:00.000Z",
      prev_last_day_start: "2026-09-29T22:00:00.000Z",
      today_start: "2026-10-15T22:00:00.000Z",
      partial_today: true,
      compare: true,
      read_from_ts: "2026-09-13T22:00:00.000Z",
      read_to_ts: "2026-10-17T22:00:00.000Z",
    });
  });
  it("compare off: the read window starts one day before from", () => {
    const ctx = buildContext({ ...base, range: { from: "2026-10-01", to: "2026-10-10" }, compare: false, today: "2026-10-16" });
    expect(ctx.params.read_from_ts).toBe("2026-09-29T22:00:00.000Z");
    expect(ctx.params.partial_today).toBe(false);
    expect(ctx.params.compare).toBe(false);
  });
  it("params are the same all day long (no time of day in them)", () => {
    const a = buildContext({ ...base, range: { from: "2026-10-01", to: "2026-10-16" }, compare: true, today: "2026-10-16" });
    const b = buildContext({ ...base, range: { from: "2026-10-01", to: "2026-10-16" }, compare: true, today: "2026-10-16" });
    expect(a.params).toEqual(b.params);
  });
});

describe("SQL fragments", () => {
  it("periodOf cuts the previous period at the same time of day when today is in range", () => {
    const sql = periodOf("timestamp");
    expect(sql).toContain("TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), TIMESTAMP(@today_start), SECOND)");
    expect(sql).toContain("@partial_today");
    expect(sql).toContain("'cur'");
    expect(sql).toContain("'prev'");
  });
  it("eventsCte filters app and the read window and selects only the given columns", () => {
    const sql = eventsCte("`p.analytics.events`", ["event_name", "timestamp"]);
    expect(sql).toContain("app_id = @app_id");
    expect(sql).toContain("timestamp >= TIMESTAMP(@read_from_ts) AND timestamp < TIMESTAMP(@read_to_ts)");
    expect(sql).not.toContain("props");
  });
  it("sessions need a pageview and use the daily prefix from the schema", () => {
    const sql = sessionsCte();
    expect(sql).toContain("HAVING COUNTIF(event_name = '$pageview') > 0");
    expect(sql).toContain("STARTS_WITH(visitor_id, 'd_')");
  });
  it("toSpec drops params the SQL does not use", () => {
    const spec = toSpec("SELECT @a, @ab", { a: 1, ab: 2, abc: 3 });
    expect(spec.params).toEqual({ a: 1, ab: 2 });
  });
});
```

`src/queries/series.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { alignSeries, change, perDay } from "./series";

const ctx = { range: { from: "2026-10-24", to: "2026-10-26" }, prev: { from: "2026-10-21", to: "2026-10-23" }, compare: true };

describe("series", () => {
  it("one point per calendar day across the DST change, missing days are 0, prev aligned by offset", () => {
    const rows = [
      { period: "cur" as const, day: "2026-10-25", n: 5 },
      { period: "prev" as const, day: "2026-10-21", n: 7 },
    ];
    expect(alignSeries(rows, ctx)).toEqual([
      { day: "2026-10-24", cur: 0, prev: 7 },
      { day: "2026-10-25", cur: 5, prev: 0 },
      { day: "2026-10-26", cur: 0, prev: 0 },
    ]);
  });
  it("no rows and compare off", () => {
    expect(alignSeries([], { ...ctx, compare: false }).map((p) => p.prev)).toEqual([null, null, null]);
  });
  it("change in percent, null when there is nothing to compare with", () => {
    expect(change(150, 100)).toBe(50);
    expect(change(0, 100)).toBe(-100);
    expect(change(5, 0)).toBeNull();
    expect(change(5, null)).toBeNull();
    expect(change(5, undefined)).toBeNull();
  });
  it("per day divides by calendar days and never returns NaN", () => {
    expect(perDay(30, 3)).toBe(10);
    expect(perDay(0, 3)).toBe(0);
    expect(perDay(5, 0)).toBe(0);
  });
});
```

- [ ] **Step 2.2: Run to see them fail**

Run: `cd apps/dashboard && npx vitest run src/time src/queries`
Expected: FAIL, modules missing.

- [ ] **Step 2.3: Implement `src/queries/context.ts`**

`buildContext`: `prev = previousRange(range)`; `from_ts`/`to_ts` = `dayStart(from)` / `dayStart(to + 1)`; `prev_from_ts`/`prev_to_ts` likewise; `prev_last_day_start = dayStart(prev.to)`; `today_start = dayStart(range.to)`; `partial_today = range.to === today`; `read_from_ts = dayStart((compare ? prev.from : range.from) - 1 day)`; `read_to_ts = dayStart(range.to + 2 days)`.

The shared fragments (exact SQL, `$pageview` and `d_` come from `rt-analytics/schema`):

```ts
const PREV_END = `IF(@partial_today,
  TIMESTAMP_ADD(TIMESTAMP(@prev_last_day_start), INTERVAL TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), TIMESTAMP(@today_start), SECOND) SECOND),
  TIMESTAMP(@prev_to_ts))`;

export function periodOf(ts: string): string {
  return `CASE
    WHEN ${ts} >= TIMESTAMP(@from_ts) AND ${ts} < TIMESTAMP(@to_ts) THEN 'cur'
    WHEN @compare AND ${ts} >= TIMESTAMP(@prev_from_ts) AND ${ts} < ${PREV_END} THEN 'prev'
  END`;
}

// evp: the app's events in the read window, with the event's own period and local day.
export function eventsCte(table: string, columns: readonly EventColumn[]): string {
  return `evp AS (
  SELECT ${columns.join(", ")}, ${periodOf("timestamp")} AS period, DATE(timestamp, @tz) AS day
  FROM ${table}
  WHERE app_id = @app_id AND timestamp >= TIMESTAMP(@read_from_ts) AND timestamp < TIMESTAMP(@read_to_ts)
)`;
}

export const persistentCond = (p = "") =>
  `(${p}user_id IS NOT NULL OR (${p}visitor_id IS NOT NULL AND NOT STARTS_WITH(${p}visitor_id, '${DAILY_VISITOR_PREFIX}')))`;

// sessions: a session_id with at least one pageview; it belongs to the period and day of its first event.
// Needs evp with event_name, timestamp, session_id, visitor_id, user_id, page_path, referrer, utm_*.
export function sessionsCte(): string {
  return `sessions AS (
  SELECT *, ${periodOf("start_ts")} AS period, DATE(start_ts, @tz) AS day
  FROM (
    SELECT
      session_id,
      MIN(timestamp) AS start_ts,
      COUNTIF(event_name = '${EVENTS.pageview}') AS pageviews,
      MAX(visitor_id) AS visitor_id,
      LOGICAL_OR(${persistentCond()}) AS persistent,
      ARRAY_AGG(STRUCT(page_path, referrer, utm_source, utm_medium, utm_campaign)
        ORDER BY IF(event_name = '${EVENTS.pageview}', 0, 1), timestamp LIMIT 1)[OFFSET(0)] AS first_pv
    FROM evp
    WHERE session_id IS NOT NULL
    GROUP BY session_id
    HAVING COUNTIF(event_name = '${EVENTS.pageview}') > 0
  )
)`;
}
```

`EventColumn` is the union of the 21 column names of `EventRow` (from `rt-analytics/schema`). `toSpec` matches `@name` with a word boundary (`/@name\b/`).

- [ ] **Step 2.4: Implement `src/queries/series.ts`** per the signatures. `change` rounds nothing (the UI formats). `alignSeries` walks `eachDay(range)`; the previous value for day index `i` is the `prev` row for `addDays(prev.from, i)`.

- [ ] **Step 2.5: `dataQuery` in `src/bq/query.ts`**

`dataQuery(spec, appId, live)` = `query(spec, { tags: [TAGS.data(appId)], ttl: readEnv().cacheTtlSeconds, live })`. No test (thin wrapper over tested parts).

- [ ] **Step 2.6: Dry-run harness**

`src/queries/dry-run.integration.test.ts` (`// @vitest-environment node`), opt-in like the library's integration test:

```ts
// Opt-in: RTD_DRY_RUN=1 GCP_PROJECT_ID=robin-thues npx vitest run src/queries/dry-run.integration.test.ts
// Uses your gcloud application default credentials. Dry runs are free.
const enabled = process.env.RTD_DRY_RUN === "1";
```

It builds one `QueryContext` for `app_id = "demo"`, 90 days ending yesterday (Europe/Berlin), compare on, `today` = today in Berlin, hosts `["demo.localhost"]`. A `CASES: Array<[name: string, spec: QuerySpec]>` list (empty in this task, each later query task appends its builders). `it.each(CASES)` runs `new BigQuery({ projectId, location: "EU" }).createQueryJob({ query, params, types, location: "EU", dryRun: true })` and asserts `Number(job.metadata.statistics.totalBytesProcessed) <= readEnv().maxBytesPerQuery`. Add one case now: `["periodOf + sessionsCte", toSpec(\`WITH ${eventsCte(...all columns)}, ${sessionsCte()} SELECT period, COUNT(*) AS n FROM sessions GROUP BY period\`, ctx.params)]`.

- [ ] **Step 2.7: Tests pass**

Run: `cd apps/dashboard && npx vitest run && RTD_DRY_RUN=1 GCP_PROJECT_ID=robin-thues npx vitest run src/queries/dry-run.integration.test.ts`
Expected: unit tests PASS; the dry run PASSES (needs Robin's `gcloud auth application-default login`; if it is expired, ask Robin to run it with `! gcloud auth application-default login`).

- [ ] **Step 2.8: Commit**

```bash
git add apps/dashboard/src
git commit -m "feat(dashboard): period model, query context and opt-in dry-run tests"
```

---

### Task 3: Overview query builders and models

**Files:**
- Create: `apps/dashboard/src/queries/overview.ts`, `apps/dashboard/src/queries/overview.test.ts`, `apps/dashboard/src/overview/model.ts`, `apps/dashboard/src/overview/model.test.ts`
- Modify: `apps/dashboard/src/queries/dry-run.integration.test.ts` (append the overview cases)

**Interfaces:**
- Consumes: `QueryContext`, `eventsCte`, `sessionsCte`, `periodOf`, `persistentCond`, `toSpec`, `perDay`, `change`, `Period` (Task 2).
- Produces (each builder `(ctx: QueryContext) => QuerySpec` unless noted; row types exported):
  - `kpisQuery` → `KpiRow { period: Period; visitor_days: number; persistent_people: number; returning_people: number; sessions: number; persistent_sessions: number; bounced_sessions: number; pageviews: number; errors: number }`
  - `trafficQuery` → `TrafficRow { period: Period; day: string; visitors: number; sessions: number; pageviews: number; errors: number }`
  - `type BreakdownDim = "page" | "entry_page" | "source" | "utm" | "country" | "device" | "browser" | "os"`; `breakdownQuery(ctx, dim: BreakdownDim)` → `BreakdownRow { period: Period; value: string | null; pageviews: number; visitor_days: number }` (`value` NULL = Other)
  - `webVitalsQuery` → `VitalRow { period: Period; metric: "LCP" | "INP" | "CLS"; p75: number; samples: number }`
  - `slowPagesQuery` → `SlowPageRow { page_path: string; p75: number; samples: number }`
  - `topErrorsQuery` → `ErrorRow { message: string; occurrences: number; last_seen: string }`
  - `consentQuery` → `ConsentRow { period: Period; consent_state: string; pageviews: number }`
  - `retentionQuery` → `RetentionRow { cohort: string; week_n: number; people: number }`
  - Models in `overview/model.ts`: `toKpis(rows: KpiRow[], days: number, compare: boolean): Kpis` where `Kpis` has `visitorsPerDay`, `persistentPeople`, `returningPeople`, `sessions`, `pageviews`, `bounceRate`, `errors`, `coverage`, each `{ value: number; change: number | null | undefined }` (`undefined` when compare is off, `bounceRate.value` and `coverage.value` are shares 0..1); `toBreakdown(rows: BreakdownRow[], days: number, compare: boolean): BreakdownView[]` with `BreakdownView { label: string; isOther: boolean; pageviews: number; visitorsPerDay: number; pageviewsChange: number | null | undefined }`; `toRetention(rows: RetentionRow[]): Array<{ cohort: string; size: number; shares: number[] }>`; `toConsentShares(rows: ConsentRow[]): Array<{ state: string; share: number; prevShare: number | null }>`.

- [ ] **Step 3.1: Failing builder tests** (`src/queries/overview.test.ts`, node environment)

```ts
const ctx = buildContext({ table: "`p.analytics.events`", appId: "x' OR 1=1 --", settings: { timezone: "Europe/Berlin", hosts: ["example.com"] }, range: { from: "2026-10-01", to: "2026-10-16" }, compare: true, today: "2026-10-16" });
const all = [kpisQuery(ctx), trafficQuery(ctx), ...DIMS.map((d) => breakdownQuery(ctx, d)), webVitalsQuery(ctx), slowPagesQuery(ctx), topErrorsQuery(ctx), consentQuery(ctx), retentionQuery(ctx)];

it("every overview query filters app and a timestamp range, never inlines the app id", () => {
  for (const q of all) {
    expect(q.sql).toContain("app_id = @app_id");
    expect(q.sql).toMatch(/timestamp >= TIMESTAMP\(@\w+\)/);
    expect(q.sql).not.toContain("1=1");
    expect(q.params.app_id).toBe("x' OR 1=1 --");
  }
});
it("only overview breakdowns by source use the own hosts, as a typed array param", () => {
  const q = breakdownQuery(ctx, "source");
  expect(q.params.own_hosts).toEqual(["example.com"]);
  expect(q.types).toEqual({ own_hosts: ["STRING"] });
  expect(q.sql).toContain("IN UNNEST(@own_hosts)");
  expect(breakdownQuery(ctx, "page").params.own_hosts).toBeUndefined();
});
it("breakdowns rank the top 20 by current pageviews and put the rest in NULL (Other)", () => {
  const sql = breakdownQuery(ctx, "country").sql;
  expect(sql).toContain("LIMIT 20");
  expect(sql).toContain("WHERE period = 'cur'");
});
it("web vitals: only LCP, INP, CLS, p75 from APPROX_QUANTILES", () => {
  const sql = webVitalsQuery(ctx).sql;
  expect(sql).toContain("APPROX_QUANTILES");
  expect(sql).toContain("[OFFSET(75)]");
  expect(sql).toContain("('LCP', 'INP', 'CLS')");
});
it("retention: 28-day lookback, Monday weeks, persistent ids only, no previous period", () => {
  const q = retentionQuery(ctx);
  expect(q.params.lookback_ts).toBe("2026-09-02T22:00:00.000Z");
  expect(q.sql).toContain("WEEK(MONDAY)");
  expect(q.sql).toContain("NOT STARTS_WITH(visitor_id, 'd_')");
  expect(q.params.prev_from_ts).toBeUndefined();
});
```

- [ ] **Step 3.2: Failing model tests** (`src/overview/model.test.ts`)

```ts
it("toKpis: per-day visitors, shares and change; zero sessions give 0 rates, not NaN", () => {
  const cur = { period: "cur", visitor_days: 300, persistent_people: 10, returning_people: 4, sessions: 200, persistent_sessions: 20, bounced_sessions: 50, pageviews: 400, errors: 2 } as const;
  const prev = { ...cur, period: "prev", visitor_days: 150, sessions: 0, persistent_sessions: 0, bounced_sessions: 0 } as const;
  const k = toKpis([cur, prev], 30, true);
  expect(k.visitorsPerDay).toEqual({ value: 10, change: 100 });
  expect(k.bounceRate.value).toBe(0.25);
  expect(k.coverage.value).toBe(0.1);
  expect(k.sessions.change).toBeNull();
  expect(toKpis([], 30, true).bounceRate).toEqual({ value: 0, change: null });
  expect(toKpis([cur], 30, false).pageviews.change).toBeUndefined();
});
it("toBreakdown: Other last and only with data, prev values outside the top count into Other", () => {
  const rows = [
    { period: "cur", value: "/a", pageviews: 10, visitor_days: 30 },
    { period: "cur", value: "/b", pageviews: 20, visitor_days: 3 },
    { period: "prev", value: null, pageviews: 7, visitor_days: 3 },
    { period: "prev", value: "/b", pageviews: 10, visitor_days: 3 },
  ] as const;
  expect(toBreakdown([...rows], 3, true)).toEqual([
    { label: "/b", isOther: false, pageviews: 20, visitorsPerDay: 1, pageviewsChange: 100 },
    { label: "/a", isOther: false, pageviews: 10, visitorsPerDay: 10, pageviewsChange: null },
  ]);
  const withOther = toBreakdown([...rows, { period: "cur", value: null, pageviews: 1, visitor_days: 1 }], 3, true);
  expect(withOther.at(-1)).toMatchObject({ label: "Other", isOther: true, pageviewsChange: -85.71428571428571 });
});
it("toRetention: shares relative to week 0", () => {
  expect(toRetention([
    { cohort: "2026-09-07", week_n: 0, people: 10 },
    { cohort: "2026-09-07", week_n: 2, people: 3 },
  ])).toEqual([{ cohort: "2026-09-07", size: 10, shares: [1, 0, 0.3] }]);
});
```

- [ ] **Step 3.3: Run to see them fail**

Run: `cd apps/dashboard && npx vitest run src/queries/overview.test.ts src/overview`
Expected: FAIL, modules missing.

- [ ] **Step 3.4: Implement the builders**

All start with `WITH ${eventsCte(ctx.table, <columns the query needs>)}` and return via `toSpec`. Contracts:

- `kpisQuery`: CTEs `sessions` (needs all session columns), `periods` (`UNNEST(IF(@compare, ['cur','prev'], ['cur']))`), `daily` (period, day, `COUNT(DISTINCT visitor_id)` where visitor_id is not null), `persons` (period, `COALESCE(user_id, visitor_id)`, `COUNT(DISTINCT day)` where `persistentCond()`), `sess` (period: count, `COUNTIF(persistent)`, `COUNTIF(pageviews = 1)`), `counts` (period: `COUNTIF` pageview and error events). Final: one row per period from `periods` LEFT JOIN the rest, `IFNULL(…, 0)`. `visitor_days = SUM(daily.v)`; `returning_people = COUNTIF(days >= 2)`.
- `trafficQuery`: per (period, day) from event-level `evp` (visitors, pageviews, errors) FULL JOIN session-level (`sessions` count by session period and day); `CAST(day AS STRING) AS day`; rows with NULL period dropped.
- `breakdownQuery`: one fixed SQL expression per dimension (closed map, no input), and a level:

| dim | level | expression |
|---|---|---|
| page | event (pageviews) | `page_path` |
| country, device, browser, os | event (pageviews) | `country`, `device_type`, `browser`, `os` |
| entry_page | session | `first_pv.page_path` |
| source | session | host rule below |
| utm | session | `IF(COALESCE(first_pv.utm_source, first_pv.utm_medium, first_pv.utm_campaign) IS NULL, '(none)', CONCAT(IFNULL(first_pv.utm_source, '-'), ' / ', IFNULL(first_pv.utm_medium, '-'), ' / ', IFNULL(first_pv.utm_campaign, '-')))` |

Source host rule: `h = IFNULL(LOWER(NET.HOST(first_pv.referrer)), '')`, value `IF(h = '' OR h IN UNNEST(@own_hosts), 'direct', h)`. Pass `own_hosts: [...ctx.hosts]` and `types: { own_hosts: ["STRING"] }` only for `source`.

The bucketing algorithm (same for both levels; event level uses pageview events with `pv = 1`, session level uses `sessions` with `pv = pageviews` and the session's period and day):

```sql
rows AS (SELECT period, day, IFNULL(<expr>, '(none)') AS value, visitor_id, <pv> AS pv FROM <source> WHERE period IS NOT NULL),
top AS (SELECT value FROM rows WHERE period = 'cur' GROUP BY value ORDER BY SUM(pv) DESC, value LIMIT 20),
bucketed AS (SELECT r.period, r.day, t.value AS value, r.visitor_id, r.pv FROM rows r LEFT JOIN top t USING (value)),
daily AS (SELECT period, value, day, SUM(pv) AS pv, COUNT(DISTINCT visitor_id) AS v FROM bucketed GROUP BY period, value, day)
SELECT period, value, SUM(pv) AS pageviews, SUM(v) AS visitor_days FROM daily GROUP BY period, value
```

- `webVitalsQuery`: `LAX_STRING(props.metric) AS metric`, `APPROX_QUANTILES(LAX_FLOAT64(props.value), 100)[OFFSET(75)] AS p75`, `COUNT(*) AS samples`, web vital events, metric in `('LCP', 'INP', 'CLS')`, per period.
- `slowPagesQuery`: current period, LCP only, per `page_path`, `HAVING COUNT(*) >= 5`, `ORDER BY p75 DESC LIMIT 10`.
- `topErrorsQuery`: current period, error events, `IFNULL(LAX_STRING(props.message), '(no message)')`, count, `FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', MAX(timestamp), @tz) AS last_seen`, top 10.
- `consentQuery`: pageview events per period and `IFNULL(consent_state, 'unknown')`.
- `retentionQuery` (no `evp`, own window, param `lookback_ts = dayStart(from - 28 days)`):

```sql
WITH persistent AS (
  SELECT COALESCE(user_id, visitor_id) AS person, timestamp
  FROM <table>
  WHERE app_id = @app_id AND timestamp >= TIMESTAMP(@lookback_ts) AND timestamp < TIMESTAMP(@to_ts)
    AND <persistentCond()>
),
new_people AS (
  SELECT person, DATE_TRUNC(DATE(MIN(timestamp), @tz), WEEK(MONDAY)) AS cohort
  FROM persistent GROUP BY person
  HAVING MIN(timestamp) >= TIMESTAMP(@from_ts)
),
activity AS (
  SELECT DISTINCT person, DATE_TRUNC(DATE(timestamp, @tz), WEEK(MONDAY)) AS week
  FROM persistent WHERE timestamp >= TIMESTAMP(@from_ts)
)
SELECT CAST(n.cohort AS STRING) AS cohort, DIV(DATE_DIFF(a.week, n.cohort, DAY), 7) AS week_n, COUNT(DISTINCT a.person) AS people
FROM new_people n JOIN activity a USING (person)
GROUP BY cohort, week_n ORDER BY cohort, week_n
```

(`DATE_DIFF(…, WEEK)` counts Sunday weeks, so the day difference is divided by 7.)

- [ ] **Step 3.5: Implement the models** per the signatures. `toBreakdown` sorts by current pageviews descending, Other last; rows that have only previous data (never possible for named values, see bucketing) are dropped. `toConsentShares` sorts by current share.

- [ ] **Step 3.6: Append dry-run cases** for all overview builders (each dimension separately).

- [ ] **Step 3.7: Tests pass**

Run: `cd apps/dashboard && npx vitest run && RTD_DRY_RUN=1 GCP_PROJECT_ID=robin-thues npx vitest run src/queries/dry-run.integration.test.ts`
Expected: PASS; every overview query's dry run below the 1 GB cap.

- [ ] **Step 3.8: Real-data sanity check**

Write `claude-tmp-helpers/run-overview-queries.ts` (tsx) that runs `kpisQuery`, `trafficQuery` and `breakdownQuery(ctx, "source")` for demo, last 28 days, and prints rows. Check by eye: visitors per day roughly matches the demo generator's daily volume, "direct" exists and the demo host is not listed as a source when it is in `hosts`, bounce rate between 0 and 1.

- [ ] **Step 3.9: Commit**

```bash
git add apps/dashboard/src
git commit -m "feat(dashboard): overview queries (KPIs, traffic, breakdowns, vitals, errors, consent, retention) and models"
```

---

### Task 4: Panels, charts, header navigation, credentials banner

**Files:**
- Create via CLI: `apps/dashboard/src/components/ui/chart.tsx` (`npx shadcn@latest add chart`, adds `recharts`)
- Create: `apps/dashboard/src/components/panel.tsx`, `panel-boundary.tsx`, `kpi-tile.tsx`, `trend-chart.tsx`, `sparkline.tsx`, `breakdown-table.tsx`, `coverage-note.tsx`, `credentials-banner.tsx`, and tests `panel-boundary.test.tsx`, `kpi-tile.test.tsx`, `breakdown-table.test.tsx`, `coverage-note.test.tsx`
- Create: `apps/dashboard/src/bq/credentials.ts`, `apps/dashboard/src/bq/credentials.test.ts`
- Modify: `apps/dashboard/src/lib/format.ts` (+ test), `apps/dashboard/src/lib/query-string.ts` (+ test), `apps/dashboard/src/components/header.tsx`, `apps/dashboard/src/app/[appId]/actions.ts`

**Interfaces:**
- Consumes: `Kpis`, `BreakdownView` (Task 3); `alignSeries` output (Task 2).
- Produces:
  - `formatInt(n: number): string` (`1,234`), `formatDecimal(n: number): string` (one decimal, `12.3`), `formatShare(share: number): string` (`14 %`), `formatChange(pct: number | null): string` (`+12 %`, `−5 %`, `new` for null).
  - `viewQuery(state, extra?: Array<[string, string]>): string` (extra params appended in order).
  - `type AppPage = "overview" | "events" | "funnels"`; `PAGE_PATHS: Record<AppPage, "" | "/events" | "/funnels">`.
  - `Header` props: `{ appId; apps; page: AppPage; state; live; qs; hidden?: Array<[string, string]> }`. Nav links Overview, Events, Funnels, Settings (keep `from`, `to`, `compare`); the date form's action is the current page; `hidden` pairs become hidden inputs so page params survive Apply.
  - Actions: `toggleLive(appId: string, page: AppPage, qs: string)`, `refreshApp(appId: string, page: AppPage, qs: string)`; both validate `appId` and `page` first. `safeQuery` also allows `+` and `*` (what `URLSearchParams` leaves in encoded values), so explorer and funnel params with spaces survive Live and Refresh.
  - `Panel({ title, description?, className?, children })`: Card with title, children inside `PanelBoundary` and `Suspense` (fallback `Skeleton` of fixed height).
  - `PanelBoundary` (client class component): on error renders "Could not load this panel." with `RetryButton`.
  - `KpiTile({ label, value: string, change: number | null | undefined, testId: string })`; `testId` sits on the element that shows the value only.
  - `TrendChart({ title, data: Array<{ day: string; cur: number; prev: number | null }>, compare: boolean })` (client): current as a solid line, previous as a dashed line; tooltip shows both with dates.
  - `Sparkline({ values: number[] })` (client), no axes, 24 px high.
  - `BreakdownTable({ rows: BreakdownView[]; valueLabel: string; compare: boolean; testId: string })`: columns value, pageviews, change (when compare), visitors per day. "Other" row in muted text.
  - `CoverageNote({ coverage: number })`: "Based on 14 % of sessions (visitors who accepted cookies)." For 0: "No visitor in this range has a persistent ID (all cookieless), so returning visitors and retention cannot be shown."
  - `checkCredentials(client: { getAccessToken(): Promise<unknown> }): Promise<{ ok: true } | { ok: false }>`; logs `console.error("[rtd] GCP credentials failed:", reason)` where `reason` is the error name plus the first 200 characters of its message, never the token. `CredentialsBanner()` (async server component) calls it with `getBigQuery(readEnv()).authClient` and renders, when not ok: "The dashboard cannot reach BigQuery (credentials). Panels below will fail. Check the Vercel OIDC token and the workload identity setup."

- [ ] **Step 4.1: Failing tests**

```tsx
// panel-boundary.test.tsx
it("a throwing child shows the panel message instead of breaking the page", () => {
  const Boom = () => { throw new Error("x"); };
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<div><PanelBoundary><Boom /></PanelBoundary><p>sibling</p></div>);
  expect(screen.getByText("Could not load this panel.")).toBeInTheDocument();
  expect(screen.getByText("sibling")).toBeInTheDocument();
});

// kpi-tile.test.tsx
it("shows the change when compare is on", () => {
  render(<KpiTile label="Pageviews" value="1,234" change={12.4} testId="kpi-pageviews" />);
  expect(screen.getByTestId("kpi-pageviews")).toHaveTextContent("1,234");
  expect(screen.getByText("+12 %")).toBeInTheDocument();
});
it("shows 'new' when the previous period was 0 and nothing when compare is off", () => {
  const { rerender } = render(<KpiTile label="Errors" value="3" change={null} testId="k" />);
  expect(screen.getByText("new")).toBeInTheDocument();
  rerender(<KpiTile label="Errors" value="3" change={undefined} testId="k" />);
  expect(screen.queryByText("new")).toBeNull();
});

// coverage-note.test.tsx
it("coverage share and the zero case", () => {
  const { rerender } = render(<CoverageNote coverage={0.14} />);
  expect(screen.getByText(/Based on 14 % of sessions/)).toBeInTheDocument();
  rerender(<CoverageNote coverage={0} />);
  expect(screen.getByText(/all cookieless/)).toBeInTheDocument();
});

// breakdown-table.test.tsx
it("renders rows, Other last and the change column only with compare", () => {
  const rows = [
    { label: "/b", isOther: false, pageviews: 20, visitorsPerDay: 1, pageviewsChange: 100 },
    { label: "Other", isOther: true, pageviews: 1, visitorsPerDay: 0.3, pageviewsChange: null },
  ];
  const { rerender } = render(<BreakdownTable rows={rows} valueLabel="Page" compare testId="t" />);
  expect(screen.getAllByRole("row").at(-1)).toHaveTextContent("Other");
  expect(screen.getByText("+100 %")).toBeInTheDocument();
  rerender(<BreakdownTable rows={rows} valueLabel="Page" compare={false} testId="t" />);
  expect(screen.queryByText("+100 %")).toBeNull();
});
it("empty table says so", () => {
  render(<BreakdownTable rows={[]} valueLabel="Page" compare testId="t" />);
  expect(screen.getByText("No data in this range.")).toBeInTheDocument();
});
```

`src/bq/credentials.test.ts`: ok client → `{ ok: true }`; throwing client (`new Error("invalid_grant: token ya29.SECRET expired")`) → `{ ok: false }` and `console.error` called once with a string that starts with `Error: invalid_grant` and is at most 200 + name length characters. `lib/format.test.ts`: `formatChange(12.4) === "+12 %"`, `formatChange(-5) === "−5 %"`, `formatChange(0) === "0 %"`, `formatChange(null) === "new"`, `formatShare(0.14) === "14 %"`, `formatDecimal(10) === "10.0"`. `lib/query-string.test.ts`: `viewQuery(state, [["event", "a b"], ["filter", "kind:a:b"]])` equals `?from=…&to=…&event=a+b&filter=kind%3Aa%3Ab`.

- [ ] **Step 4.2: Run to see them fail**

Run: `cd apps/dashboard && npx vitest run src/components src/bq/credentials.test.ts src/lib`
Expected: FAIL.

- [ ] **Step 4.3: Install the chart component**

Load the `dataviz` skill first. Then `cd apps/dashboard && npx shadcn@latest add chart`. Check that `recharts` landed at the latest stable version in `package.json` and the root lockfile. Chart colors as CSS tokens in `globals.css` (current = `--chart-1`, previous = muted `--chart-2` dashed), light and dark.

- [ ] **Step 4.4: Implement the components, formatters, `checkCredentials`, header and action changes** per the Interfaces block.

- [ ] **Step 4.5: Tests pass**

Run: `cd apps/dashboard && npx vitest run && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 4.6: Commit**

```bash
git add apps/dashboard package-lock.json
git commit -m "feat(dashboard): panels with error boundaries, KPI tiles, charts, breakdown table, page navigation, credentials banner"
```

---

### Task 5: Overview page

**Files:**
- Create: `apps/dashboard/src/app/[appId]/page-data.ts`, `apps/dashboard/src/app/[appId]/panels/traffic.tsx`, `panels/breakdowns.tsx`, `panels/quality.tsx`, `panels/people.tsx`
- Modify: `apps/dashboard/src/app/[appId]/page.tsx`, `apps/dashboard/src/app/[appId]/loading.tsx`, `apps/dashboard/e2e/dashboard.spec.ts`
- Delete: `apps/dashboard/src/app/[appId]/events-in-range.ts`, `events-in-range.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–4.
- Produces: `loadPage(params: Promise<{ appId: string }>, searchParams: Promise<Record<string, string | string[] | undefined>>): Promise<PageData>` with `PageData { appId; settings: AppSettings; apps: string[]; live: boolean; state: { range; compare }; today: string; ctx: QueryContext; sp: Record<string, string | string[] | undefined> }`. It validates `appId` (`notFound()`), calls `requireUser()`, reads settings, apps, Live and search params in parallel and builds the context. Used by all three pages.

- [ ] **Step 5.1: Update the e2e test first** (it fails until the page exists)

Replace the first test's assertion on `events-in-range` with:

```ts
await expect(page.getByTestId("kpi-pageviews")).toBeVisible();
await expect(page.getByTestId("kpi-pageviews")).not.toHaveText("0");
await expect(page.getByTestId("breakdown-page").getByRole("row")).not.toHaveCount(1);
await expect(page.getByText("Could not load this panel.")).toHaveCount(0);
```

and in "Live toggle and Refresh" wait for `kpi-pageviews` instead of `events-in-range`. In "date range and compare stay in the URL", replace the text check with `await expect(page.getByLabel("From")).toHaveValue("2026-09-01")`.

- [ ] **Step 5.2: Implement the page**

Layout (top to bottom), each block a `Panel`:

1. `CredentialsBanner` (own Suspense, renders nothing when ok).
2. KPI row: visitors per day, persistent people (with `CoverageNote`), sessions, pageviews, bounce rate, errors. Test ids `kpi-visitors`, `kpi-people`, `kpi-sessions`, `kpi-pageviews`, `kpi-bounce`, `kpi-errors`.
3. Three `TrendChart`s from one `trafficQuery`: visitors, sessions, pageviews.
4. Breakdowns in a two-column grid: pages, entry pages, sources, UTM, countries, devices, browsers, OS (test ids `breakdown-<dim>`).
5. Web vitals: three tiles (p75 LCP and INP in ms, CLS with two decimals, with change) and the slowest pages table.
6. Errors: `TrendChart` of errors (from the traffic rows) and the top messages table.
7. Consent split: one row per state with share and previous share.
8. Returning visitors (tile with coverage) and the retention table (cohort, size, week 0..n shares). When coverage is 0, `CoverageNote` replaces both.

Each panel component is async, receives `ctx` and `live`, calls `dataQuery(<builder>(ctx), ctx.appId, live)`, and renders `QueryError` on `ok: false`. The three traffic charts and the errors chart share one `trafficQuery` result through React `cache()` around the fetch function, so it runs once per request.

`loading.tsx`: header placeholder plus a grid of `Skeleton` cards.

- [ ] **Step 5.3: Verify**

Run: `cd apps/dashboard && npx vitest run && npm run lint && npm run typecheck && npm run build && npx playwright test`
Expected: all PASS (Playwright needs a fresh `.env.development.local`; if the OIDC token is older than 12 hours, re-pull with `claude-tmp-helpers/dashboard-local-env.sh`).

- [ ] **Step 5.4: Look at it**

Start `next start` and open `/demo` in the Playwright browser at 1280 px and 390 px width, light and dark. Fix overflow or unreadable charts. Count the BigQuery jobs of one uncached page load (Live on) in `claude-tmp-helpers/dashboard-smoke.sh` output or BigQuery job history and note bytes billed; expected order: 15 queries, each 10 MB minimum billing.

- [ ] **Step 5.5: Commit**

```bash
git add apps/dashboard
git commit -m "feat(dashboard): overview page"
```

---

## PR 9: Events explorer (branch `feat/dashboard-explorer` from `feat/dashboard-overview`)

### Task 6: Explorer query builders

**Files:**
- Create: `apps/dashboard/src/queries/explorer.ts`, `apps/dashboard/src/queries/explorer.test.ts`
- Modify: `apps/dashboard/src/queries/dry-run.integration.test.ts`

**Interfaces:**
- Consumes: Task 2 context and fragments.
- Produces:
  - `type Metric = { kind: "events" } | { kind: "sessions" } | { kind: "visitors" } | { kind: "distinct"; key: string }`
  - `interface ExplorerSelection { event: string; metric: Metric; filter: { key: string; value: string } | null; by: string | null }`
  - `eventListQuery(ctx)` → `EventListRow { period: Period; event_name: string; day: string; events: number }` (app events only, not `$`)
  - `eventSeriesQuery(ctx, sel)` → `MetricRow { period: Period; day: string | null; n: number }` (`day` NULL = range total)
  - `eventBreakdownQuery(ctx, sel & { by: string })` → `MetricRow & { value: string | null }` (`value` NULL = Other)
  - `propValuesQuery(ctx, event: string, key: string)` → `{ value: string; n: number }`

- [ ] **Step 6.1: Failing tests**

```ts
const sel: ExplorerSelection = { event: "calendar_poll", metric: { kind: "distinct", key: "subscription" }, filter: { key: "kind", value: "token" }, by: null };

it("event, keys and values are parameters", () => {
  const q = eventSeriesQuery(ctx, sel);
  expect(q.params).toMatchObject({ event: "calendar_poll", metric_key: "subscription", filter_key: "kind", filter_value: "token" });
  expect(q.sql).toContain("LAX_STRING(props[@filter_key]) = @filter_value");
  expect(q.sql).toContain("COUNT(DISTINCT LAX_STRING(props[@metric_key]))");
  expect(q.sql).not.toContain("subscription");
  expect(q.sql).not.toContain("token");
});
it("daily rows and a range total in one query", () => {
  expect(eventSeriesQuery(ctx, sel).sql).toContain("GROUPING SETS ((period, day), (period))");
});
it("sessions count only sessions with a pageview", () => {
  const sql = eventSeriesQuery(ctx, { ...sel, metric: { kind: "sessions" }, filter: null }).sql;
  expect(sql).toContain("'$pageview'");
  expect(sql).toContain("COUNT(DISTINCT pv_session)");
});
it("no filter, no filter params", () => {
  const q = eventSeriesQuery(ctx, { ...sel, metric: { kind: "events" }, filter: null });
  expect(q.params.filter_key).toBeUndefined();
  expect(q.sql).not.toContain("@filter_key");
});
it("breakdown: top 20 by events in the current range, rest in Other", () => {
  const q = eventBreakdownQuery(ctx, { ...sel, by: "client" });
  expect(q.params.by_key).toBe("client");
  expect(q.sql).toContain("LIMIT 20");
  expect(q.sql).toContain("GROUPING SETS ((period, value, day), (period, value))");
});
it("event list excludes built-in events", () => {
  expect(eventListQuery(ctx).sql).toContain("NOT STARTS_WITH(event_name, '$')");
});
```

- [ ] **Step 6.2: Run to see them fail.** Run: `cd apps/dashboard && npx vitest run src/queries/explorer.test.ts`. Expected: FAIL.

- [ ] **Step 6.3: Implement**

`eventSeriesQuery` shape:

```sql
WITH <evp: event_name, timestamp, visitor_id, session_id, props>,
[pv_sessions AS (SELECT DISTINCT session_id FROM evp WHERE event_name = '$pageview' AND session_id IS NOT NULL),]  -- only for metric sessions
sel AS (
  SELECT e.period, e.day, e.visitor_id, e.props [, ps.session_id AS pv_session]
  FROM evp e [LEFT JOIN pv_sessions ps USING (session_id)]
  WHERE e.event_name = @event AND e.period IS NOT NULL [AND LAX_STRING(e.props[@filter_key]) = @filter_value]
)
SELECT period, CAST(day AS STRING) AS day, <metric> AS n
FROM sel GROUP BY GROUPING SETS ((period, day), (period))
```

Metric expressions: events `COUNT(*)`, sessions `COUNT(DISTINCT pv_session)`, visitors `COUNT(DISTINCT visitor_id)`, distinct `COUNT(DISTINCT LAX_STRING(props[@metric_key]))`. Sessions and visitors here are counted per day by the event's own day (explorer rule; the session first-event rule applies to overview and funnels).

`eventBreakdownQuery`: `sel` plus `IFNULL(LAX_STRING(props[@by_key]), '(none)') AS value`, `top` = 20 values by `COUNT(*)` in `period = 'cur'`, bucket by `LEFT JOIN top` as in Task 3, then `GROUPING SETS ((period, value, day), (period, value))`.

`eventListQuery`: per period, `event_name`, day, `COUNT(*)`. `propValuesQuery`: current period, non-NULL values, top 20 by count.

- [ ] **Step 6.4: Append dry-run cases** (one per metric kind, with and without filter, the breakdown, list and prop values, using `calendar_poll` / `subscription` / `kind` / `client` from the demo profile).

- [ ] **Step 6.5: Tests pass.** Run unit tests and the dry run as in Step 3.7. Expected: PASS.

- [ ] **Step 6.6: Commit**

```bash
git add apps/dashboard/src
git commit -m "feat(dashboard): explorer queries (event list, metric series, prop breakdown, prop values)"
```

---

### Task 7: Explorer state, models and page

**Files:**
- Create: `apps/dashboard/src/discovery/catalog.ts` (+ test), `apps/dashboard/src/explorer/state.ts` (+ test), `apps/dashboard/src/explorer/model.ts` (+ test), `apps/dashboard/src/components/event-list.tsx`, `apps/dashboard/src/components/explorer-controls.tsx` (+ test), `apps/dashboard/src/app/[appId]/events/page.tsx`, `apps/dashboard/src/app/[appId]/events/loading.tsx`
- Modify: `apps/dashboard/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `listEvents`, `listPropKeys` (Phase B), Task 6 types and builders, Task 4 components, `loadPage` (Task 5).
- Produces:
  - `interface Catalog { events: Array<{ name: string; withVisitor: boolean; withSession: boolean }>; keys: Record<string, string[]> }`; `buildCatalog(events: Array<{ event_name: string; with_visitor: number; with_session: number }>, keys: Array<{ event_name: string; prop_key: string }>): Catalog`.
  - `parseExplorer(sp: Record<string, string | string[] | undefined>, catalog: Catalog): ExplorerSelection | null` (null when no valid `event`).
  - `explorerParams(sel: ExplorerSelection | null): Array<[string, string]>` (for `viewQuery` and the header's `hidden`).
  - URL encoding: `event=<name>`, `metric=events|sessions|visitors|distinct:<key>`, `filter=<key>:<value>`, `by=<key>`.
  - `toEventList(rows: EventListRow[], ctx, catalog): Array<{ name: string; total: number; change: number | null | undefined; spark: number[] }>` (every catalog event, 0 when it has no rows, sorted by total).
  - `metricTotals(rows: MetricRow[], metric: Metric, days: number): { cur: number; prev: number | null }` (visitors and distinct: per-day average from day rows; events and sessions: the total row; `prev` is null when there is no `prev` row at all).
  - `toPropBreakdown(rows, metric, days, compare): Array<{ label: string; isOther: boolean; cur: number; change: number | null | undefined }>`.
  - `ExplorerControls({ appId, qsBase: Array<[string, string]>, catalog, sel, values: string[] })`: a GET form with metric select labeled "Metric" (option values as in the URL encoding; visitors and sessions options only when the event has those ids), filter key select labeled "Filter by" ("No filter" first) plus value input labeled "Value" with a `datalist` of `values`, breakdown select labeled "Break down by" ("No breakdown" first), Apply button. The form keeps `from`, `to`, `compare` and `event` as hidden inputs.

- [ ] **Step 7.1: Failing tests**

```ts
// explorer/state.test.ts
const catalog: Catalog = {
  events: [
    { name: "calendar_poll", withVisitor: false, withSession: false },
    { name: "place_selected", withVisitor: true, withSession: true },
  ],
  keys: { calendar_poll: ["subscription", "kind", "client"], place_selected: ["source", "place"] },
};

it("parses a full selection; the filter value may contain colons", () => {
  expect(parseExplorer({ event: "calendar_poll", metric: "distinct:subscription", filter: "kind:a:b", by: "client" }, catalog)).toEqual({
    event: "calendar_poll", metric: { kind: "distinct", key: "subscription" }, filter: { key: "kind", value: "a:b" }, by: "client",
  });
});
it("unknown event: no selection", () => {
  expect(parseExplorer({ event: "gone_event" }, catalog)).toBeNull();
  expect(parseExplorer({}, catalog)).toBeNull();
});
it("drops pieces discovery does not know, keeps the rest", () => {
  expect(parseExplorer({ event: "place_selected", metric: "distinct:nope", filter: "nope:x", by: "nope" }, catalog)).toEqual({
    event: "place_selected", metric: { kind: "events" }, filter: null, by: null,
  });
});
it("visitor and session metrics need those ids", () => {
  expect(parseExplorer({ event: "calendar_poll", metric: "visitors" }, catalog)?.metric).toEqual({ kind: "events" });
  expect(parseExplorer({ event: "place_selected", metric: "sessions" }, catalog)?.metric).toEqual({ kind: "sessions" });
});
it("filter values: empty or longer than 200 characters are dropped; unicode and % survive the round trip", () => {
  expect(parseExplorer({ event: "place_selected", filter: "place:" }, catalog)?.filter).toBeNull();
  expect(parseExplorer({ event: "place_selected", filter: `place:${"x".repeat(201)}` }, catalog)?.filter).toBeNull();
  const sel = parseExplorer({ event: "place_selected", filter: "place:Köln 100% | Süd" }, catalog)!;
  const qs = new URLSearchParams(explorerParams(sel));
  expect(parseExplorer(Object.fromEntries(qs), catalog)).toEqual(sel);
});

// explorer/model.test.ts
it("metricTotals: per-day average for visitors, total row for events", () => {
  const rows = [
    { period: "cur", day: "2026-10-01", n: 4 }, { period: "cur", day: "2026-10-02", n: 2 },
    { period: "cur", day: null, n: 5 }, { period: "prev", day: null, n: 10 },
  ] as const;
  expect(metricTotals([...rows], { kind: "visitors" }, 3)).toEqual({ cur: 2, prev: 0 });
  expect(metricTotals([...rows], { kind: "events" }, 3)).toEqual({ cur: 5, prev: 10 });
});
```

`explorer-controls.test.tsx`: for `place_selected` with filter `source:map` and `values=["map","search"]`: the metric select offers Events, Sessions, Visitors, Distinct values of source, Distinct values of place; the filter key select has `source` selected; the value input has value `map` and a datalist with both values. For `calendar_poll` the metric select has no Visitors and no Sessions option.

`discovery/catalog.test.ts`: `with_visitor: 0` gives `withVisitor: false`; keys grouped per event in the given order; quoted keys never appear (they are filtered by `listPropKeys` already, assert `buildCatalog` does not add any).

- [ ] **Step 7.2: Run to see them fail.** Run: `cd apps/dashboard && npx vitest run src/explorer src/discovery src/components/explorer-controls.test.tsx`. Expected: FAIL.

- [ ] **Step 7.3: Implement** state, catalog, models and components per the Interfaces block.

- [ ] **Step 7.4: The page** `src/app/[appId]/events/page.tsx`

- `loadPage`, then catalog from `listEvents` and `listPropKeys`. If discovery fails, render `QueryError` in place of the list and no selection (the page still renders).
- Header with `page="events"` and `hidden = explorerParams(sel)`.
- Left: `EventList` panel (name as a link that sets `event` and keeps the range, total, change, `Sparkline`), test id `event-list`.
- Right, when `sel` is set: `ExplorerControls`, the series `TrendChart` with the range total (`explorer-total` test id, label "per day" for visitors and distinct), and when `by` is set, the breakdown table. When the selected event has neither visitor nor session ids, a short line says "Server event: no visitor or session metrics."
- Without a selection: "Pick an event on the left."

- [ ] **Step 7.5: e2e**

```ts
test("explorer: distinct subscriptions per day with a filter", async ({ page }) => {
  await page.goto("/demo/events");
  await page.getByTestId("event-list").getByRole("link", { name: "calendar_poll" }).click();
  await page.getByLabel("Metric").selectOption("distinct:subscription");
  await page.getByLabel("Filter by").selectOption("kind");
  await page.getByLabel("Value").fill("token");
  await page.getByRole("button", { name: "Apply" }).last().click();
  await expect(page).toHaveURL(/metric=distinct%3Asubscription/);
  await expect(page).toHaveURL(/filter=kind%3Atoken/);
  await expect(page.getByTestId("explorer-total")).not.toHaveText(/^0/);
});
```

- [ ] **Step 7.6: Verify** as in Step 5.3, and look at the page at both widths.

- [ ] **Step 7.7: Commit**

```bash
git add apps/dashboard
git commit -m "feat(dashboard): events explorer with metric choice, one filter and prop breakdown"
```

---

## PR 10: Funnels (branch `feat/dashboard-funnels` from `feat/dashboard-explorer`)

### Task 8: Funnel steps, funnel query and saved funnels store

**Files:**
- Create: `apps/dashboard/src/funnels/steps.ts` (+ test), `apps/dashboard/src/queries/funnel.ts` (+ test), `apps/dashboard/src/config/funnels.ts` (+ test)
- Modify: `apps/dashboard/src/config/data.ts` (add `getFunnels`), `apps/dashboard/src/queries/dry-run.integration.test.ts`

**Interfaces:**
- Consumes: Task 2 context, `Catalog` (Task 7), `NAME_RE` rule `^\$?[a-z0-9_]{1,64}$` (copy as `EVENT_NAME_RE` in `funnels/steps.ts` with a comment pointing to `packages/rt-analytics/src/next/validate.ts`).
- Produces:
  - `interface FunnelStep { event: string; filter: { key: string; value: string } | null }` (for `$pageview` the only key is `path`).
  - `parseStep(raw: string): FunnelStep | null` (`event` or `event:key:value`, split at the first two colons), `encodeStep(step: FunnelStep): string`.
  - `allowedFor(catalog: Catalog, saved: SavedFunnel[]): { events: Set<string>; keys: Record<string, Set<string>> }` (catalog events with `withSession`, plus `$pageview` with key `path`, plus events and keys of saved funnels).
  - `validateSteps(steps: Array<FunnelStep | null>, allowed): FunnelStep[] | null` (2 to 5 valid steps, else null).
  - `toFunnelView(rows: FunnelRow[], stepCount: number, compare: boolean): Array<{ step: number; cur: number; prev: number | null; fromFirst: number | null; fromPrev: number | null; prevFromFirst: number | null }>`.
  - `funnelQuery(ctx: QueryContext, steps: FunnelStep[]): QuerySpec` → `FunnelRow { period: Period; step: number; sessions: number }`.
  - `interface SavedFunnel { id: string; name: string; steps: FunnelStep[] }`; `listFunnelsQuery(env, appId)`, `saveFunnelQuery(env, appId, funnel: SavedFunnel, email: string)`, `deleteFunnelQuery(env, appId, id: string)`; `parseSavedFunnel(row: { id: string; name: string | null; value: string }): SavedFunnel | null`; `FUNNEL_ID_RE = /^[0-9a-f-]{36}$/`; `getFunnels(appId): Promise<SavedFunnel[]>` (tag `rtd:config`, TTL one day, bad rows skipped).

- [ ] **Step 8.1: Failing tests**

```ts
// funnels/steps.test.ts
it("parse and encode round trip, values may contain colons and pipes", () => {
  expect(parseStep("place_selected")).toEqual({ event: "place_selected", filter: null });
  expect(parseStep("$pageview:path:/a:b|c")).toEqual({ event: "$pageview", filter: { key: "path", value: "/a:b|c" } });
  const s = { event: "subscribe_click", filter: { key: "target", value: "Google Kalender ü" } };
  expect(parseStep(encodeStep(s))).toEqual(s);
});
it("rejects bad names, empty keys or values", () => {
  expect(parseStep("bad name")).toBeNull();
  expect(parseStep("x:key:")).toBeNull();
  expect(parseStep("x::v")).toBeNull();
});
it("validateSteps: 2 to 5 known steps; $pageview only with path; saved funnels keep their keys", () => {
  // catalog: the same fixture as in explorer/state.test.ts
  const allowed = allowedFor(catalog, [{ id: "1", name: "old", steps: [{ event: "place_selected", filter: { key: "legacy", value: "1" } }, { event: "subscribe_click", filter: null }] }]);
  const ok = [parseStep("place_selected:legacy:1"), parseStep("subscribe_click")];
  expect(validateSteps(ok, allowed)).toHaveLength(2);
  expect(validateSteps([parseStep("place_selected")], allowed)).toBeNull();
  expect(validateSteps(Array(6).fill(parseStep("place_selected")), allowed)).toBeNull();
  expect(validateSteps([parseStep("$pageview:source:x"), parseStep("subscribe_click")], allowed)).toBeNull();
  expect(validateSteps([parseStep("calendar_poll"), parseStep("subscribe_click")], allowed)).toBeNull(); // server event, no sessions
});
it("toFunnelView: conversion from first and previous, no NaN after a 0 step", () => {
  const rows = [
    { period: "cur", step: 1, sessions: 100 }, { period: "cur", step: 2, sessions: 40 },
    { period: "prev", step: 1, sessions: 50 },
  ] as const;
  expect(toFunnelView([...rows], 3, true)).toEqual([
    { step: 1, cur: 100, prev: 50, fromFirst: 1, fromPrev: null, prevFromFirst: 1 },
    { step: 2, cur: 40, prev: 0, fromFirst: 0.4, fromPrev: 0.4, prevFromFirst: 0 },
    { step: 3, cur: 0, prev: 0, fromFirst: 0, fromPrev: 0, prevFromFirst: 0 },
  ]);
  expect(toFunnelView([], 2, false)[1]).toEqual({ step: 2, cur: 0, prev: null, fromFirst: null, fromPrev: null, prevFromFirst: null });
});

// queries/funnel.test.ts
it("one CTE per step, strictly later timestamps, params per step", () => {
  const q = funnelQuery(ctx, [
    { event: "$pageview", filter: { key: "path", value: "/" } },
    { event: "place_selected", filter: { key: "source", value: "map" } },
    { event: "subscribe_click", filter: null },
  ]);
  expect(q.params).toMatchObject({ e1: "$pageview", v1: "/", e2: "place_selected", k2: "source", v2: "map", e3: "subscribe_click" });
  expect(q.params.k1).toBeUndefined();
  expect(q.sql).toContain("ev.page_path = @v1");
  expect(q.sql).toContain("LAX_STRING(ev.props[@k2]) = @v2");
  expect(q.sql.match(/ev\.timestamp > s\d\.t/g)).toHaveLength(2);
  expect(q.sql).not.toContain("place_selected");
});

// config/funnels.test.ts
it("save is a MERGE on kind and id with the value as JSON param", () => {
  const q = saveFunnelQuery(env, "demo", { id: "0b5c…uuid", name: "Signup", steps }, "a@b.de");
  expect(q.sql).toContain("MERGE");
  expect(q.sql).toContain("'funnel'");
  expect(JSON.parse(q.params.value as string)).toEqual({ steps });
});
it("delete is scoped to app and kind", () => {
  expect(deleteFunnelQuery(env, "demo", "id").sql).toMatch(/kind = 'funnel' AND id = @id AND app_id = @app_id/);
});
it("parseSavedFunnel skips broken rows", () => {
  expect(parseSavedFunnel({ id: "x", name: "n", value: "{}" })).toBeNull();
  expect(parseSavedFunnel({ id: "x", name: "n", value: '{"steps":[{"event":"bad name","filter":null}]}' })).toBeNull();
});
```

(Use a real UUID in place of `0b5c…uuid` in the test.)

- [ ] **Step 8.2: Run to see them fail.** Expected: FAIL.

- [ ] **Step 8.3: Implement `funnelQuery`** (step count from the validated array, never from text input):

```sql
WITH <evp: event_name, timestamp, session_id, page_path, props>,
sessions AS (
  SELECT session_id, MIN(timestamp) AS start_ts FROM evp
  WHERE session_id IS NOT NULL GROUP BY session_id
  HAVING COUNTIF(event_name = '$pageview') > 0
),
ev AS (
  SELECT e.session_id, e.timestamp, e.event_name, e.page_path, e.props, <periodOf("s.start_ts")> AS period
  FROM evp e JOIN sessions s USING (session_id)
),
s1 AS (SELECT session_id, ANY_VALUE(period) AS period, MIN(timestamp) AS t FROM ev WHERE period IS NOT NULL AND <cond(1)> GROUP BY session_id),
s2 AS (SELECT s1.session_id, ANY_VALUE(s1.period) AS period, MIN(ev.timestamp) AS t
       FROM s1 JOIN ev ON ev.session_id = s1.session_id AND ev.timestamp > s1.t
       WHERE <cond(2)> GROUP BY s1.session_id),
-- s3..sN like s2
SELECT period, 1 AS step, COUNT(*) AS sessions FROM s1 GROUP BY period
UNION ALL SELECT period, 2, COUNT(*) FROM s2 GROUP BY period
-- ... up to N
```

`cond(k)`: `ev.event_name = @e{k}`, plus `ev.page_path = @v{k}` for a `$pageview` path filter or `LAX_STRING(ev.props[@k{k}]) = @v{k}` for a prop filter. Step 1's `cond` uses the same `ev.` prefix (alias the table `ev` in s1).

- [ ] **Step 8.4: Implement** steps, store and `getFunnels`. Funnel list SQL: `SELECT id, name, TO_JSON_STRING(value) AS value FROM <config> WHERE kind = 'funnel' AND app_id = @app_id ORDER BY name, updated_at`.

- [ ] **Step 8.5: Dry-run cases**: a 2-step and a 5-step funnel on demo events (`$pageview` with path `/`, `place_selected` with `source`, `subscribe_click`), plus `listFunnelsQuery`.

- [ ] **Step 8.6: Tests pass** (unit and dry run). **Step 8.7: Commit**

```bash
git add apps/dashboard/src
git commit -m "feat(dashboard): funnel steps, session funnel query, saved funnels store"
```

---

### Task 9: Funnel page, editor, save and delete

**Files:**
- Create: `apps/dashboard/src/components/funnel-editor.tsx` (+ test), `apps/dashboard/src/components/funnel-result.tsx`, `apps/dashboard/src/app/[appId]/funnels/page.tsx`, `apps/dashboard/src/app/[appId]/funnels/loading.tsx`, `apps/dashboard/src/app/[appId]/funnels/actions.ts`
- Modify: `apps/dashboard/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: Task 8, `loadPage`, catalog (Task 7).
- Produces:
  - `FunnelEditor({ events: string[]; keys: Record<string, string[]>; initial: FunnelStep[]; baseQuery: Array<[string, string]> })` (client): rows with event select, filter key select (keys of that event; `path` for `$pageview`; "no filter" first) and value input; "Add step" disabled at 5, "Remove" disabled at 2 rows; "Show funnel" pushes `?<baseQuery>&steps=<encoded>&steps=…` with `useRouter().push`, skipping rows without an event and filters without a value.
  - Server actions in `funnels/actions.ts`: `saveFunnel(appId: string, steps: string[], qs: string, formData: FormData)` (name from `formData.get("name")`, trimmed, 1–80 characters; steps re-parsed and validated against `allowedFor(catalog, saved)`; id `crypto.randomUUID()`; on success `updateTag(TAGS.config)` and redirect to `/<appId>/funnels?<qs params without steps, plus funnel=<id>>` built with `URLSearchParams`; on bad input redirect with `?error=name` or `?error=steps`; on query failure `?error=save`). `deleteFunnel(appId: string, id: string, qs: string)` (`FUNNEL_ID_RE`, then delete, `updateTag(TAGS.config)`, redirect without `funnel`). Both call `requireUser()` and validate `appId` first.
  - URL: `steps` (repeated) and `funnel=<id>`. When `funnel` names a saved funnel, its steps win over `steps`.

- [ ] **Step 9.1: Failing editor test**

```tsx
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

it("builds the steps URL from the rows", async () => {
  render(<FunnelEditor events={["$pageview", "place_selected", "subscribe_click"]} keys={{ $pageview: ["path"], place_selected: ["source"] }} initial={[]} baseQuery={[["from", "2026-10-01"], ["to", "2026-10-16"]]} />);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Step 1 event"), "place_selected");
  await user.selectOptions(screen.getByLabelText("Step 1 filter"), "source");
  await user.type(screen.getByLabelText("Step 1 value"), "map:x");
  await user.selectOptions(screen.getByLabelText("Step 2 event"), "subscribe_click");
  await user.click(screen.getByRole("button", { name: "Show funnel" }));
  expect(push).toHaveBeenCalledWith("?from=2026-10-01&to=2026-10-16&steps=place_selected%3Asource%3Amap%3Ax&steps=subscribe_click");
});
it("2 to 5 rows", async () => {
  render(<FunnelEditor events={["a"]} keys={{}} initial={[]} baseQuery={[]} />);
  expect(screen.getAllByRole("button", { name: /Remove step/ })[0]).toBeDisabled();
  const user = userEvent.setup();
  for (let i = 0; i < 3; i++) await user.click(screen.getByRole("button", { name: "Add step" }));
  expect(screen.getByRole("button", { name: "Add step" })).toBeDisabled();
});
```

Add `@testing-library/user-event` (latest stable) as a dev dependency if it is missing.

- [ ] **Step 9.2: Run to see it fail.** Expected: FAIL.

- [ ] **Step 9.3: Implement** the editor, `FunnelResult` (table: step, event and filter, sessions, from first, from previous, previous period sessions and from-first when compare is on; a horizontal bar per step sized by `fromFirst`; test ids `funnel-step-<n>` on the row and `funnel-sessions-<n>` on the sessions cell) and the actions.

- [ ] **Step 9.4: The page** `src/app/[appId]/funnels/page.tsx`

- `loadPage`, catalog, `getFunnels(appId)`; `allowed = allowedFor(catalog, saved)`.
- Steps from the saved funnel (`funnel`) or from `steps`; `validateSteps`; unknown `funnel` id → message "This saved funnel does not exist any more." and the editor with no steps.
- Header with `page="funnels"` and `hidden` = `steps` pairs plus `funnel`.
- Saved funnels panel: list with links (`?funnel=<id>` keeping the range) and a delete form per entry (button "Delete <name>").
- Editor panel, then result panel (`dataQuery(funnelQuery(ctx, steps), …)`) when steps are valid, else "Choose 2 to 5 steps and press Show funnel."
- Save form (name input labeled "Funnel name", button "Save funnel") under the result. Error messages: `name` "Give the funnel a name (up to 80 characters).", `steps` "These steps are not valid any more.", `save` "Could not save the funnel. Try again."
- Known-limit note under the result: "Counts sessions. Cookieless sessions end at a full page load and when cookies are accepted, so funnels across those lose sessions."

- [ ] **Step 9.5: e2e**

```ts
test("funnels: build, save, reopen and delete", async ({ page }) => {
  const name = `e2e ${Date.now()}`;
  await page.goto("/demo/funnels");
  await page.getByLabel("Step 1 event").selectOption("place_selected");
  await page.getByLabel("Step 2 event").selectOption("subscribe_click");
  await page.getByRole("button", { name: "Show funnel" }).click();
  await expect(page.getByTestId("funnel-sessions-1")).not.toHaveText("0");
  await page.getByLabel("Funnel name").fill(name);
  await page.getByRole("button", { name: "Save funnel" }).click();
  await expect(page).toHaveURL(/funnel=[0-9a-f-]{36}/);
  await page.goto("/demo/funnels");
  await page.getByRole("link", { name }).click();
  await expect(page.getByTestId("funnel-step-2")).toBeVisible();
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await expect(page.getByRole("link", { name })).toHaveCount(0);
});
```

- [ ] **Step 9.6: Verify** as in Step 5.3, and look at the page at both widths.

- [ ] **Step 9.7: Commit**

```bash
git add apps/dashboard package-lock.json
git commit -m "feat(dashboard): funnel builder with saved funnels"
```

---

## PR 11: Secrets guide (branch `docs/dashboard-secrets-guide` from `feat/dashboard-funnels`)

### Task 10: HTML guide for the dashboard's secrets in Chrome Password Manager

**Files:**
- Create: `docs/guides/dashboard-secrets.html`
- Modify: `apps/dashboard/README.md` (link to the guide)

The repo is public: the guide names variables and where they live, never values.

- [ ] **Step 10.1: Check the current Chrome UI**

Search the web for the current steps (Chrome desktop and Android/iOS, as of today): opening Google Password Manager (`chrome://password-manager`), turning on on-device encryption ("Set up on-device encryption" in Password Manager settings, which needs the Google account password or a passkey and cannot be turned off again), adding a password by hand, and adding a note. Note the source URLs in an HTML comment at the top of the guide.

- [ ] **Step 10.2: Write the guide**

One self-contained HTML file (inline CSS, light and dark via `prefers-color-scheme`, readable at phone width, no external scripts). Sections:

1. Why: one paragraph (secrets exist only in Vercel and local files; the Downloads copies stay).
2. Turn on on-device encryption first, with the steps from 10.1 and the warning that it cannot be undone and that losing the Google account password and all devices loses the passwords.
3. One entry per secret, as a table: site, username (= variable name), where to copy the value from, note text. Rows:
   - `https://vercel.com` / `BETTER_AUTH_SECRET` (production) / Vercel project rt-analytics-dashboard, sensitive env var (value is not readable after saving; if it was not kept, generate a new one with `openssl rand -base64 32`, update Vercel and redeploy, which signs everyone out) / "rt-analytics dashboard, session encryption, production".
   - `http://localhost:3000` / `BETTER_AUTH_SECRET` (local) / `apps/dashboard/.env.local` / "rt-analytics dashboard, session encryption, local".
   - `https://console.cloud.google.com` / `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` / Google Cloud console, project robin-thues, APIs & Services, Credentials, OAuth client of the dashboard / "rt-analytics dashboard, Google sign-in".
   - `http://localhost:3300` / `DASHBOARD_TEST_LOGIN_SECRET` / `apps/dashboard/.env.local` / "rt-analytics dashboard, Playwright test login, local only".
   - For completeness, the library's writer secrets already in the root `.env.analytics` and `key.json` (`ANALYTICS_SALT`, `ANALYTICS_IGNORE_KEY`, `ANALYTICS_PSEUDONYM_KEY`, the writer service account key) with the note "never rotate ANALYTICS_PSEUDONYM_KEY".

   Check every variable name against `apps/dashboard/.env.local`, the root `.env.analytics` and spec section 10 before writing (names only, read the files without printing values, e.g. `cut -d= -f1`).
4. How to add one entry, with the steps from 10.1.
5. What is not a secret (the GCP project number, pool ids, service account email, allowed emails) and does not need an entry.

- [ ] **Step 10.3: Check it**

Open the file in the Playwright browser at 1280 px and 390 px, light and dark. No horizontal scroll, the table readable on the phone width (stacked rows).

- [ ] **Step 10.4: Commit**

```bash
git add docs/guides/dashboard-secrets.html apps/dashboard/README.md
git commit -m "docs: guide for keeping the dashboard's secrets in Chrome Password Manager"
```

---

## Finish

### Task 11: Whole-branch verification and fresh review

- [ ] **Step 11.1:** From the repo root: `npm test`, `npm run lint --workspaces --if-present`, `npm run typecheck --workspaces --if-present`, `cd apps/dashboard && npm run build && npx playwright test`, and the dry run (`RTD_DRY_RUN=1 …`). Expected: all PASS; paste the dry-run byte estimates into the review notes.
- [ ] **Step 11.2:** Dispatch one fresh reviewer on the most capable model over `main..docs/dashboard-secrets-guide` with the spec, this plan and the Review Focus list. Work in the findings (each fix its own commit), re-run Step 11.1.
- [ ] **Step 11.3:** Update the memory note `dashboard-design-decisions.md` with the state and any deferred minors.

### Task 12: Release (needs Robin's OK for each external step)

- [ ] **Step 12.1:** Ask Robin to merge: fast-forward `main` to the last branch and push. The push deploys the dashboard (ignore script: `apps/dashboard` changed).
- [ ] **Step 12.2:** Watch the Vercel build (it now runs the library build first, Task 1). Then open production: sign in, overview, explorer, funnels on demo and on `wetter-in-kalender`.
- [ ] **Step 12.3:** Open check from Phase B: after an hour of normal use with TTL 3600, read the runtime logs (`get_runtime_logs`, filter errors) for failures in background revalidation of `'use cache: remote'` entries (OIDC token missing). Report what was seen.
- [ ] **Step 12.4:** Update the memory notes (dashboard live state, next steps: v2 list in spec section 13, follow-ups).
