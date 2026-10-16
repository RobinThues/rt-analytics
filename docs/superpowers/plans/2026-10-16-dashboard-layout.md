# Dashboard layout, range picker, funnel chart and skeletons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v1 header with a sidebar (app switcher, pages, settings, sign out) and a page top
bar with a direct-apply range picker, show static panel frames with skeletons on page and app switches,
keep old numbers dimmed on same-page changes, and add a left-to-right funnel chart.

**Architecture:** A new `[appId]/layout.tsx` holds the sidebar and a content area that is a Tailwind
group (`group/content`). Pages become synchronous shells: static frames outside Suspense, each data
part inside the frame's Suspense with a skeleton, reading the request through memoized loaders
(`loadPage`, `loadExplorer`, `loadFunnelPage`). Same-page changes run `router.push` inside a
transition (`usePendingNavigation`); the control marks itself `data-pending`, and CSS
(`group-has-data-pending/content:`) dims the page body and shows a progress line. This works because
the page segment key has no search params (`layout-router.js`: "search params do not cause state to
be lost"), so a transition keeps already shown Suspense content. App switches do change nothing in the
segment keys either (`create-segment-key.js` drops the param value), so every data part sits in an
inner `<Suspense key={appId}>` that remounts on an app switch and shows skeletons. Page switches use
normal prefetched `<Link>`s, so the prefetched shell (frames plus skeletons) shows at once.

**Tech Stack:** Next.js 16.4 (`cacheComponents`, `partialPrefetching`), React 19.3, Tailwind 4,
shadcn (`base-nova` style, Base UI), Recharts (existing), `react-day-picker` (via shadcn Calendar),
Vitest + Testing Library + happy-dom, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-16-dashboard-layout-design.md` (mockups in
`docs/superpowers/specs/2026-10-16-dashboard-layout-mockups/`). v1 spec:
`docs/superpowers/specs/2026-10-14-dashboard-design.md`.

**Branch:** `feat/dashboard-layout` (from `fix/sparkline-tooltip`, which holds the sparkline fix and the
design doc). Work in the main checkout (env files, `.vercel` and `node_modules` live there).

## Global Constraints

- No new colors, fonts or visual identity; keep today's tokens and shadcn defaults. No dark mode.
- Sidebar width fixed (Tailwind `w-56`), not collapsible.
- No queries, metrics or caching rules change; one query per panel as today; Live and Refresh unchanged.
- Every view stays a URL: `from`, `to`, `compare` and page parameters (`event`, `metric`, `filter`,
  `by`, `steps`, `funnel`) stay in the URL.
- No extra BigQuery queries from intermediate states (a range applies only when complete).
- No layout jumps while loading: skeletons take about the size of their content; no optimistic frame
  that later vanishes.
- 390 px wide without horizontal page scrolling.
- JavaScript is required; no `<noscript>` or plain-form fallbacks.
- Range limits as `parseViewState`: start ≤ end, end ≤ today (app timezone), under 400 days.
- Presets: "Last 7 days", "Last 28 days", "Last 90 days", ending today in the app's timezone.
- Accessible names that tests use (exact): range trigger button "Date range"; preset buttons
  "Last 7 days", "Last 28 days", "Last 90 days"; checkbox "Compare"; app switcher trigger
  "Switch app"; app filter field "Filter apps"; nav landmark "Pages" with links "Overview", "Events",
  "Funnels", "Settings"; button "Sign out"; phone menu button "Open menu".
- Panel titles are `<h2>` headings (today `CardTitle` is a `div`).
- Every skeleton carries `data-testid="skeleton"`.
- Dates in client code never go through `toISOString()` or `new Date("YYYY-MM-DD")`; use the local
  date helpers from Task 4.
- Read the Next.js docs in `node_modules/next/dist/docs/` (repo root) before writing layout, Link or
  navigation code. Check current stable versions of anything newly installed.
- Project scripts go in `claude-tmp-helpers/` (gitignored), never inline one-off code. Commits carry no
  Claude attribution trailers.

## Review Focus

1. Two range changes in quick succession (a preset, then another preset while the first is pending):
   the last one wins, the URL and numbers match it. → Task 5 e2e "quick second preset wins".
2. Switching apps while an event or funnel is selected: the new app opens on the same page with the
   same range, without the old app's `event`, `steps` or `funnel`, and shows skeletons, never the old
   app's numbers. → Task 6 unit tests for `appSwitchHref` and e2e "app switch shows skeletons".
3. Cmd/Ctrl/Shift/Alt/middle click or `target` on a pending link opens a new tab or window instead of
   navigating in place. → Task 1 component test.
4. A funnel whose first step has 0 sessions, or compare off: the chart renders without NaN and without
   previous-period bars. → Task 8 unit tests.
5. Returning to a recently visited page after changing the range elsewhere (Next keeps the last 3
   pages in hidden `<Activity>`): the page never shows the old range's numbers undimmed. → Task 5 e2e
   "revisit after a range change".

## Shared test helper (used from Task 1 on)

`slowRsc(page: Page, ms: number): Promise<void>` in `apps/dashboard/e2e/helpers.ts`: routes every
request whose headers contain `rsc` and contain neither `next-router-prefetch` nor
`next-router-segment-prefetch`, waits `ms`, then continues it. Tests that use it call
`await page.waitForLoadState("networkidle")` before the click so prefetches are done.

---

### Task 1: Pending navigation and the dimmed content area

Proves the core mechanism before anything builds on it.

**Files:**
- Create: `apps/dashboard/src/lib/navigation.ts`, `apps/dashboard/src/components/pending-link.tsx`,
  `apps/dashboard/src/components/progress-line.tsx`, `apps/dashboard/src/components/page-body.tsx`,
  `apps/dashboard/src/app/[appId]/layout.tsx`, `apps/dashboard/e2e/helpers.ts`
- Modify: `apps/dashboard/src/components/event-list.tsx` (links become `PendingLink`),
  `apps/dashboard/src/app/[appId]/events/page.tsx` (wrap content in `PageBody`),
  `apps/dashboard/vitest.config.ts` (happy-dom `settings.navigation.disableMainFrameNavigation: true`)
- Test: `apps/dashboard/src/components/pending-link.test.tsx`, `apps/dashboard/e2e/dashboard.spec.ts`

**Interfaces:**
- Produces:
  - `usePendingNavigation(): { pending: boolean; navigate: (href: string, before?: () => void) => void }`
    in `src/lib/navigation.ts` (`"use client"`; `useTransition`; inside one `startTransition` it runs
    `before?.()` (for optimistic setters) and then `useRouter().push(href, { scroll: false })`).
  - `PendingLink(props: { href: string; className?: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">)`
    in `src/components/pending-link.tsx`: renders `<a href>`; a plain left click without modifier and
    without `target` calls `navigate` and prevents the default; any modifier (ctrl, meta, shift, alt),
    a non-left button or a `target` is left to the browser; sets `data-pending=""` while pending.
  - `PageBody({ children })` in `src/components/page-body.tsx`: `<div data-testid="page-body">` with
    `transition-opacity group-has-data-pending/content:opacity-50`.
  - `ProgressLine()` in `src/components/progress-line.tsx`: thin animated bar,
    `data-testid="progress-line"`, `hidden` unless `group-has-data-pending/content:block`.
  - `[appId]/layout.tsx`: `<div className="group/content min-w-0 flex-1"><ProgressLine />{children}</div>`
    (the sidebar is added in Task 6). The layout reads no request data.
  - `slowRsc` as above.

- [ ] **Step 1: Write the failing component tests** (`pending-link.test.tsx`, `next/navigation`
  mocked as in `funnel-editor.test.tsx`)

```tsx
it("a plain click navigates in place", async () => {
  render(<PendingLink href="/demo/events?event=a">a</PendingLink>);
  await userEvent.setup().click(screen.getByRole("link", { name: "a" }));
  expect(push).toHaveBeenCalledWith("/demo/events?event=a", { scroll: false });
});
it("modified, middle and target clicks are left to the browser", () => {
  render(<><PendingLink href="/x">x</PendingLink><PendingLink href="/y" target="_blank">y</PendingLink></>);
  const x = screen.getByRole("link", { name: "x" });
  for (const mod of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])
    fireEvent.click(x, mod);
  fireEvent.click(screen.getByRole("link", { name: "y" }));
  expect(push).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Write the failing e2e test**

```ts
test("explorer: picking another event keeps the old content dimmed", async ({ page }) => {
  await page.goto("/demo/events?event=place_selected");
  await expect(page.getByTestId("explorer-total")).toBeVisible();
  const before = await page.getByTestId("explorer-total").textContent();
  await page.waitForLoadState("networkidle");
  await slowRsc(page, 2000);
  await page.getByTestId("event-list").getByRole("link", { name: "subscribe_click" }).click();
  await expect(page.getByTestId("progress-line")).toBeVisible();
  await expect(page.getByTestId("explorer-total")).toHaveText(before ?? "");
  await expect(page.getByTestId("page-body")).toHaveCSS("opacity", "0.5");
  await expect(page).toHaveURL(/event=subscribe_click/, { timeout: 10_000 });
  await expect(page.getByTestId("progress-line")).toBeHidden();
});
```

- [ ] **Step 3: Run both.** `cd apps/dashboard && npx vitest run src/components/pending-link.test.tsx`
  and `npm run build && npx playwright test -g "keeps the old content dimmed"`.
  Expected: component test FAILS (module not found); e2e FAILS (no `progress-line`).
- [ ] **Step 4: Implement** the interfaces above; use `PendingLink` for the event names in `EventList`;
  wrap the events page content in `PageBody`.
- [ ] **Step 5: Run both again** (rebuild first). Expected: PASS. If the old content is replaced by a
  skeleton or `loading.tsx` during the transition, stop and find out why before Task 2.
- [ ] **Step 6: Run the whole suite** (`npx vitest run`, `npx playwright test`). Expected: all pass.
- [ ] **Step 7: Commit** `feat(dashboard): pending navigation keeps old content dimmed with a progress line`

### Task 2: Memoized page loading and the overview as a static shell

**Files:**
- Modify: `apps/dashboard/src/app/[appId]/page-data.ts`, `apps/dashboard/src/app/[appId]/page.tsx`,
  `apps/dashboard/src/components/panel.tsx`, `apps/dashboard/src/components/ui/card.tsx` (title as
  `h2` if `CardTitle` cannot take an element), and the call sites of `loadPage` in
  `apps/dashboard/src/app/[appId]/events/page.tsx:152`, `.../funnels/page.tsx:49`,
  `.../settings/page.tsx` (switch to `loadPage(input)` only; no other change there yet)
- Create: `apps/dashboard/src/components/skeletons.tsx`
- Delete: `apps/dashboard/src/app/[appId]/loading.tsx`
- Test: `apps/dashboard/src/app/[appId]/page-data.test.ts`, `apps/dashboard/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `PageBody`, `slowRsc` (Task 1).
- Produces:
  - `type PageInput = { params: Promise<{ appId: string }>; searchParams: Promise<SearchParams> }`.
  - `loadPage(input: PageInput): Promise<PageData>` memoized per input object with a module-level
    `WeakMap<PageInput, Promise<PageData>>` (each request has its own input object; React `cache` does
    not dedupe in Vitest). Pages create `input` once and pass that object down.
  - `PageData` gains `appIds: string[]`, the existing "current app added and sorted" list, built by an
    exported `appList(appId: string, ids: readonly string[]): string[]` (used again by the sidebar).
  - `WithPage({ input, children }: { input: PageInput; children: (data: PageData) => ReactNode })`:
    async server component.
  - `Panel` gains `fallback?: ReactNode` (default `<BlockSkeleton className="h-32" />`) and
    `title: ReactNode`; its title renders as `<h2>`.
  - Skeletons (all with `data-testid="skeleton"`): `KpiSkeleton()`, `ChartSkeleton({ height?: number })`,
    `TableSkeleton({ rows: number })`, `BlockSkeleton({ className?: string })`, `LineSkeleton()`.
  - Data parts are written as
    `<WithPage input={input}>{(d) => <Suspense key={d.appId} fallback={<SameSkeleton />}><KpiPanel ctx={d.ctx} live={d.live} maxBytes={d.maxBytes} /></Suspense>}</WithPage>`
    inside the frame's `Panel` (whose own Suspense shows the same skeleton). The inner keyed Suspense
    is what makes an app switch show skeletons (Task 6 tests it).

- [ ] **Step 1: Write the failing unit test** (`page-data.test.ts`; mock `@/auth/session`,
  `@/config/data`, `@/discovery/data`, `@/bq/query` and `@/env`)

```ts
it("loadPage runs once per input object", async () => {
  const input = { params: Promise.resolve({ appId: "demo" }), searchParams: Promise.resolve({}) };
  const [a, b] = await Promise.all([loadPage(input), loadPage(input)]);
  expect(a).toBe(b);
  expect(getSettings).toHaveBeenCalledTimes(1);
});
it("appList adds the current app and sorts", () => {
  expect(appList("wik", ["demo"])).toEqual(["demo", "wik"]);
  expect(appList("demo", ["wik", "demo"])).toEqual(["demo", "wik"]);
});
```

- [ ] **Step 2: Write the failing e2e tests**

```ts
test("overview: page switch shows panel frames with skeletons before data", async ({ page }) => {
  await page.goto("/demo/events");
  await page.waitForLoadState("networkidle");
  await slowRsc(page, 2000);
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
  await expect(page.getByTestId("skeleton").first()).toBeVisible();
  await expect(page.getByText("Loading…")).toHaveCount(0);
  await expect(page.getByTestId("kpi-pageviews")).toBeVisible({ timeout: 15_000 });
});
```

(Until Task 6 the "Overview" link is the one in today's `Header`.)

- [ ] **Step 3: Run them.** `npx vitest run 'src/app/[appId]/page-data.test.ts'`;
  `npm run build && npx playwright test -g "overview: page switch"`.
  Expected: unit FAIL (`loadPage` takes two arguments, `appList` missing); first e2e FAILS
  ("Loading…" fallback, no skeleton test ids).
- [ ] **Step 4: Implement** the interfaces; rewrite `[appId]/page.tsx` as a synchronous page with the
  panel frames outside Suspense and each body as a data part; the header and range line are rendered
  as data parts for now (Task 5 replaces them); delete `[appId]/loading.tsx` and the page-level
  `<Suspense fallback={<p>Loading…</p>}>`; switch the other pages' `loadPage` calls to `loadPage(input)`.
- [ ] **Step 5: Run them again** (rebuild). Expected: PASS.
- [ ] **Step 6: Run the whole e2e suite.** `npx playwright test` Expected: all pass.
- [ ] **Step 7: Commit** `feat(dashboard): overview renders static panel frames with skeletons`

### Task 3: Explorer, funnels and settings as static shells

**Files:**
- Modify: `apps/dashboard/src/app/[appId]/events/page.tsx`, `.../funnels/page.tsx`,
  `.../settings/page.tsx`, `apps/dashboard/src/app/loading.tsx`
- Create: `apps/dashboard/src/app/[appId]/events/explorer-data.ts`,
  `apps/dashboard/src/app/[appId]/funnels/funnel-data.ts`
- Delete: `apps/dashboard/src/app/[appId]/events/loading.tsx`, `.../funnels/loading.tsx`,
  `.../settings/loading.tsx`
- Test: `apps/dashboard/src/app/[appId]/events/explorer-data.test.ts`, `apps/dashboard/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `PageInput`, `loadPage`, `WithPage`, `Panel.fallback`, skeletons (Task 2); `PageBody` (Task 1).
- Produces (both memoized per input object like `loadPage`):
  - `loadExplorer(input: PageInput): Promise<{ page: PageData; events: QueryResult<…>; catalog: Catalog | null; sel: ExplorerSelection | null; pageParams: Array<[string, string]> }>`;
    it performs today's canonical `redirect` (fk/fv) itself, so every part sees the same result.
  - `loadFunnelPage(input: PageInput): Promise<{ page: PageData; events: …; saved: …; allowed: AllowedSteps; open: SavedFunnel | undefined; funnelId: string | null; steps: FunnelStep[] | null; editorSteps: FunnelStep[]; leftOut: boolean; pageParams: Array<[string, string]> }>`.

Static frames per spec: Events: the "Events" list panel; the right column is one untitled
`BlockSkeleton` (height of the controls plus a chart) until the selection is known. Funnels: "Saved
funnels" and the editor panel whose `title` is `<Suspense fallback="Funnel">` around a part that
renders the saved funnel's name or "Funnel"; the result area is one untitled `BlockSkeleton`. The
funnels error, stale-funnel and left-out lines render inside the right column's data part, above the
editor, so nothing above the grid moves. Settings: the settings panel frame. Root `app/loading.tsx`
renders a neutral full-page skeleton (no "Loading…" text). Each data part again uses an inner
`<Suspense key={appId}>`.

- [ ] **Step 1: Write the failing tests**
  - Unit: `loadExplorer` runs `listEvents` once for two parallel calls with the same input (mocks as
    in Task 2).
  - e2e:

```ts
for (const path of ["/demo/events?event=calendar_poll&metric=distinct%3Asubscription",
  "/demo/funnels?steps=place_selected&steps=subscribe_click", "/demo/settings"]) {
  test(`hard load of ${path} shows frames, then data, no Loading text`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await expect(page.getByText("Could not load this panel.")).toHaveCount(0);
    await expect(page.getByTestId("skeleton")).toHaveCount(0, { timeout: 15_000 });
  });
}
test("funnels: page switch shows the static frames first", async ({ page }) => {
  await page.goto("/demo");
  await page.waitForLoadState("networkidle");
  await slowRsc(page, 2000);
  await page.getByRole("link", { name: "Funnels" }).click();
  await expect(page.getByRole("heading", { name: "Saved funnels" })).toBeVisible();
  await expect(page.getByTestId("skeleton").first()).toBeVisible();
});
```

- [ ] **Step 2: Run them.** `npx vitest run 'src/app/[appId]/events/explorer-data.test.ts'`;
  `npm run build && npx playwright test -g "hard load of|static frames first"`.
  Expected: unit FAILS (module missing); "static frames first" FAILS (page-level "Loading…").
- [ ] **Step 3: Implement** the loaders and the three pages (synchronous page, static frames, data
  parts, `PageBody` around the content), delete the three `loading.tsx` files, replace the root
  `loading.tsx` text with a skeleton.
- [ ] **Step 4: Run the unit test and the whole e2e suite** (rebuild). Expected: all pass, including
  the existing unknown-event, stale-funnel and stale-step tests.
- [ ] **Step 5: Commit** `feat(dashboard): explorer, funnels and settings render static frames with skeletons`

### Task 4: Range logic and local date helpers

**Files:**
- Create: `apps/dashboard/src/view/range-ui.ts`
- Modify: `apps/dashboard/src/lib/format.ts` (`formatShortDay` with fixed English month names)
- Test: `apps/dashboard/src/view/range-ui.test.ts`, `apps/dashboard/src/lib/format.test.ts`

**Interfaces:**
- Consumes: `addDays`, `daysBetween`, `isDay`, `DateRange` from `src/time/range.ts`.
- Produces:
  - `RANGE_PRESETS: readonly [7, 28, 90]`, `type RangePreset = 7 | 28 | 90`.
  - `presetRange(days: RangePreset, today: string): DateRange` (`from = addDays(today, -(days - 1))`).
  - `rangeError(range: DateRange, today: string): string | null` — `null` when valid; otherwise
    "The end is after today.", "The start is after the end." or "Up to 400 days.".
  - `formatRangeLabel(range: DateRange): string`.
  - `withView(search: string, view: { range?: DateRange; compare?: boolean }): string` — returns `?…`
    with `from`, `to`, then `compare=0` if compare is off, then every other parameter in its original
    order (same order as `viewQuery`).
  - `dayToDate(day: string): Date` (local midnight via `new Date(y, m - 1, d)`) and
    `dateToDay(date: Date): string` (from `getFullYear`/`getMonth`/`getDate`).
  - `formatShortDay` uses a fixed month list `["Jan","Feb","Mar","Apr","May","June","July","Aug","Sept","Oct","Nov","Dec"]`
    so server and browser render the same text (no ICU difference, no hydration mismatch).

- [ ] **Step 1: Write the failing tests**

```ts
expect(presetRange(7, "2026-10-16")).toEqual({ from: "2026-10-10", to: "2026-10-16" });
expect(presetRange(28, "2026-10-16")).toEqual({ from: "2026-09-19", to: "2026-10-16" });
expect(presetRange(90, "2026-10-16")).toEqual({ from: "2026-07-19", to: "2026-10-16" });
expect(rangeError({ from: "2026-10-01", to: "2026-10-17" }, "2026-10-16")).toBe("The end is after today.");
expect(rangeError({ from: "2025-01-01", to: "2026-10-16" }, "2026-10-16")).toBe("Up to 400 days.");
expect(rangeError({ from: "2026-10-10", to: "2026-10-01" }, "2026-10-16")).toBe("The start is after the end.");
expect(rangeError({ from: "2026-09-19", to: "2026-10-16" }, "2026-10-16")).toBeNull();
expect(formatRangeLabel({ from: "2026-09-19", to: "2026-10-16" })).toBe("19 Sept – 16 Oct 2026");
expect(formatRangeLabel({ from: "2025-12-28", to: "2026-01-03" })).toBe("28 Dec 2025 – 3 Jan 2026");
expect(formatRangeLabel({ from: "2026-10-16", to: "2026-10-16" })).toBe("16 Oct 2026");
expect(withView("?event=x&from=a&to=b&steps=s1&steps=s2", { range: { from: "2026-10-10", to: "2026-10-16" } }))
  .toBe("?from=2026-10-10&to=2026-10-16&event=x&steps=s1&steps=s2");
expect(withView("?from=a&to=b&compare=0&event=x", { compare: true })).toBe("?from=a&to=b&event=x");
expect(withView("?from=a&to=b", { compare: false })).toBe("?from=a&to=b&compare=0");
expect(dateToDay(new Date(2026, 9, 16, 23, 30))).toBe("2026-10-16");
expect(dateToDay(dayToDate("2026-03-29"))).toBe("2026-03-29");
// format.test.ts additions:
expect(formatShortDay("2026-06-01")).toBe("1 June");
expect(formatShortDay("2026-07-04")).toBe("4 July");
```

- [ ] **Step 2: Run them.** `npx vitest run src/view/range-ui.test.ts src/lib/format.test.ts`
  Expected: FAIL (module missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them**, and once more with `TZ=America/Los_Angeles npx vitest run src/view/range-ui.test.ts`.
  Expected: PASS both times.
- [ ] **Step 5: Commit** `feat(dashboard): range presets, label, limits, URL building and local date helpers`

### Task 5: Page top bar with range picker and Compare

**Files:**
- Add via shadcn (check versions; `base-nova` style), in `apps/dashboard`:
  `npx shadcn@latest add popover calendar`.
- Create: `apps/dashboard/src/components/range-picker.tsx`, `.../compare-toggle.tsx`,
  `.../page-bar.tsx`, `.../range-line.tsx`, `apps/dashboard/src/view/raw-query.ts`
- Modify: the four pages (render `PageBar`); `apps/dashboard/src/components/header.tsx` (remove the
  date form, Live and Refresh; it keeps the app and page links until Task 6)
- Test: `apps/dashboard/src/components/range-picker.test.tsx`, `.../compare-toggle.test.tsx`,
  `apps/dashboard/src/view/raw-query.test.ts`, `apps/dashboard/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: Task 1 `usePendingNavigation`; Task 4 functions; Task 2 `PageInput`, `WithPage`.
- Produces:
  - `rawViewQuery(sp: SearchParams): string` — the request's query string without `error` and
    `saved` (keeps `event`, `steps`, … so Live and Refresh keep the view; the actions still check it
    with `safeQuery`).
  - `RangePicker({ range, today, label }: { range: DateRange; today: string; label: string })`
    (client; `label` is `formatRangeLabel(range)` computed on the server): trigger button
    `aria-label="Date range"` showing `label`; popover with the three preset buttons and a calendar
    (two months from 640 px wide, one month below; days after `today` disabled). A preset applies at
    once. The calendar keeps its own draft through `onDayClick`: first click sets the start (the
    current range is not "selected" for editing), second click sets the end (swapped if earlier) and
    applies; `selected` shows only the draft. If `rangeError` returns text, it shows instead of
    applying. Applying = `navigate(window.location.pathname + withView(window.location.search, { range }))`
    and closing the popover. `data-pending` on the root while pending.
  - `CompareToggle({ compare }: { compare: boolean })` (client): checkbox labeled "Compare" whose
    checked state is `useOptimistic(compare)`; toggling calls
    `navigate(href, () => setOptimistic(next))` with `href` from
    `withView(window.location.search, { compare: next })`, so the optimistic value is set inside the
    same transition (outside a transition it would revert at once); `data-pending` while pending. A
    toggle during a pending range change replaces it (spec: "a new choice replaces the pending one").
  - `PageBar({ title, page, input }: { title: string; page?: AppPage; input?: PageInput })` (server;
    `page` is passed by the three data pages because `toggleLive` and `refreshApp` need it):
    `<h1>` title outside
    Suspense; with `input`, a data part (fallback: skeleton of the same height) with `RangePicker`,
    `CompareToggle`, the Live badge, "Turn Live on/off" and Refresh forms (existing actions;
    `qs = rawViewQuery(sp)`), and under the bar `RangeLine`
    ("{from} to {to} ({timezone})" plus ", compared with {prev.from} to {prev.to}" when compare is on)
    and the `CredentialsBanner` (own Suspense). Settings uses `PageBar` without `input`.

- [ ] **Step 1: Write the failing tests**
  - `raw-query.test.ts`: `rawViewQuery({ from: "a", to: "b", event: "x", steps: ["s1", "s2"], error: "save", saved: "1" })`
    is `"?from=a&to=b&event=x&steps=s1&steps=s2"`.
  - `range-picker.test.tsx` (`next/navigation` mocked; `window.history.replaceState(null, "", "/demo/events?from=2026-09-19&to=2026-10-16&event=x")`):

```tsx
it("a preset applies at once and keeps the other parameters", async () => {
  render(<RangePicker range={{ from: "2026-09-19", to: "2026-10-16" }} today="2026-10-16" label="19 Sept – 16 Oct 2026" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Date range" }));
  await user.click(screen.getByRole("button", { name: "Last 7 days" }));
  expect(push).toHaveBeenCalledWith("/demo/events?from=2026-10-10&to=2026-10-16&event=x", { scroll: false });
});
it("the calendar applies only after the second day, even with a range already set", async () => {
  // open; click the day button for 1 Oct 2026: push not called; click 5 Oct: push called once with
  // "/demo/events?from=2026-10-01&to=2026-10-05&event=x"
});
it("days after today cannot be picked", async () => {
  // open; the day button for 17 Oct 2026 is disabled
});
```

  - `compare-toggle.test.tsx`: unchecking navigates with `compare=0` and the box shows unchecked at
    once (before the navigation finishes).
- [ ] **Step 2: Run them.** `npx vitest run src/view/raw-query.test.ts src/components/range-picker.test.tsx src/components/compare-toggle.test.tsx`
  Expected: FAIL.
- [ ] **Step 3: Add popover and calendar with shadcn, implement** the interfaces; use `PageBar` on
  Overview ("Overview"), Events ("Events"), Funnels ("Funnels") and Settings ("Settings").
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Rewrite the e2e test "date range and compare stay in the URL"** and add the quick
  succession test (both FAIL against the old build):

```ts
test("date range and compare stay in the URL", async ({ page }) => {
  await page.goto("/demo/events?event=calendar_poll");
  await page.getByRole("button", { name: "Date range" }).click();
  await page.getByRole("button", { name: "Last 7 days" }).click();
  await expect(page).toHaveURL(/event=calendar_poll/);
  let url = new URL(page.url());
  expect(daysBetween(url.searchParams.get("from")!, url.searchParams.get("to")!)).toBe(6);
  await page.getByLabel("Compare").uncheck();
  await expect(page).toHaveURL(/compare=0/);
  url = new URL(page.url());
  expect(url.searchParams.get("event")).toBe("calendar_poll");
});
test("quick second preset wins", async ({ page }) => {
  await page.goto("/demo");
  await page.waitForLoadState("networkidle");
  await slowRsc(page, 1500);
  await page.getByRole("button", { name: "Date range" }).click();
  await page.getByRole("button", { name: "Last 7 days" }).click();
  await page.getByRole("button", { name: "Date range" }).click();
  await page.getByRole("button", { name: "Last 90 days" }).click();
  await expect(page.getByTestId("progress-line")).toBeHidden({ timeout: 15_000 });
  const url = new URL(page.url());
  expect(daysBetween(url.searchParams.get("from")!, url.searchParams.get("to")!)).toBe(89);
  await expect(page.getByRole("button", { name: "Date range" })).toHaveText(
    formatRangeLabel({ from: url.searchParams.get("from")!, to: url.searchParams.get("to")! }),
  );
});
```

```ts
test("overview: revisit after a range change never shows old numbers undimmed", async ({ page }) => {
  await page.goto("/demo");
  const kpi = page.locator("[data-testid=kpi-pageviews]:visible");
  const body = page.locator("[data-testid=page-body]:visible");
  await expect(kpi).toBeVisible();
  const old = await kpi.textContent();
  await page.getByRole("link", { name: "Events" }).click(); // client-side, keeps the router state
  await page.getByRole("button", { name: "Date range" }).click();
  await page.getByRole("button", { name: "Last 7 days" }).click();
  await expect(page.getByTestId("progress-line")).toBeHidden({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  await slowRsc(page, 1500);
  await page.getByRole("link", { name: "Overview" }).click();
  for (let t = 0; t < 15; t++) {
    // sample ~1.5 s: the old text may only be visible while dimmed
    if ((await kpi.count()) === 1 && (await kpi.textContent()) === old) {
      expect(await body.evaluate((el) => getComputedStyle(el).opacity)).not.toBe("1");
    }
    await page.waitForTimeout(100);
  }
  await expect(kpi).not.toHaveText(old ?? "", { timeout: 15_000 });
});
```

If this test fails (Next reveals the kept page with old numbers at full opacity), rule on the fix
and ledger it. Options: key each data part's inner Suspense by `appId` plus the range on page
switches, or mark the content group pending from a client component that compares the rendered range
with the URL's range. A `useLinkStatus` marker in the sidebar does not work (the sidebar is outside
`group/content`).

(`daysBetween` and `formatRangeLabel` imported from `../src/…`.)
- [ ] **Step 6: Run the whole e2e suite** (rebuild). Expected: all pass, including "Live toggle and
  Refresh" on the new bar.
- [ ] **Step 7: Commit** `feat(dashboard): page top bar with direct-apply range picker and Compare`

### Task 6: Sidebar with app switcher, page links and sign out; phone drawer

**Files:**
- Add via shadcn: `sheet` (drawer); for the switcher use the existing `popover` plus a text field and
  a list of links (no extra dependency needed).
- Create: `apps/dashboard/src/view/app-switch.ts`, `apps/dashboard/src/components/app-sidebar.tsx`,
  `.../app-switcher.tsx`, `.../mobile-nav.tsx`, `apps/dashboard/src/auth/actions.ts`
- Modify: `apps/dashboard/src/app/[appId]/layout.tsx`, `.../page-bar.tsx` (menu button)
- Delete: `apps/dashboard/src/components/header.tsx`
- Test: `apps/dashboard/src/view/app-switch.test.ts`, `apps/dashboard/src/components/app-switcher.test.tsx`,
  `apps/dashboard/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `PAGE_PATHS`, `AppPage` (`src/lib/pages.ts`); `appList` (Task 2); `listApps`; `requireUser`.
- Produces:
  - `appSwitchHref(pathname: string, targetApp: string, search: string): string` — same page
    segment (`""`, `/events`, `/funnels`, `/settings`) under the target app, keeping only `from`, `to`
    and `compare`.
  - `pageHref(appId: string, page: AppPage | "settings", search: string): string` — same rule.
  - `signOut()` server action in `src/auth/actions.ts`: `auth.api.signOut({ headers: await headers() })`
    then `redirect("/sign-in")`.
  - `AppSidebar({ appId, apps, email, onNavigate }: { appId: string; apps: readonly string[]; email: string; onNavigate?: () => void })`
    (client; `usePathname`, `useSearchParams`): `AppSwitcher` at the top, `<nav aria-label="Pages">`
    with Overview, Events, Funnels (`aria-current="page"` on the current one), then at the bottom
    Settings, the email and a "Sign out" form. Every link calls `onNavigate` on click.
  - `AppSwitcher({ appId, apps, onNavigate })` (client): trigger `aria-label="Switch app"` showing
    `appId`; popover with a text field labeled "Filter apps" (case-insensitive substring) and one
    link per app (`appSwitchHref`).
  - `MobileNavProvider` (client, holds only the drawer's open state; uses no `usePathname`, so the
    layout's static shell survives), `MobileNavTrigger` (button "Open menu", `md:hidden`, used in
    `PageBar`), and `MobileNavDrawer({ appId, apps, email })` (the Sheet with `AppSidebar`, passing
    `onNavigate={() => setOpen(false)}`).
  - Layout: `MobileNavProvider` wraps
    `<aside className="hidden w-56 shrink-0 md:flex …">` and the `group/content` area from Task 1. The
    aside holds a Suspense (fallback: same-size sidebar skeleton) around an async part that awaits
    `params`, `listApps()` and `requireUser()` and renders `AppSidebar` plus `MobileNavDrawer` with
    `appList(appId, ids)` and the email.

- [ ] **Step 1: Write the failing unit tests**

```ts
expect(appSwitchHref("/demo/events", "wik", "?from=a&to=b&compare=0&event=x&metric=events")).toBe("/wik/events?from=a&to=b&compare=0");
expect(appSwitchHref("/demo/funnels", "wik", "?from=a&to=b&steps=s1&funnel=f")).toBe("/wik/funnels?from=a&to=b");
expect(appSwitchHref("/demo", "wik", "?from=a&to=b")).toBe("/wik?from=a&to=b");
expect(appSwitchHref("/demo/settings", "wik", "")).toBe("/wik/settings");
expect(pageHref("demo", "funnels", "?from=a&to=b&event=x")).toBe("/demo/funnels?from=a&to=b");
```

and `app-switcher.test.tsx`: after opening "Switch app", typing "kal" into "Filter apps" leaves only
the link "wetter-in-kalender" of `["demo", "wetter-in-kalender"]`.

- [ ] **Step 2: Write the failing e2e tests**
  - "app picker lists the demo app…": still starts at `/`, then uses the sidebar.
  - "switching apps keeps the page and range": on
    `/demo/events?from=2026-09-20&to=2026-10-10&event=calendar_poll`, open "Switch app", pick
    "wetter-in-kalender" (the e2e environment reads production data, which has it; if the list has
    no second app, the test fails with a clear message), expect
    `/wetter-in-kalender/events?from=2026-09-20&to=2026-10-10` without `event`.
  - "app switch shows skeletons": on `/demo`, `networkidle`, `slowRsc(2000)`, switch to the other
    app; `skeleton` test ids become visible and `kpi-pageviews` with demo's old text is not visible
    while they are.
  - "pages in the sidebar": click "Funnels" in the "Pages" nav, expect `/demo/funnels` and
    `aria-current="page"` on it.
  - "sign out": signs out and expects `/sign-in`; afterwards `/demo` redirects to `/sign-in`.
  - "phone menu": viewport 390×844, the sidebar is hidden, "Open menu" opens the drawer with the
    "Pages" nav; clicking "Events" navigates and closes it; no horizontal page scroll
    (`document.documentElement.scrollWidth <= innerWidth`).
- [ ] **Step 3: Run them.** `npx vitest run src/view/app-switch.test.ts src/components/app-switcher.test.tsx`;
  `npm run build && npx playwright test -g "switching apps|app switch shows|pages in the sidebar|sign out|phone menu"`.
  Expected: FAIL.
- [ ] **Step 4: Implement**; remove `Header` and its remaining uses; add `MobileNavTrigger` to `PageBar`.
- [ ] **Step 5: Run them again and then the whole e2e suite** (rebuild). Expected: all pass.
- [ ] **Step 6: Commit** `feat(dashboard): sidebar with app switcher, pages and sign out; phone drawer`

### Task 7: Pending state for the explorer form, funnel editor and saved funnel links

**Files:**
- Modify: `apps/dashboard/src/explorer/state.ts`, `apps/dashboard/src/components/explorer-controls.tsx`
  (client form), `.../funnel-editor.tsx`, `apps/dashboard/src/app/[appId]/funnels/page.tsx` (saved
  funnel links)
- Test: `apps/dashboard/src/explorer/state.test.ts`, `apps/dashboard/src/components/explorer-controls.test.tsx`,
  `apps/dashboard/src/components/funnel-editor.test.tsx`, `apps/dashboard/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `usePendingNavigation`, `PendingLink` (Task 1); `withView` (Task 4).
- Produces:
  - `explorerFormQuery(base: string, catalog: Catalog, form: { event: string; metric: string; fk: string; fv: string; by: string }): string`
    in `src/explorer/state.ts`: returns `?` plus whichever of `from`, `to` and `compare` exist in
    `base` (none are invented; `?event=x` alone yields no `from`), followed by `explorerParams(parseExplorer({ event, metric, fk, fv, by }, catalog))`, so the client
    builds the canonical URL and the server's fk/fv redirect is never hit from the form.
  - `ExplorerControls` (client) gets `catalog`; on submit it reads the form fields by name (strings,
    no `new URLSearchParams(formData)`), calls `navigate(`/${appId}/events${explorerFormQuery(window.location.search, catalog, …)}`)`,
    and its form carries `data-pending` while pending.
  - `FunnelEditor` calls `navigate` instead of `router.push`; its form carries `data-pending`.
  - Saved funnel names on the funnels page use `PendingLink`.

- [ ] **Step 1: Write the failing tests**
  - `state.test.ts`: for the fixture catalog and `base = "?from=2026-10-01&to=2026-10-16&event=old"`,
    `explorerFormQuery(base, catalog, { event: "place_selected", metric: "events", fk: "source", fv: "map", by: "" })`
    equals `"?from=2026-10-01&to=2026-10-16" + "&" + new URLSearchParams(explorerParams(parseExplorer({ event: "place_selected", metric: "events", fk: "source", fv: "map", by: "" }, catalog))).toString()`
    and contains `filter=source%3Amap` but no `fk=`.
  - `explorer-controls.test.tsx`: pressing "Apply" calls `push` once with a URL that has
    `filter=source%3Amap` and no `fk=` (fixture 1 selection), with `{ scroll: false }`.
  - `funnel-editor.test.tsx`: the existing URL test expects `push(…, { scroll: false })`.
- [ ] **Step 2: Run them.** `npx vitest run src/explorer/state.test.ts src/components/explorer-controls.test.tsx src/components/funnel-editor.test.tsx`
  Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: e2e** "funnels: Show funnel keeps the old result dimmed": with a result shown,
  `networkidle`, `slowRsc(2000)`, change step 2 and press "Show funnel"; the progress line shows and
  `page-body` has opacity 0.5 until the URL changes; then the progress line is hidden.
- [ ] **Step 6: Run the whole e2e suite** (rebuild). Expected: all pass.
- [ ] **Step 7: Commit** `feat(dashboard): explorer form, funnel editor and saved funnels keep old results dimmed`

### Task 8: Funnel chart

**Files:**
- Create: `apps/dashboard/src/funnels/chart.ts`, `apps/dashboard/src/components/funnel-chart.tsx`
- Modify: `apps/dashboard/src/app/[appId]/funnels/page.tsx` (chart above the table in the result)
- Test: `apps/dashboard/src/funnels/chart.test.ts`, `apps/dashboard/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `FunnelStepView`, `FunnelStep`, `toFunnelView` (`src/funnels/steps.ts`); `formatShare`, `formatInt`.
- Produces:
  - `funnelGeometry(view: readonly FunnelStepView[], opts: { compare: boolean; size: number }): FunnelGeometry`
    where `size` is the bar length for the largest value (px), and
    `FunnelGeometry = { bars: Array<{ step: number; length: number; prevLength: number | null }>; chips: Array<{ afterStep: number; label: string }> }`.
    The largest value is the max over all `cur` and (with compare) `prev`; lengths scale linearly;
    chip label is `${formatShare(fromPrev)} →`, or `– →` when `fromPrev` is null. Pixel positions
    follow from `length` and the bar index in the component, for both orientations.
  - `FunnelChart({ steps, view, compare }: { steps: readonly FunnelStep[]; view: readonly FunnelStepView[]; compare: boolean })`
    (client): horizontal SVG (`hidden sm:block`) and vertical SVG (`sm:hidden`) per the mockup
    `docs/superpowers/specs/2026-10-16-dashboard-layout-mockups/funnel.html`: bars in
    `--chart-current`, previous-period bars behind them in `--chart-previous` at low opacity, hatched
    drop-off bands, conversion chips, session counts on the bars, step names (event; filter as a
    second line). Each SVG has `role="img"` and `aria-label="Funnel chart"`; bars carry
    `data-testid="funnel-bar-h-{step}"` (horizontal) and `funnel-bar-v-{step}` (vertical). Hover on a
    bar shows a tooltip `role="tooltip"` rendered as a sibling of the SVG (not inside it):
    "{n} sessions", "{share} of step 1", and with compare "Previous: {n} ({share})".

- [ ] **Step 1: Write the failing tests**

```ts
const view = toFunnelView(
  [{ period: "cur", step: 1, sessions: 2807 }, { period: "cur", step: 2, sessions: 1140 }, { period: "cur", step: 3, sessions: 312 },
   { period: "prev", step: 1, sessions: 2505 }, { period: "prev", step: 2, sessions: 980 }, { period: "prev", step: 3, sessions: 290 }],
  3, true);
const g = funnelGeometry(view, { compare: true, size: 180 });
expect(g.bars.map((b) => Math.round(b.length))).toEqual([180, 73, 20]);
expect(g.bars.map((b) => Math.round(b.prevLength ?? -1))).toEqual([161, 63, 19]);
expect(g.chips).toEqual([{ afterStep: 1, label: "41 % →" }, { afterStep: 2, label: "27 % →" }]);
expect(funnelGeometry(view, { compare: false, size: 180 }).bars.every((b) => b.prevLength === null)).toBe(true);
const empty = funnelGeometry(toFunnelView([], 2, true), { compare: true, size: 100 });
expect(empty.bars.map((b) => b.length)).toEqual([0, 0]);
expect(empty.chips).toEqual([{ afterStep: 1, label: "– →" }]);
```

- [ ] **Step 2: Write the failing e2e test** "funnels: chart shows one bar per step with a hover
  tooltip": on `/demo/funnels?steps=place_selected&steps=subscribe_click` at 1280 px,
  `funnel-bar-h-1` and `funnel-bar-h-2` are visible; hovering `funnel-bar-h-2` shows a `tooltip`
  containing "sessions"; at 390 px `funnel-bar-v-1` is visible, `funnel-bar-h-1` is hidden, and the
  page has no horizontal scroll.
- [ ] **Step 3: Run them.** `npx vitest run src/funnels/chart.test.ts`;
  `npm run build && npx playwright test -g "chart shows one bar"`. Expected: FAIL.
- [ ] **Step 4: Implement** `funnelGeometry` and `FunnelChart`; render it in the result part above
  `FunnelResult`.
- [ ] **Step 5: Run them again and the whole e2e suite** (rebuild). Expected: all pass.
- [ ] **Step 6: Commit** `feat(dashboard): left-to-right funnel chart with drop-off bands and previous period`

### Task 9: Screens, docs and full verification

**Files:**
- Modify: `apps/dashboard/README.md` (layout and range picker, if the README lists features),
  `claude-tmp-helpers/screens/pages.spec.ts` (labels changed)

- [ ] **Step 1: Screenshots** of overview, events (with an event), funnels (with a result) and
  settings at 1280 and 390 px, plus the range picker open and the phone drawer open, with
  `claude-tmp-helpers/screens.config.ts`. Look at each: no overlap, no horizontal scroll, skeleton
  sizes close to the content.
- [ ] **Step 2: Full verification** from the repo root: `npm test`, `npm run lint`, `npm run typecheck`,
  `npx prettier --check .`, `cd apps/dashboard && npm run build && npx playwright test`, and the
  opt-in dry runs (`RTD_DRY_RUN=1 GCP_PROJECT_ID=robin-thues npx vitest run src/queries/dry-run.integration.test.ts`).
  Expected: all green.
- [ ] **Step 3: Commit** `docs(dashboard): layout notes` (only if files changed).
