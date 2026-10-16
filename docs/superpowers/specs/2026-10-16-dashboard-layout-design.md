# rt-analytics dashboard: layout, range picker, funnel chart and skeletons

**Status:** agreed with Robin on 2026-10-16 (brainstorming with mockups). Builds on the v1 dashboard
(`docs/superpowers/specs/2026-10-14-dashboard-design.md`, the "v1 spec") and on the branch
`fix/sparkline-tooltip`.

## Why

v1 works, but Robin's first look in production showed four things:

1. The app links and the page links share one line. That is confusing today and does not scale to
   10 or 20 apps.
2. Changing the date range needs two date fields and an Apply button.
3. The funnel result is only a table. It does not show the funnel as a flow.
4. Switching pages shows an empty "Loading…" page before anything appears.

The general visual style (colors, type, character) is **not** part of this work. It gets its own
session later.

## Goals

- A layout with the pages in a left sidebar and the app switcher at its top (mockup option "A").
- A date range picker that applies directly, with no Apply button.
- A left-to-right funnel chart above the existing result table.
- Navigation that shows the page frame at once, with skeletons where data is still loading.

## Non-goals

- New colors, fonts or visual identity. Keep today's tokens and shadcn defaults.
- Dark mode.
- A collapsible sidebar or an icon-only rail.
- A Sankey or path explorer (branching flows). Possible v2 item.
- Changes to queries, metrics or caching rules.

## Anti-goals (would make this a failure even if it works)

- Extra BigQuery queries from intermediate states, for example a reload after picking only the
  start day of a range.
- A page that jumps around while panels load (skeletons must take about the size of the content).
- Losing the "every view is a URL" rule (v1 spec section 3): ranges, compare and page parameters
  stay in the URL, and links and bookmarks keep working.
- A dashboard that no longer works at phone width (390 px) without horizontal page scrolling.

## Decided with Robin

### Layout (option A)

- **Sidebar** on the left, on every page under `/[appId]`:
  - At the top, an **app switcher**: a dropdown with a text field to filter the list. Picking an app
    keeps the current page and the date range (and compare), and drops page-only parameters (event,
    steps, funnel), since those belong to the old app.
  - Below it, the pages: Overview, Events, Funnels. The current page is highlighted.
  - At the bottom: Settings, then the signed-in email with **Sign out**. Sign out does not exist in
    v1; it uses Better Auth's sign-out and returns to `/sign-in`.
- **Page top bar** above the content: the page title on the left; on the right the range picker,
  Compare, the Live badge, "Turn Live on/off" and Refresh. The same on every data page. Settings has
  the title only.
- **Phone:** the sidebar is hidden behind a menu button in the page top bar and opens as a drawer.
  The top bar controls wrap below the title when they do not fit.
- The old `Header` component goes away; the sidebar and the top bar replace it.

### Range picker

- One control that replaces the two date fields and Apply. The button shows the current range
  (for example "19 Sept – 16 Oct 2026").
- It opens a popover with **presets** and a **calendar**:
  - Presets "Last 7 days", "Last 28 days", "Last 90 days", all ending today in the app's timezone
    (the v1 default is the last 28 days, `defaultRange`). One click applies.
  - In the calendar the first click sets the start, the second click sets the end, and the second
    click applies. Days after today can not be picked. Ranges follow the v1 limits in
    `parseViewState` (start not after end, end not after today, under 400 days).
- **Compare** applies as soon as it is toggled.
- Applying means navigating to the same page with new `from`, `to` and `compare`, keeping every other
  parameter in the URL (event, metric, filter, by, steps, funnel).
- Without JavaScript, a plain GET form with the two date fields and Apply still works (it can live
  inside a `<noscript>` or be the server-rendered fallback the client control replaces).

### Funnel chart

- Above the existing result table (the table stays, with its exact numbers).
- One vertical bar per step, left to right, height = sessions. Session count on top of each bar.
- Between two bars, a hatched gray band from the top of the left bar down to the top of the right bar:
  the drop-off.
- Between two bars, a chip with the conversion to the next step ("41 % →").
- With compare on, a faint bar behind each step for the previous period.
- Step names under the bars (event name, and the filter as a second line).
- Hover on a bar: sessions, share of step 1, and the previous period's sessions and share.
- 2 to 5 steps. On a phone the chart turns vertical: steps top to bottom, bars as horizontal bars.
- Colors from the existing chart tokens (`--chart-current`, `--chart-previous`). The mockup is in
  `.superpowers/brainstorm/` (gitignored), `funnel.html`.

### Skeletons instead of "Loading…"

- Navigating between pages shows the sidebar, the top bar and the panel frames (titles included)
  right away. Each panel shows a skeleton shaped like its content until its data arrives, and panels
  fill in one by one as their queries finish.
- No page-wide "Loading…" text anywhere under `/[appId]`, including the explorer, funnels and settings.

## Calls I made (Robin can override)

- Sidebar width fixed (about 14 rem); not collapsible in this round.
- The range picker's look stays plain; styling belongs to the visual style session.
- The root `/` page (app list) stays as it is; it is only shown before an app is picked.
- The "From"/"To" date line under the header on the overview ("2026-09-19 to 2026-10-16
  (Europe/Berlin)") stays, because it names the timezone and the compared range; it moves into the
  page top bar or directly under it.
- The range line ("… to … (timezone), compared with …") shows on all three data pages, not only the
  overview.
- The presets need "today" in the app's timezone; the server passes it to the picker (it already
  computes it in `loadPage`).
- Live and Refresh keep their server actions; they take the current URL's query string as today.
- The credentials banner sits at the top of the content area, under the page top bar.
- The app switcher lists the same apps as today (`listApps`: apps with events in the last 7 days plus
  apps with settings), sorted by name.
- Switching apps from Settings opens the other app's Settings.
- The funnel chart hover is for mouse users; the table below carries the same numbers for keyboard and
  screen reader users.
- Existing e2e tests that use the "From"/"To" fields and "Apply" are rewritten for the range picker.
- Calendar and popover come from shadcn (this project's shadcn setup uses Base UI,
  `@base-ui/react`); the calendar uses `react-day-picker`. Check the current stable versions when
  adding them.

## Constraints

- Next.js 16 with `cacheComponents` and `partialPrefetching` on. Reading `params` or `searchParams`
  is dynamic and must sit inside a Suspense boundary; the static shell (sidebar frame, top bar frame,
  panel frames) should be outside of it so it can be prefetched and shown at once. Read the Next.js
  docs in `apps/dashboard/node_modules/next/dist/docs/` before changing the layout (see
  `apps/dashboard/AGENTS.md`).
- Keep the v1 query layer as it is: one query per panel, cached as today, Live and Refresh unchanged.
  The page start (`loadPage`) runs once per request even if several panels need it (React `cache`).
- Everything that works without JavaScript today keeps working without it, except that the app
  switcher and range picker may fall back to plain links and the plain date form.
- Playwright e2e tests use labels; keep accessible names for the controls (the range picker button,
  Compare, the app switcher, the sidebar links).
- Testing as in v1: unit tests for pure logic (range presets, URL building on apply and on app
  switch, funnel chart geometry), component tests for the controls, e2e for navigation and the
  funnel chart, screenshots at 1280 and 390 px.

## Left to the builder

- Component structure and file names (for example `components/app-sidebar.tsx`,
  `components/page-bar.tsx`, `components/range-picker.tsx`, `components/funnel-chart.tsx`).
- Whether the funnel chart is SVG by hand or Recharts, as long as it matches the mockup and has the
  hover details.
- Skeleton shapes per panel.
- How the drawer on phones is built (shadcn Sheet or a simple dialog).
