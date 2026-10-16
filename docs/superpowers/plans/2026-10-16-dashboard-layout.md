# Dashboard layout, range picker, funnel chart and skeletons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v1 header with a sidebar (app switcher, pages, settings, sign out) and a page top
bar with a direct-apply range picker, show static panel frames with skeletons on page switches, keep
old numbers dimmed on same-page changes, and add a left-to-right funnel chart.

**Architecture:** A new `[appId]/layout.tsx` holds the sidebar and a content area that is a Tailwind
group (`group/content`). Pages become synchronous shells: static frames outside Suspense, each data
part in its own Suspense with a skeleton, reading the request through a React-`cache`d `loadPage`.
Same-page changes run `router.push` inside a transition (`usePendingNavigation`); the control marks
itself `data-pending`, and CSS (`group-has-data-pending/content:`) dims the page body and shows a
progress line. Page switches use normal prefetched `<Link>`s, so the prefetched shell (frames plus
skeletons) shows at once.

**Tech Stack:** Next.js 16.4 (`cacheComponents`, `partialPrefetching`), React 19.3, Tailwind 4,
shadcn (`base-nova` style, Base UI), Recharts (existing), `react-day-picker` (via shadcn Calendar),
Vitest + Testing Library + happy-dom, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-16-dashboard-layout-design.md` (mockups in
`docs/superpowers/specs/2026-10-16-dashboard-layout-mockups/`). v1 spec:
`docs/superpowers/specs/2026-10-14-dashboard-design.md`.

**Branch:** `feat/dashboard-layout`, created from `fix/sparkline-tooltip` (which holds the sparkline
fix and the design doc). Work in the main checkout (env files, `.vercel` and `node_modules` live there).

## Global Constraints

- No new colors, fonts or visual identity; keep today's tokens and shadcn defaults. No dark mode.
- Sidebar width fixed (about 14 rem, Tailwind `w-56`), not collapsible.
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
- Read the Next.js docs in `node_modules/next/dist/docs/` (repo root) before writing layout, Link or
  navigation code. Check current stable versions of anything newly installed.
- Project scripts go in `claude-tmp-helpers/` (gitignored), never inline one-off code. Commits carry no
  Claude attribution trailers.

## Review Focus

1. Two range changes in quick succession (a preset, then another preset while the first is pending):
   the last one wins, the URL and numbers match it. → Task 5 e2e "quick second preset wins".
2. Switching apps while an event or funnel is selected: the new app opens on the same page with the
   same range, without the old app's `event`, `steps` or `funnel`. → Task 6 unit tests for
   `appSwitchHref`.
3. Cmd/Ctrl/middle click on a pending link (event list, saved funnels) opens a new tab instead of
   navigating in place. → Task 1 component test.
4. A funnel whose first step has 0 sessions, or compare off: the chart renders without NaN and without
   previous-period bars. → Task 8 unit tests.
5. A deep link or hard reload of any page with parameters (no prefetch, `useSearchParams` suspends):
   the page shows frames and skeletons, then data, with no error. → Task 3 e2e "hard load of each page".

---

### Task 1: Pending navigation and the dimmed content area

Proves the core mechanism before anything builds on it: a same-page navigation inside a transition
keeps old content on screen, dimmed, with a progress line.

**Files:**
- Create: `apps/dashboard/src/lib/navigation.ts`, `apps/dashboard/src/components/pending-link.tsx`,
  `apps/dashboard/src/components/progress-line.tsx`, `apps/dashboard/src/components/page-body.tsx`,
  `apps/dashboard/src/app/[appId]/layout.tsx`, `apps/dashboard/e2e/helpers.ts`
- Modify: `apps/dashboard/src/components/event-list.tsx` (links become `PendingLink`),
  `apps/dashboard/src/app/[appId]/events/page.tsx` (wrap content in `PageBody`)
- Test: `apps/dashboard/src/components/pending-link.test.tsx`, `apps/dashboard/e2e/dashboard.spec.ts`

**Interfaces:**
- Produces:
  - `usePendingNavigation(): { pending: boolean; navigate: (href: string) => void }` in
    `src/lib/navigation.ts` (`"use client"`; `useTransition` + `useRouter().push(href, { scroll: false })`).
  - `PendingLink(props: { href: string; className?: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">)`
    in `src/components/pending-link.tsx`: renders `<a href>`; a plain left click calls `navigate`;
    clicks with a modifier key or a non-left button are left to the browser; sets
    `data-pending=""` while pending.
  - `PageBody({ children })` in `src/components/page-body.tsx`: wrapper with
    `transition-opacity group-has-data-pending/content:opacity-50`.
  - `ProgressLine()` in `src/components/progress-line.tsx`: thin animated bar, `hidden` unless
    `group-has-data-pending/content:block`, `data-testid="progress-line"`.
  - `[appId]/layout.tsx`: `<div className="group/content min-w-0 flex-1"><ProgressLine />{children}</div>`
    (the sidebar is added in Task 6).
  - `slowRsc(page: Page, ms: number): Promise<void>` in `e2e/helpers.ts`: delays requests that carry
    the `rsc` header.

- [ ] **Step 1: Write the failing component test** (`pending-link.test.tsx`, `next/navigation`
  mocked as in `funnel-editor.test.tsx`)

```tsx
it("a plain click navigates in place", async () => {
  render(<PendingLink href="/demo/events?event=a">a</PendingLink>);
  await userEvent.setup().click(screen.getByRole("link", { name: "a" }));
  expect(push).toHaveBeenCalledWith("/demo/events?event=a", { scroll: false });
});
it("a modified or middle click is left to the browser", async () => {
  render(<PendingLink href="/demo/events?event=a">a</PendingLink>);
  const link = screen.getByRole("link", { name: "a" });
  await userEvent.setup().keyboard("{Control>}");
  fireEvent.click(link, { ctrlKey: true });
  fireEvent.click(link, { metaKey: true });
  fireEvent.click(link, { button: 1 });
  expect(push).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Write the failing e2e test** (`slowRsc` delays 2000 ms)

```ts
test("explorer: picking another event keeps the old content dimmed", async ({ page }) => {
  await page.goto("/demo/events?event=place_selected");
  await expect(page.getByTestId("explorer-total")).toBeVisible();
  const before = await page.getByTestId("explorer-total").textContent();
  await slowRsc(page, 2000);
  await page.getByTestId("event-list").getByRole("link", { name: "subscribe_click" }).click();
  await expect(page.getByTestId("progress-line")).toBeVisible();
  await expect(page.getByTestId("explorer-total")).toHaveText(before ?? "");
  const opacity = await page.getByTestId("page-body").evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(opacity)).toBeLessThan(1);
  await expect(page).toHaveURL(/event=subscribe_click/, { timeout: 10_000 });
  await expect(page.getByTestId("progress-line")).toBeHidden();
});
```

- [ ] **Step 3: Run both.** `cd apps/dashboard && npx vitest run src/components/pending-link.test.tsx`
  and `npm run build && npx playwright test -g "keeps the old content dimmed"`.
  Expected: the component test FAILS (module `./pending-link` not found); the e2e test FAILS (no
  `progress-line`).
- [ ] **Step 4: Implement** `usePendingNavigation`, `PendingLink`, `PageBody` (with
  `data-testid="page-body"`), `ProgressLine`, the layout, and use `PendingLink` for the event names in
  `EventList`; wrap the events page content in `PageBody`.
- [ ] **Step 5: Run both again** (rebuild first). Expected: PASS. If the old content is replaced by a
  skeleton or `loading.tsx` during the transition, stop: find out why (segment key, `loading.tsx`,
  prefetched shell) in the Next docs and rule on the fix before Task 2.
- [ ] **Step 6: Run the whole suite** (`npx vitest run`, `npx playwright test`). Expected: all pass.
- [ ] **Step 7: Commit** `feat(dashboard): pending navigation keeps old content dimmed with a progress line`

### Task 2: Cached page loading and the overview as a static shell

**Files:**
- Modify: `apps/dashboard/src/app/[appId]/page-data.ts`, `apps/dashboard/src/app/[appId]/page.tsx`,
  `apps/dashboard/src/app/[appId]/panels/*.tsx` (call sites only)
- Create: `apps/dashboard/src/components/skeletons.tsx`
- Delete: `apps/dashboard/src/app/[appId]/loading.tsx`
- Test: `apps/dashboard/src/app/[appId]/page-data.test.ts`, `apps/dashboard/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `PageBody` (Task 1).
- Produces:
  - `type PageInput = { params: Promise<{ appId: string }>; searchParams: Promise<SearchParams> }`.
  - `loadPage(input: PageInput): Promise<PageData>` wrapped in React `cache` (one run per request;
    the cache key is the `input` object, so pages create it once and pass the same object down).
  - `WithPage({ input, children }: { input: PageInput; children: (data: PageData) => ReactNode })`:
    async server component.
  - Skeletons: `KpiSkeleton()`, `ChartSkeleton({ height?: number })`, `TableSkeleton({ rows: number })`,
    `BlockSkeleton({ className?: string })`, `LineSkeleton()`.

- [ ] **Step 1: Write the failing test** (`page-data.test.ts`, with `requireUser`, `getSettings`,
  `listApps` and `isLive` mocked)

```ts
it("loadPage runs once per input object", async () => {
  const input = { params: Promise.resolve({ appId: "demo" }), searchParams: Promise.resolve({}) };
  const [a, b] = await Promise.all([loadPage(input), loadPage(input)]);
  expect(a).toBe(b);
  expect(getSettings).toHaveBeenCalledTimes(1);
});
```

React `cache` only dedupes inside a request scope; if it does not dedupe in Vitest, run the calls
inside React's `cache` scope helper or test `WithPage` through `loadPage`'s call count from a
rendered server tree, and ledger the choice.

- [ ] **Step 2: Run it.** `npx vitest run 'src/app/[appId]/page-data.test.ts'` Expected: FAIL.
- [ ] **Step 3: Implement** `PageInput`, the cached `loadPage(input)`, `WithPage`, the skeletons, and
  rewrite `[appId]/page.tsx` as a synchronous page: the panel frames (titles from today's page) are
  outside Suspense; each panel body is `<Suspense fallback={<…Skeleton />}><WithPage input={input}>{(d) => <KpiPanel ctx={d.ctx} live={d.live} maxBytes={d.maxBytes} />}</WithPage></Suspense>`.
  The page header and range line are temporarily rendered the same way (Task 5 replaces them). Delete
  `[appId]/loading.tsx` and the page-level `<Suspense fallback={<p>Loading…</p>}>`.
- [ ] **Step 4: Run it.** Same command. Expected: PASS.
- [ ] **Step 5: Write the failing e2e test**

```ts
test("overview: page switch shows panel frames with skeletons before data", async ({ page }) => {
  await page.goto("/demo/events");
  await slowRsc(page, 2000);
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
  await expect(page.getByTestId("skeleton").first()).toBeVisible();
  await expect(page.getByText("Loading…")).toHaveCount(0);
  await expect(page.getByTestId("kpi-pageviews")).toBeVisible({ timeout: 15_000 });
});
```

(`Panel` titles must be headings; add `role`/element if they are not. Every skeleton has
`data-testid="skeleton"`.)

- [ ] **Step 6: Run it.** `npm run build && npx playwright test -g "panel frames with skeletons"`
  Expected: FAIL before Step 3 is built, PASS after.
- [ ] **Step 7: Run the whole e2e suite** (`npx playwright test`). Expected: all pass.
- [ ] **Step 8: Commit** `feat(dashboard): overview renders static panel frames with skeletons`

### Task 3: Explorer, funnels and settings as static shells

**Files:**
- Modify: `apps/dashboard/src/app/[appId]/events/page.tsx`, `.../funnels/page.tsx`,
  `.../settings/page.tsx`, `apps/dashboard/src/app/loading.tsx`
- Delete: `apps/dashboard/src/app/[appId]/events/loading.tsx`, `.../funnels/loading.tsx`,
  `.../settings/loading.tsx`
- Test: `apps/dashboard/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `PageInput`, `loadPage`, `WithPage`, skeletons (Task 2); `PageBody` (Task 1).

Static frames per spec: Events: the "Events" list panel; the right column is one untitled
`BlockSkeleton` (height of controls plus chart) until the selection is known. Funnels: "Saved
funnels" and the editor panel titled "Funnel" (the saved funnel's name replaces it with the data);
the result area is one untitled `BlockSkeleton`. Settings: the settings panel frame. Error, stale
funnel and left-out lines render with the data. Root `app/loading.tsx` renders a neutral full-page
skeleton (no "Loading…" text).

- [ ] **Step 1: Write the failing e2e tests**

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
  await slowRsc(page, 2000);
  await page.getByRole("link", { name: "Funnels" }).click();
  await expect(page.getByRole("heading", { name: "Saved funnels" })).toBeVisible();
  await expect(page.getByTestId("skeleton").first()).toBeVisible();
});
```

- [ ] **Step 2: Run them.** `npm run build && npx playwright test -g "hard load of|static frames first"`
  Expected: the "static frames first" test FAILS (page-level "Loading…").
- [ ] **Step 3: Implement** the three pages as in Task 2 (synchronous page, static frames,
  `WithPage` parts in Suspense, `PageBody` around the content), delete the three `loading.tsx` files,
  replace the root `loading.tsx` text with a skeleton.
- [ ] **Step 4: Run the whole e2e suite.** `npm run build && npx playwright test` Expected: all pass,
  including the existing unknown-event, stale-funnel and stale-step tests.
- [ ] **Step 5: Commit** `feat(dashboard): explorer, funnels and settings render static frames with skeletons`

### Task 4: Range logic

**Files:**
- Create: `apps/dashboard/src/view/range-ui.ts`
- Test: `apps/dashboard/src/view/range-ui.test.ts`

**Interfaces:**
- Consumes: `addDays`, `daysBetween`, `isDay`, `DateRange` from `src/time/range.ts`;
  `formatShortDay` from `src/lib/format.ts`.
- Produces:
  - `RANGE_PRESETS: readonly [7, 28, 90]`, `type RangePreset = 7 | 28 | 90`.
  - `presetRange(days: RangePreset, today: string): DateRange` (`from = addDays(today, -(days - 1))`).
  - `rangeError(range: DateRange, today: string): string | null` — `null` when valid; otherwise
    "The end is after today.", "The start is after the end." or "Up to 400 days." (same rules as
    `parseViewState`).
  - `formatRangeLabel(range: DateRange): string`.
  - `withView(search: string, view: { range?: DateRange; compare?: boolean }): string` — returns a
    query string starting with `?`; keeps every other parameter in its order; `compare: true`
    removes `compare`, `false` sets `compare=0`.

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
expect(withView("?from=a&to=b&event=x&steps=s1&steps=s2", { range: { from: "2026-10-10", to: "2026-10-16" } }))
  .toBe("?from=2026-10-10&to=2026-10-16&event=x&steps=s1&steps=s2");
expect(withView("?from=a&to=b&compare=0&event=x", { compare: true })).toBe("?from=a&to=b&event=x");
expect(withView("?from=a&to=b", { compare: false })).toBe("?from=a&to=b&compare=0");
```

- [ ] **Step 2: Run them.** `npx vitest run src/view/range-ui.test.ts` Expected: FAIL (module missing).
- [ ] **Step 3: Implement** in `src/view/range-ui.ts`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(dashboard): range presets, label, limits and URL building`

### Task 5: Page top bar with range picker and Compare

**Files:**
- Add via shadcn (check versions; `base-nova` style): `popover`, `calendar` (pulls `react-day-picker`),
  run in `apps/dashboard`: `npx shadcn@latest add popover calendar`.
- Create: `apps/dashboard/src/components/range-picker.tsx`, `.../compare-toggle.tsx`,
  `.../page-bar.tsx`, `.../range-line.tsx`
- Modify: the four pages (replace `Header` usage with `PageBar`)
- Test: `apps/dashboard/src/components/range-picker.test.tsx`, `apps/dashboard/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: Task 1 `usePendingNavigation`; Task 4 functions; Task 2 `PageInput`, `WithPage`.
- Produces:
  - `RangePicker({ range, today }: { range: DateRange; today: string })` (client): trigger button
    with `aria-label="Date range"` showing `formatRangeLabel(range)`; popover with the three preset
    buttons and a two-month calendar (`mode="range"`, days after `today` disabled). A preset applies
    at once; in the calendar the first click sets the start, the second click sets the end and
    applies; `rangeError` text shows instead of applying when invalid. Applying = `navigate(pathname + withView(location.search, { range }))`
    and closing the popover. Root carries `data-pending` while pending.
  - `CompareToggle({ compare }: { compare: boolean })` (client): checkbox labeled "Compare"; toggling
    navigates with `withView(…, { compare })`; `data-pending` while pending.
  - `PageBar({ title, input, page }: { title: string; input?: PageInput; page?: AppPage })` (server):
    `<h1>` title outside Suspense; when `input` is given, a Suspense part (fallback: skeleton of the
    same height) with `RangePicker`, `CompareToggle`, the Live badge, "Turn Live on/off" and Refresh
    forms (existing server actions, `qs` = the page's current view query as today), and under the bar
    `RangeLine` ("{from} to {to} ({timezone}), compared with {prev.from} to {prev.to}"). The
    credentials banner (`CredentialsBanner`, in its own Suspense) moves directly under the bar, at the
    top of the content area, on all four pages. A slot for the phone menu button is added in Task 6.
  - `Header` keeps only what Task 6 has not replaced yet (app and page links); its date form,
    Live and Refresh go away here.

- [ ] **Step 1: Write the failing component tests** (`range-picker.test.tsx`; `next/navigation`
  mocked; `window.history.replaceState(null, "", "/demo/events?from=2026-09-19&to=2026-10-16&event=x")`)

```tsx
it("a preset applies at once and keeps the other parameters", async () => {
  render(<RangePicker range={{ from: "2026-09-19", to: "2026-10-16" }} today="2026-10-16" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Date range" }));
  await user.click(screen.getByRole("button", { name: "Last 7 days" }));
  expect(push).toHaveBeenCalledWith("/demo/events?from=2026-10-10&to=2026-10-16&event=x", { scroll: false });
});
it("the calendar applies only after the second day", async () => {
  // open, click day 1 and day 5 of the visible month; push called once, after the second click
});
it("days after today cannot be picked", async () => {
  // open; the button for 2026-10-17 is disabled
});
```

- [ ] **Step 2: Run them.** `npx vitest run src/components/range-picker.test.tsx` Expected: FAIL.
- [ ] **Step 3: Add popover and calendar with shadcn, implement** `RangePicker`, `CompareToggle`,
  `PageBar`, `RangeLine`; use `PageBar` on Overview ("Overview"), Events ("Events"), Funnels
  ("Funnels") and Settings ("Settings", no `input`).
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Rewrite the e2e test "date range and compare stay in the URL"** and add the quick
  succession test:

```ts
test("date range and compare stay in the URL", async ({ page }) => {
  await page.goto("/demo/events?event=calendar_poll");
  await page.getByRole("button", { name: "Date range" }).click();
  await page.getByRole("button", { name: "Last 7 days" }).click();
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}&event=calendar_poll/);
  await page.getByLabel("Compare").uncheck();
  await expect(page).toHaveURL(/compare=0/);
  await expect(page.getByRole("button", { name: "Date range" })).toBeVisible();
});
test("quick second preset wins", async ({ page }) => {
  await page.goto("/demo");
  await slowRsc(page, 1500);
  await page.getByRole("button", { name: "Date range" }).click();
  await page.getByRole("button", { name: "Last 7 days" }).click();
  await page.getByRole("button", { name: "Date range" }).click();
  await page.getByRole("button", { name: "Last 90 days" }).click();
  await expect(page.getByRole("button", { name: "Date range" })).toContainText(/–/, { timeout: 15_000 });
  const url = new URL(page.url());
  expect(daysBetween(url.searchParams.get("from")!, url.searchParams.get("to")!)).toBe(89);
});
```

- [ ] **Step 6: Run the whole e2e suite.** `npm run build && npx playwright test` Expected: all pass
  (the Live/Refresh test keeps working with the new bar).
- [ ] **Step 7: Commit** `feat(dashboard): page top bar with direct-apply range picker and Compare`

### Task 6: Sidebar with app switcher, page links and sign out; phone drawer

**Files:**
- Add via shadcn: `sheet` (drawer) and whatever the app switcher needs (`popover` exists from Task 5;
  `command` or Base UI `Combobox` if the style offers it).
- Create: `apps/dashboard/src/view/app-switch.ts`, `apps/dashboard/src/components/app-sidebar.tsx`,
  `.../app-switcher.tsx`, `.../mobile-nav.tsx`, `apps/dashboard/src/auth/actions.ts`
- Modify: `apps/dashboard/src/app/[appId]/layout.tsx`, `.../page-bar.tsx` (menu button slot)
- Delete: `apps/dashboard/src/components/header.tsx`
- Test: `apps/dashboard/src/view/app-switch.test.ts`, `apps/dashboard/src/components/app-switcher.test.tsx`,
  `apps/dashboard/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `PAGE_PATHS`, `AppPage` (`src/lib/pages.ts`); `listApps`; `requireUser`.
- Produces:
  - `appSwitchHref(pathname: string, targetApp: string, search: string): string` — same page
    segment (`""`, `/events`, `/funnels`, `/settings`) under the target app, keeping only `from`, `to`
    and `compare`.
  - `pageHref(appId: string, page: AppPage | "settings", search: string): string` — same rule.
  - `signOut()` server action in `src/auth/actions.ts`: `auth.api.signOut({ headers: await headers() })`
    then `redirect("/sign-in")`.
  - `AppSidebar({ appId, apps, email }: { appId: string; apps: readonly string[]; email: string })`
    (client; `usePathname`, `useSearchParams`): `AppSwitcher` at the top, `<nav aria-label="Pages">`
    with Overview, Events, Funnels (`aria-current="page"` on the current one), then at the bottom
    Settings, the email and a "Sign out" form.
  - `AppSwitcher({ appId, apps })` (client): trigger `aria-label="Switch app"` showing `appId`;
    popover with a text field labeled "Filter apps" (case-insensitive substring) and one link per
    app (`appSwitchHref`).
  - `MobileNav` (client): context provider holding the drawer's open state; `MobileNavTrigger`
    (button "Open menu", `md:hidden`) used in `PageBar`; the drawer shows the same `AppSidebar`
    content and closes on navigation.
  - Layout: `MobileNav` wraps `<aside className="hidden w-56 shrink-0 md:flex …">` (Suspense with a
    same-size sidebar skeleton around an async part that awaits `params`, `listApps()` and
    `requireUser()`) and the `group/content` area from Task 1.

- [ ] **Step 1: Write the failing unit tests**

```ts
expect(appSwitchHref("/demo/events", "wik", "?from=a&to=b&compare=0&event=x&metric=events")).toBe("/wik/events?from=a&to=b&compare=0");
expect(appSwitchHref("/demo/funnels", "wik", "?from=a&to=b&steps=s1&funnel=f")).toBe("/wik/funnels?from=a&to=b");
expect(appSwitchHref("/demo", "wik", "?from=a&to=b")).toBe("/wik?from=a&to=b");
expect(appSwitchHref("/demo/settings", "wik", "")).toBe("/wik/settings");
expect(pageHref("demo", "funnels", "?from=a&to=b&event=x")).toBe("/demo/funnels?from=a&to=b");
```

and `app-switcher.test.tsx`: typing "kal" into "Filter apps" leaves only the link
"wetter-in-kalender" of `["demo", "wetter-in-kalender"]`.

- [ ] **Step 2: Run them.** `npx vitest run src/view/app-switch.test.ts src/components/app-switcher.test.tsx`
  Expected: FAIL.
- [ ] **Step 3: Implement** the functions, `signOut`, `AppSwitcher`, `AppSidebar`, `MobileNav`, the
  layout; remove `Header` and its remaining uses; add `MobileNavTrigger` to `PageBar`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Update and add e2e tests**
  - "app picker lists the demo app…": still starts at `/`, then uses the sidebar.
  - "switching apps keeps the page and range": on `/demo/events?from=2026-09-20&to=2026-10-10&event=calendar_poll`,
    open "Switch app", pick the other app if one exists (else skip with a note), expect the path
    `/<app>/events?from=2026-09-20&to=2026-10-10` without `event`.
  - "pages in the sidebar": click "Funnels" in the "Pages" nav, expect `/demo/funnels` and
    `aria-current="page"` on it.
  - "sign out": a separate test that signs out and expects `/sign-in`; afterwards `/demo` redirects
    to `/sign-in`.
  - "phone menu": viewport 390×844, the sidebar is hidden, "Open menu" opens the drawer with the
    "Pages" nav; clicking "Events" navigates and closes it; no horizontal page scroll
    (`document.documentElement.scrollWidth <= innerWidth`).
- [ ] **Step 6: Run the whole e2e suite.** `npm run build && npx playwright test` Expected: all pass.
- [ ] **Step 7: Commit** `feat(dashboard): sidebar with app switcher, pages and sign out; phone drawer`

### Task 7: Pending state for the explorer form, funnel editor and saved funnel links

**Files:**
- Modify: `apps/dashboard/src/components/explorer-controls.tsx` (client form),
  `.../funnel-editor.tsx`, `apps/dashboard/src/app/[appId]/funnels/page.tsx` (saved funnel links)
- Test: `apps/dashboard/src/components/explorer-controls.test.tsx`,
  `apps/dashboard/src/components/funnel-editor.test.tsx`, `apps/dashboard/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `usePendingNavigation`, `PendingLink` (Task 1).
- `ExplorerControls` becomes a client component. Submitting builds
  `/${appId}/events?${new URLSearchParams(formData)}` (the server keeps redirecting `fk`/`fv` to
  `filter=`) and calls `navigate`; its form carries `data-pending` while pending.
- `FunnelEditor` calls `navigate` instead of `router.push`; its form carries `data-pending`.
- Saved funnel names on the funnels page use `PendingLink`.

- [ ] **Step 1: Write the failing tests:** `explorer-controls.test.tsx` "Apply navigates in place with
  the form values" (`push` called with `/demo/events?from=2026-10-01&event=place_selected&metric=events&fk=&fv=&by=`
  for the default form of the existing fixture, `{ scroll: false }`); `funnel-editor.test.tsx`: the
  existing URL test now expects `push(…, { scroll: false })`.
- [ ] **Step 2: Run them.** `npx vitest run src/components/explorer-controls.test.tsx src/components/funnel-editor.test.tsx`
  Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: e2e** "funnels: Show funnel keeps the old result dimmed": with a result shown, slow
  RSC, change step 2 and press "Show funnel"; the progress line shows and `funnel-sessions-1` keeps
  its old text until the URL changes.
- [ ] **Step 6: Run the whole e2e suite.** Expected: all pass.
- [ ] **Step 7: Commit** `feat(dashboard): explorer form, funnel editor and saved funnels keep old results dimmed`

### Task 8: Funnel chart

**Files:**
- Create: `apps/dashboard/src/funnels/chart.ts`, `apps/dashboard/src/components/funnel-chart.tsx`
- Modify: `apps/dashboard/src/app/[appId]/funnels/page.tsx` (chart above the table in the result)
- Test: `apps/dashboard/src/funnels/chart.test.ts`, `apps/dashboard/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `FunnelStepView`, `FunnelStep` (`src/funnels/steps.ts`); `formatShare`, `formatInt`.
- Produces:
  - `funnelGeometry(view: readonly FunnelStepView[], opts: { compare: boolean; orientation: "horizontal" | "vertical"; size: number }): FunnelGeometry`
    where `size` is the bar length for the largest value (px), and
    `FunnelGeometry = { bars: Array<{ step: number; length: number; prevLength: number | null }>; chips: Array<{ afterStep: number; label: string }> }`.
    The largest value is the max over all `cur` and (with compare) `prev`; lengths scale linearly;
    chip label is `${formatShare(fromPrev)} →`, or `– →` when `fromPrev` is null. Pixel positions of
    bars, bands and labels are the component's job (they follow from `length` and the bar index).
  - `FunnelChart({ steps, view, compare }: { steps: readonly FunnelStep[]; view: readonly FunnelStepView[]; compare: boolean })`
    (client): horizontal SVG (`hidden sm:block`) and vertical SVG (`sm:hidden`) per the mockup
    `docs/superpowers/specs/2026-10-16-dashboard-layout-mockups/funnel.html`: bars in
    `--chart-current`, previous-period bars behind them in `--chart-previous` at low opacity, hatched
    drop-off bands, conversion chips, session counts on the bars, step names (event; filter as a
    second line). Hover on a bar shows a tooltip `role="tooltip"`: "{n} sessions", "{share} of step 1",
    and with compare "Previous: {n} ({share})". `role="img"` with `aria-label="Funnel chart"`. Each
    bar has `data-testid="funnel-bar-{step}"`.

- [ ] **Step 1: Write the failing tests**

```ts
const view = toFunnelView(
  [{ period: "cur", step: 1, sessions: 2807 }, { period: "cur", step: 2, sessions: 1140 }, { period: "cur", step: 3, sessions: 312 },
   { period: "prev", step: 1, sessions: 2505 }, { period: "prev", step: 2, sessions: 980 }, { period: "prev", step: 3, sessions: 290 }],
  3, true);
const g = funnelGeometry(view, { compare: true, orientation: "horizontal", size: 180 });
expect(g.bars.map((b) => Math.round(b.length))).toEqual([180, 73, 20]);
expect(g.bars.map((b) => Math.round(b.prevLength ?? -1))).toEqual([161, 63, 19]);
expect(g.chips).toEqual([{ afterStep: 1, label: "41 % →" }, { afterStep: 2, label: "27 % →" }]);
expect(funnelGeometry(view, { compare: false, orientation: "horizontal", size: 180 }).bars.every((b) => b.prevLength === null)).toBe(true);
const empty = funnelGeometry(toFunnelView([], 2, true), { compare: true, orientation: "vertical", size: 100 });
expect(empty.bars.map((b) => b.length)).toEqual([0, 0]);
expect(empty.chips).toEqual([{ afterStep: 1, label: "– →" }]);
```

- [ ] **Step 2: Run them.** `npx vitest run src/funnels/chart.test.ts` Expected: FAIL.
- [ ] **Step 3: Implement** `funnelGeometry` and `FunnelChart`; render it in the result panel above
  `FunnelResult`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: e2e** "funnels: chart shows one bar per step with a hover tooltip": on
  `/demo/funnels?steps=place_selected&steps=subscribe_click`, two `funnel-bar-*` visible at 1280 px;
  hovering `funnel-bar-2` shows a tooltip containing "sessions"; at 390 px the vertical chart is
  visible and the page has no horizontal scroll.
- [ ] **Step 6: Run the whole e2e suite.** Expected: all pass.
- [ ] **Step 7: Commit** `feat(dashboard): left-to-right funnel chart with drop-off bands and previous period`

### Task 9: Screens, docs and full verification

**Files:**
- Modify: `apps/dashboard/README.md` (layout and range picker in the feature list, if listed),
  `claude-tmp-helpers/screens/pages.spec.ts` (if pages or labels changed)

- [ ] **Step 1: Screenshots** of overview, events (with an event), funnels (with a result) and
  settings at 1280 and 390 px, plus the range picker open and the phone drawer open, with
  `claude-tmp-helpers/screens.config.ts`. Look at each: no overlap, no horizontal scroll, skeleton
  sizes close to the content.
- [ ] **Step 2: Full verification** from the repo root: `npm test`, `npm run lint`, `npm run typecheck`,
  `npx prettier --check .`, `cd apps/dashboard && npm run build && npx playwright test`, and the
  opt-in dry runs (`RTD_DRY_RUN=1 GCP_PROJECT_ID=robin-thues npx vitest run src/queries/dry-run.integration.test.ts`).
  Expected: all green.
- [ ] **Step 3: Commit** `docs(dashboard): layout notes` (only if files changed).
