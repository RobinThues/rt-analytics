# Dashboard visual style, brand and dark mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the dashboard the "Middle" visual style (flat panels, no nested boxes, 6/4 px corners,
13 px text), a quiet true-violet identity with a rising-bars mark, and a system-following dark mode
with a no-flash System/Light/Dark switch.

**Architecture:** All colors become `light-dark()` tokens in `globals.css`, switched by `color-scheme`
on `<html>`; an inline head script sets `dark`/`light` and `data-theme-choice` from the `rta-theme`
cookie before first paint, so the server never reads the cookie and `cacheComponents` stays
untouched. Shared building blocks replace today's ad-hoc markup: `Change` (neutral arrow), `KpiRow`
(numbers split by lines), `BarLabel` (row bars), `ChartLegendLine`, `Mark`/`Wordmark`,
`ThemeSwitch`. Skeletons are reshaped to the new sizes and an e2e test pins panel heights.

**Tech Stack:** Next.js 16.4 (`cacheComponents`, `partialPrefetching`), React 19, Tailwind 4, shadcn
(Base UI), Recharts 3, react-day-picker (shadcn Calendar), Vitest + Testing Library + happy-dom,
Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-dashboard-visual-style-design.md`. Layout spec:
`docs/superpowers/specs/2026-10-16-dashboard-layout-design.md`. Mockup canvas:
https://claude.ai/artifact/Y4i79mbqTBrUoAngCBAT4t ("Middle" artboards).

**Branch:** `feat/dashboard-visual-style` (from main ee6b386; the spec commit is on it). Work in the
main checkout (env files, `.vercel` and `node_modules` live there). All commands run in
`apps/dashboard` unless a path says otherwise. Commits carry no Co-Authored-By trailer (Robin's rule).

## Global Constraints

- Brand: true violet, `oklch(0.52 0.2 300)` light, `oklch(0.74 0.15 300)` dark; text on violet white
  (light) / `oklch(0.18 0.03 300)` (dark); soft `oklch(0.95 0.035 300)` / `oklch(0.3 0.07 300)`.
- Brand only for: mark, active sidebar item, primary buttons, focus rings, the listed links, range
  picker selected preset and days, Compare checkbox, Live badge, progress line. Never surfaces, charts,
  data, KPI changes or errors.
- Data colors unchanged: `--chart-current` `#2a78d6` / `#3987e5`, `--chart-previous` `#8f8e88`.
- Every color token is one `light-dark(light, dark)` declaration; no `.dark {}` token block.
- Radius scale: `--radius-sm: 2px; --radius-md: 4px; --radius-lg: 4px; --radius-xl: 6px`. Badge stays
  a pill. Nothing with a border or radius inside a panel except controls, tooltips, skeletons, row
  bars, chart marks and funnel result bars.
- `--text-sm` is 13 px; root font size stays 16 px; native inputs/selects/textareas `text-base
  md:text-sm` (no iOS zoom).
- Change display: `▲`/`▼` as aria-hidden SVG + sr-only "up"/"down", no-break space before `%`, text
  color only (never green/red). `0 %` and `new` keep their wording.
- Theme cookie `rta-theme`, values `system | light | dark`, path `/`, max-age one year, `SameSite=Lax`,
  `Secure` on https. Any other value means `system`.
- No spinners. A fixed-shape panel's (Summary, Over time, Web vitals, Errors over time) skeleton
  height differs from its loaded height by at most 4 px; tables show a 5-row skeleton at 30 px rows.
- 390 px wide without horizontal page scroll, in both themes.
- Accessible names tests rely on (exact, unchanged from the layout plan plus new): "Date range",
  "Last 7 days", "Last 28 days", "Last 90 days", "Compare", "Switch app", nav "Pages", "Sign out",
  "Open menu"; new: group "Theme" with buttons "System", "Light", "Dark".
- Copy: "This period", "Previous period", "vs previous period", "rt-analytics" (lowercase).
- BigQuery cost: during tasks use the screenshot helper on a few pages; each new e2e spec may run on
  its own at most twice; the full e2e suite runs once, in Task 10. Every Playwright run starts a fresh
  `next start` with a cold cache, so every run queries BigQuery.
- Commits: each commit step adds only the files in its task's **Files** block (`git add <paths>`),
  never `git add -A` (the tree may hold unrelated edits).
- Skeleton roots keep `data-testid="skeleton"` (e2e relies on it: `e2e/dashboard.spec.ts:194,218,280,356`).
- Screenshot helper: `claude-tmp-helpers/screens.config.ts` at the repo root, run from `apps/dashboard`
  as `npx playwright test --config ../../claude-tmp-helpers/screens.config.ts`; env `SCREENS_PAGES`,
  `SCREENS_ELEMENTS` (test ids), `SCREENS_THEME` (from Task 7), `SCREENS_DIR`.

## Review Focus

1. A missing, empty or garbage `rta-theme` cookie (`rta-theme=`, `rta-theme=blue`) must behave like
   `system` and never throw in the head script. Pinned in Task 2 (`themeScript` tests).
2. With "System" chosen, an OS switch between light and dark must follow live without JS (CSS media
   query only). Pinned in Task 10 (e2e with `emulateMedia`).
3. Very long labels (URLs, referrers) in fixed-layout tables with row bars at 390 px must truncate,
   not widen the page. Pinned in Task 5 (unit: label cell has `truncate`) and Task 10 (390 px e2e on
   overview, events, funnels in both themes).
4. Compare off: the legend line shows only "This period" but keeps its height; KPI cells show no
   change line; change columns disappear. Pinned in Task 6 (`ChartLegendLine` test) and Task 4
   (`KpiRow` test without change).
5. A custom range (not ending today, or ending today with a non-preset length) must select no preset.
   Pinned in Task 8 (`selectedPreset` tests).

---

### Task 1: Color tokens, radius scale, dark variant and card border

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/ui/card.tsx:10`
- Create: `src/app/globals.test.ts`
- Create: `~/.claude-helpers/oklch-contrast.mjs` (general helper, outside the repo)

**Interfaces:**
- Produces: Tailwind colors `bg-row-line`/`border-row-line`, `bg-chart-bar`, `bg-chart-area` (and the
  CSS vars `--row-line`, `--chart-bar`, `--chart-area`); the `dark:` variant that matches `.dark` and
  system-dark without `.light`; class `theme-switching` on `<html>` turns transitions off.

- [ ] **Step 1: Write the failing test** `src/app/globals.test.ts` (`// @vitest-environment node`),
  reading `globals.css` as text:
  - `it("defines every color token once with light-dark()")`: for each of `background card popover
    foreground card-foreground popover-foreground muted muted-foreground secondary
    secondary-foreground accent accent-foreground border input ring primary primary-foreground
    destructive sidebar sidebar-foreground sidebar-primary sidebar-primary-foreground sidebar-accent
    sidebar-accent-foreground sidebar-border sidebar-ring row-line chart-current chart-previous
    chart-bar chart-area`, the file matches `new RegExp(`--${t}: light-dark\\(`)` exactly once.
  - `it("has no dark token block")`: `expect(css).not.toMatch(/^\.dark\s*\{/m)`.
  - `it("pins the radius scale")`: contains `--radius-sm: 2px`, `--radius-md: 4px`,
    `--radius-lg: 4px`, `--radius-xl: 6px`.
  - `it("dark variant covers class and system")`: the `@custom-variant dark` block contains
    `.dark` and `prefers-color-scheme: dark` and `:root:not(.light)`.
  - `it("sets color-scheme per class")`: contains `color-scheme: light dark`, `:root.light` with
    `color-scheme: light`, `:root.dark` with `color-scheme: dark`.
  - `it("brand and data values")`: contains `oklch(0.52 0.2 300)`, `oklch(0.74 0.15 300)`,
    `#2a78d6`, `#3987e5`, `#8f8e88`, `--text-sm: 13px`.

- [ ] **Step 2: Run it** `npx vitest run src/app/globals.test.ts` — Expected: FAIL.

- [ ] **Step 3: Rewrite `globals.css`** with the spec's token table ("Color tokens"): one `:root`
  block of `light-dark()` values (`--destructive: light-dark(oklch(0.577 0.245 27.325),
  oklch(0.704 0.191 22.216))`; `--chart-bar`/`--chart-area` as `color-mix(in oklab,
  var(--chart-current) N%, transparent)` with N = 11/18 and 9/14 inside `light-dark()`); delete the
  `.dark` block; keep `--chart-1..5` unchanged as plain values; add `--color-row-line`,
  `--color-chart-bar`, `--color-chart-area` to `@theme inline`; replace the derived radius lines with
  the four fixed values (keep `--radius-2xl..4xl` derived from a `--radius: 6px`); add
  `--text-sm: 13px; --text-sm--line-height: calc(1.25 / 0.8125);`; replace the dark variant with the
  spec's exact `@custom-variant dark { … }` block; add the three `color-scheme` rules and
  `.theme-switching, .theme-switching * { transition: none !important; }`; in the base layer change
  `outline-ring/50` to `outline-ring` (full-opacity focus outline for links and native controls).
  Note: `light-dark()` in custom properties needs Safari 17.5+ (accepted).

- [ ] **Step 4: Card border** — in `ui/card.tsx` replace `ring-1 ring-foreground/10` with
  `border border-border`.

- [ ] **Step 5: Contrast helper** — create `~/.claude-helpers/oklch-contrast.mjs` (usage comment at
  top): `node oklch-contrast.mjs "<fg oklch>" "<bg oklch>" […pairs]` converts oklch → sRGB (clamped)
  and prints the WCAG ratio per pair, plus `--hex "<oklch>"` to print the sRGB hex (Task 7 needs the
  favicon color). Run it for: foreground and muted-foreground on card and background, both modes;
  primary on card (≥ 3:1, focus ring) and primary-foreground on primary (≥ 4.5:1), both modes;
  sidebar-accent-foreground on sidebar-accent. Expected: all body/muted pairs ≥ 4.5, ring ≥ 3. If one
  fails, adjust only that lightness by the smallest step that passes and note it in the commit.

- [ ] **Step 6: Run** `npx vitest run src/app/globals.test.ts && npm run build` — Expected: PASS,
  build OK.

- [ ] **Step 7: Commit** `git add -A src/app/globals.css src/app/globals.test.ts src/components/ui/card.tsx`
  `git commit -m "feat(dashboard): light-dark color tokens, fixed radius scale, dark variant"`

---

### Task 2: Theme script, store and switch

**Files:**
- Create: `src/theme/script.ts`, `src/theme/script.test.ts`
- Create: `src/theme/store.ts`, `src/components/theme-switch.tsx`, `src/components/theme-switch.test.tsx`
- Modify: `src/app/layout.tsx`, `src/components/app-sidebar.tsx` (footer)

**Interfaces:**
- Produces: `THEME_COOKIE = "rta-theme"`; `type ThemeChoice = "system" | "light" | "dark"`;
  `themeScript: string` (self-contained IIFE source); `setThemeChoice(choice: ThemeChoice): void`;
  `useThemeChoice(): ThemeChoice | null` (null on the server and before hydration);
  `<ThemeSwitch />`.

- [ ] **Step 1: Write the failing tests** `src/theme/script.test.ts` (happy-dom; reset
  `document.cookie` and `<html>` attributes in `beforeEach`; run with `new Function(themeScript)()`):
  - no cookie → `data-theme-choice="system"`, no `dark`/`light` class;
  - `rta-theme=dark` → class `dark`, attr `dark`; `rta-theme=light` → class `light`, attr `light`;
  - `rta-theme=` and `rta-theme=blue` → attr `system`, no class, no throw;
  - a pre-existing class `h-full` on `<html>` is still there afterwards.
  `src/components/theme-switch.test.tsx`:
  - renders group "Theme" with buttons "System", "Light", "Dark";
  - clicking "Dark": `document.cookie` contains `rta-theme=dark`, `<html>` has class `dark` and
    `data-theme-choice="dark"`, "Dark" has `aria-pressed="true"`;
  - then "System": no `dark`/`light` class, attr `system`;
  - two `<ThemeSwitch />` rendered side by side: clicking "Light" in the first sets
    `aria-pressed="true"` on "Light" in both (no `waitFor` needed: notification is synchronous).
  Both test files reset `document.cookie` (expire `rta-theme`), the `<html>` class and
  `data-theme-choice` in `beforeEach`.

- [ ] **Step 2: Run** `npx vitest run src/theme src/components/theme-switch.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement `src/theme/script.ts`.** `themeScript` is a hand-written string literal
  (not `fn.toString()`): read the cookie with a regex on `document.cookie`, map anything but
  `light`/`dark` to `system`, `classList.add` the class (never assign `className`), `setAttribute(
  "data-theme-choice", …)`, wrapped in `try {} catch {}`.

- [ ] **Step 4: Implement `src/theme/store.ts`** (`"use client"`-free module): `setThemeChoice`
  writes the cookie (`; path=/; max-age=31536000; samesite=lax` plus `; secure` when
  `location.protocol === "https:"`), adds `theme-switching` to `<html>`, removes `dark`/`light`, adds
  the new class unless `system`, sets `data-theme-choice`, removes `theme-switching` after two
  `requestAnimationFrame`s; subscribers are notified synchronously right after the attribute is set
  (only the `theme-switching` removal waits). `useThemeChoice` uses `useSyncExternalStore`
  with the client snapshot from `data-theme-choice` and server snapshot `null`.

- [ ] **Step 5: Implement `<ThemeSwitch />`** (`"use client"`): `role="group" aria-label="Theme"`, a
  3-column segmented control, 24 px buttons, `text-xs`, 4 px radius. Each button's selected look comes
  from literal classes keyed on the `<html>` attribute, e.g. "Dark":
  `in-data-[theme-choice=dark]:bg-muted in-data-[theme-choice=dark]:text-foreground` (others
  `text-muted-foreground`), so it is right at first paint. `aria-pressed={choice === null ?
  undefined : choice === value}`.

- [ ] **Step 6: Root layout** — `<html … suppressHydrationWarning>` and an explicit `<head>` whose first
  child is `<script dangerouslySetInnerHTML={{ __html: themeScript }} />`.

- [ ] **Step 7: Sidebar footer** — in `AppSidebar` render `<ThemeSwitch />` as the first child of the
  footer block, above the email.

- [ ] **Step 8: Run** `npx vitest run src/theme src/components/theme-switch.test.tsx && npm run build`
  — Expected: PASS.

- [ ] **Step 9: Commit** `git commit -m "feat(dashboard): no-flash theme script and System/Light/Dark switch"`

---

### Task 3: Neutral change display

**Files:**
- Modify: `src/lib/format.ts`, `src/lib/format.test.ts`
- Create: `src/components/change.tsx`, `src/components/change.test.tsx`
- Modify: `src/components/kpi-tile.tsx`, `src/components/breakdown-table.tsx`,
  `src/components/event-list.tsx`, `src/app/[appId]/events/page.tsx` (PropBreakdownPanel), their tests

**Interfaces:**
- Produces: `changeParts(pct: number | null): { dir: "up" | "down" | "none"; text: string }`
  (replaces `formatChange`, which is removed); `<Change pct={number | null} />`.

- [ ] **Step 1: Failing tests.** `format.test.ts`: `changeParts(12.4)` → `{ dir: "up", text:
  "12 %" }`; `changeParts(-5)` → `{ dir: "down", text: "5 %" }`; `changeParts(0.4)` →
  `{ dir: "none", text: "0 %" }`; `changeParts(null)` → `{ dir: "none", text: "new" }`;
  `changeParts(1234)` → text `"1,234 %"`. `change.test.tsx`: `<Change pct={12.4} />` has text
  content `up 12 %` (jest-dom normalizes spaces), one `svg[aria-hidden="true"]`, an `.sr-only` "up";
  `pct={null}` → text `new`, no svg; `pct={0}` → `0 %`, no svg.

- [ ] **Step 2: Run** `npx vitest run src/lib/format.test.ts src/components/change.test.tsx` — FAIL.

- [ ] **Step 3: Implement.** `Change` renders `inline-flex items-center gap-1 whitespace-nowrap
  tabular-nums`: an 8×8 SVG triangle (`fill="currentColor"`, rotated for down) with `aria-hidden`,
  `<span className="sr-only">up </span>` / `down ` (with a trailing space, so text content reads
  "up 12 %"), then the text. Replace every `formatChange(…)` call with
  `<Change pct={…} />` (`grep -rn formatChange src`), remove `formatChange`.

- [ ] **Step 4: Update callers' tests** (`kpi-tile.test.tsx`, `breakdown-table.test.tsx`): assert
  `toHaveTextContent("up 12 %")` / `("up 100 %")` instead of `getByText("+12 %")`.

- [ ] **Step 5: Run** `npm test` — Expected: PASS.

- [ ] **Step 6: Commit** `git commit -m "feat(dashboard): neutral arrow change display"`

---

### Task 4: KPI row without boxes

**Files:**
- Create: `src/components/kpi-grid.ts`, `src/components/kpi-grid.test.ts`
- Create: `src/components/kpi-row.tsx`, `src/components/kpi-row.test.tsx`
- Delete: `src/components/kpi-tile.tsx`, `src/components/kpi-tile.test.tsx`
- Modify: `src/app/[appId]/panels/traffic.tsx`, `quality.tsx`, `people.tsx`,
  `src/app/[appId]/events/page.tsx`, `src/components/skeletons.tsx`, `src/app/[appId]/page.tsx`
  (Web vitals fallback)

**Interfaces:**
- Consumes: `<Change>` (Task 3).
- Produces: `type KpiCols = { base: 1 | 2 | 3 | 6; sm?: 2 | 3 | 6; lg?: 2 | 3 | 6 }`;
  `kpiEdges(index: number, count: number, cols: number): { left: boolean; top: boolean; bottom: boolean }`;
  `kpiCellClass(index: number, count: number, cols: KpiCols): string`;
  `type KpiCellData = { label: string; value: string; change: number | null | undefined; testId: string }`;
  `<KpiRow cols={KpiCols} cells={readonly KpiCellData[]} />`;
  `<KpiSkeleton cols={KpiCols} count={number} coverage={boolean} />` (replaces today's no-arg one).

- [ ] **Step 1: Failing tests.** `kpi-grid.test.ts`: `kpiEdges(0, 6, 6)` → all false;
  `kpiEdges(3, 6, 6)` → `{ left: true, top: false, bottom: false }`; `kpiEdges(2, 6, 2)` →
  `{ left: false, top: true, bottom: true }`; `kpiEdges(5, 6, 3)` → `{ left: true, top: true,
  bottom: false }`; `kpiEdges(2, 3, 3)` → `{ left: true, top: false, bottom: false }`;
  `kpiEdges(0, 1, 1)` → all false. Class checks compare tokens (`.split(" ")`), never substrings:
  `kpiCellClass(1, 6, { base: 2, sm: 3, lg: 6 })` has tokens `border-l`, `sm:border-l`, `lg:border-l`;
  `kpiCellClass(3, 6, …)` has `border-l`, `sm:border-l-0`, `lg:border-l`; `kpiCellClass(1, 6, …)` has
  `pr-0` (last column at base) and `sm:pr-4`. `kpi-row.test.tsx`: renders each value under its
  `testId`, the change line "up 13 % vs previous period" when `change` is a number; when `change` is
  `undefined` no "vs previous period" but an empty `aria-hidden` `h-4` line is still there; "new" when
  `null`; a single cell has no `border-l`/`border-t` token; label, value and change line carry
  `truncate` and `whitespace-nowrap`.

- [ ] **Step 2: Run** `npx vitest run src/components/kpi-grid.test.ts src/components/kpi-row.test.tsx` — FAIL.

- [ ] **Step 3: Implement `kpi-grid.ts`.** `left = index % cols !== 0`, `top = index >= cols`,
  `bottom = index < (Math.ceil(count / cols) - 1) * cols`. `kpiCellClass` builds the string from
  literal lookup tables per breakpoint prefix (`""`, `"sm:"`, `"lg:"`) so Tailwind sees every class:
  line → `border-l pl-4` / no line → `border-l-0 pl-0`; top → `border-t pt-3` / `border-t-0 pt-0`;
  bottom → `pb-3` / `pb-0`; non-last column → `pr-4`, last column → `pr-0` (per breakpoint). Also export the literal grid-cols lookup
  (`grid-cols-1|2|3|6`, `sm:grid-cols-2|3|6`, `lg:grid-cols-2|3|6`).

- [ ] **Step 4: Implement `KpiRow`** — cell: label `text-xs text-muted-foreground`, value
  `text-2xl font-semibold leading-tight tracking-tight tabular-nums` with `data-testid`, change line
  `text-xs text-muted-foreground` holding `<Change>` in `text-foreground font-medium` + " vs previous
  period". Each of the three lines is `truncate whitespace-nowrap` (label and value get `title`), so a
  cell is always exactly three lines at any width; with `change === undefined` the third line is an
  empty `aria-hidden` `h-4` (static fallbacks cannot know `compare`). `KpiSkeleton` renders the same
  grid and cell classes with `Skeleton`s sized to the three lines (h-4 w-24, h-7.5 w-16, h-4 w-32);
  with `coverage` it adds `Skeleton h-10 w-full sm:h-5 sm:w-72` below, inside the same `gap-3` as
  `KpiPanel`.

- [ ] **Step 5: Callers.** Summary (`traffic.tsx`): `cols={{ base: 2, sm: 3, lg: 6 }}`, keep the
  `CoverageNote` below. Web vitals (`quality.tsx`): `cols={{ base: 3 }}`. People and explorer total:
  `cols={{ base: 1 }}` (keep their width wrappers). Overview page fallbacks: Summary
  `<KpiSkeleton cols={{ base: 2, sm: 3, lg: 6 }} count={6} coverage />`, Web vitals
  `<KpiSkeleton cols={{ base: 3 }} count={3} coverage={false} />`. Delete `KpiTile` and its test.

- [ ] **Step 6: Run** `npm test && npm run typecheck` — Expected: PASS.

- [ ] **Step 7: Commit** `git commit -m "feat(dashboard): KPI row split by lines instead of boxed tiles"`

---

### Task 5: Tables and row bars

**Files:**
- Create: `src/components/bar-label.tsx`, `src/components/bar-label.test.tsx`
- Modify: `src/components/ui/table.tsx`, `src/components/breakdown-table.tsx` (+ test),
  `src/components/event-list.tsx`, `src/app/[appId]/events/page.tsx` (PropBreakdownPanel),
  `src/components/funnel-result.tsx`, `src/components/skeletons.tsx` (`TableSkeleton`)
- Create: `src/components/event-list.test.tsx`

**Interfaces:**
- Produces: `rowBarWidth(value: number, top: number): string | null` (in `bar-label.tsx`);
  `<BarLabel width={string | null} title?={string}>{label}</BarLabel>` (label cell content; the
  label `TableCell` gets `relative` so the bar is positioned against the whole cell).

- [ ] **Step 1: Failing tests.** `bar-label.test.tsx`: `rowBarWidth(50, 200)` → `"25.0%"`;
  `rowBarWidth(200, 200)` → `"100.0%"`; `rowBarWidth(5, 0)` → `null`; `rowBarWidth(300, 200)` →
  `"100.0%"`; `<BarLabel width="25.0%">x</BarLabel>` renders `[data-testid="row-bar"]` with style
  width 25.0% and the label in an element with class `truncate`; `width={null}` renders no bar.
  `breakdown-table.test.tsx`: first row's bar is `100.0%`, the "Other" row has no `row-bar`.
  `event-list.test.tsx` (mock `next/navigation` as in `range-picker.test.tsx:7`, since `PendingLink`
  uses `usePendingNavigation`): two rows (totals 40 and 10) → bars `100.0%` and `25.0%`; event links
  keep class `underline` and have no `text-primary`.

- [ ] **Step 2: Run** `npx vitest run src/components/bar-label.test.tsx src/components/breakdown-table.test.tsx src/components/event-list.test.tsx` — FAIL.

- [ ] **Step 3: Implement `BarLabel`** as a fragment: bar `absolute inset-y-[3px] left-0 rounded-sm
  bg-chart-bar` with `aria-hidden` and `data-testid="row-bar"` (positioned against the `relative`
  label cell, so it is inset 3 px from the 30 px row); label `relative block truncate pl-1.5`.

- [ ] **Step 4: Table primitives** (`ui/table.tsx`): `TableRow` `border-b border-row-line` (keep
  hover and selected), header rows `[&_tr]:border-border`; `TableHead` `h-8 text-xs font-medium
  text-muted-foreground`; `TableCell` `px-2 py-[5px]` (30 px rows at 20 px line height).

- [ ] **Step 5: Bar tables.** `BreakdownTable`, `EventList`, `PropBreakdownPanel`: `className`
  adds `table-fixed`; number columns get widths on their `TableHead`: breakdown Pageviews
  `w-16 sm:w-20`, Change `w-16 sm:w-20`, Visitors/day `w-20 sm:w-24`; event list Count `w-16 sm:w-20`,
  Change `w-16 sm:w-20`, Trend `w-24` (the sparkline is 80 px plus cell padding); prop breakdown value
  `w-20`, Change `w-20`. Label cells (`relative`) wrap the text in `BarLabel` with `rowBarWidth(row value, first non-Other row's value)`; "Other"
  gets `width={null}`. Drop the old `max-w-*` on those label cells.

- [ ] **Step 6: Funnel result bars** — `rounded-full` → `rounded-sm` on track and bar.

- [ ] **Step 7: `TableSkeleton({ rows })`** — header `Skeleton h-8`, then `rows` wrappers of
  `h-[30px] py-[5px]` each holding `Skeleton h-5`, no gap (matches the table height).

- [ ] **Step 8: Run** `npm test` — Expected: PASS.

- [ ] **Step 9: Commit** `git commit -m "feat(dashboard): flat tables with row bars, 30 px rows"`

---

### Task 6: Charts, legend line and tooltips

**Files:**
- Create: `src/components/chart-legend-line.tsx`, `src/components/chart-legend-line.test.tsx`
- Modify: `src/components/trend-chart.tsx`, `src/components/sparkline.tsx`,
  `src/components/funnel-chart.tsx`, `src/app/[appId]/panels/traffic.tsx`,
  `src/app/[appId]/events/page.tsx` (SeriesPanel), `src/components/skeletons.tsx`
  (`ChartSkeleton`), `src/app/[appId]/page.tsx` (Over time and Errors fallbacks)

**Interfaces:**
- Produces: `<ChartLegendLine compare={boolean} />` (always one line, `h-5`);
  `ChartSkeleton({ height = 160, count = 1, titles = false, legend = false })`.

- [ ] **Step 1: Failing tests** `chart-legend-line.test.tsx`: `compare={false}` → text "This period",
  no "Previous period", root has class `h-5`; `compare` → both labels; the previous swatch is a dashed
  line (`stroke-dasharray` attribute present).

- [ ] **Step 2: Run** `npx vitest run src/components/chart-legend-line.test.tsx` — FAIL.

- [ ] **Step 3: Implement `ChartLegendLine`**: `flex h-5 items-center gap-4 text-xs
  text-muted-foreground`, 18×6 SVG swatches in `var(--chart-current)` (solid, 2) and
  `var(--chart-previous)` (dashed `4 3`, 1.5).

- [ ] **Step 4: TrendChart** — `LineChart` → `ComposedChart`; add `<Area dataKey="cur"
  type="monotone" fill="var(--chart-area)" fillOpacity={1} stroke="none" activeDot={false}
  isAnimationActive={false} />` before the lines; `CartesianGrid vertical={false} stroke="var(--row-line)"`; axis `tick={{ fontSize: 11 }}`
  with `className="tabular-nums"` on the container; height `h-40`; remove the `ChartLegend`;
  tooltip box `rounded-md border bg-popover`.

- [ ] **Step 5: Legend placement** — one shared wrapper gap: legend line and chart(s) sit in
  `flex flex-col gap-2`. `TrafficCharts`: `<ChartLegendLine compare={ctx.compare} />` above the
  3-chart grid (chart titles keep `mb-2` + 20 px line); `ErrorChart` and explorer `SeriesPanel`: the
  line directly above their chart in the same wrapper.

- [ ] **Step 6: Tooltips and chips** — `sparkline.tsx` and `funnel-chart.tsx` tooltips `bg-popover`;
  funnel chip `fill="var(--card)"`.

- [ ] **Step 7: `ChartSkeleton`** — new default `height = 160`; root keeps `data-testid="skeleton"`;
  `legend` adds a `h-5` skeleton line above, in the same `flex flex-col gap-2`; `titles` adds a
  `h-5 mb-2` title skeleton above each chart (matching the chart titles).
  Fallbacks: Over time `<ChartSkeleton count={3} titles legend />`, Errors over time
  `<ChartSkeleton legend />`.

- [ ] **Step 8: Run** `npm test && npm run build` — Expected: PASS.

- [ ] **Step 9: Commit** `git commit -m "feat(dashboard): area charts with one legend line per place, popover tooltips"`

---

### Task 7: Mark, wordmark, favicon and brand use

**Files:**
- Create: `src/components/mark.tsx`, `src/components/mark.test.tsx`, `src/app/icon.svg`
- Delete: `src/app/favicon.ico`
- Modify: `src/proxy.ts`, `src/proxy.test.ts`, `src/app/[appId]/layout.tsx`,
  `src/components/mobile-nav.tsx`, `src/components/page-bar.tsx`, `src/components/app-sidebar.tsx`,
  `src/components/progress-line.tsx`, `src/components/compare-toggle.tsx`,
  `src/components/retry-button.tsx`, `src/app/privacy/page.tsx`, `src/app/[appId]/settings/page.tsx`,
  `src/app/sign-in/page.tsx`, `src/components/ui/button.tsx`, `ui/input.tsx`, `ui/select.tsx`,
  `ui/badge.tsx`, `ui/calendar.tsx` (focus rings)

**Interfaces:**
- Produces: `<Mark className?: string />` (inline SVG, `aria-hidden`, bars in `var(--primary)`);
  `<Wordmark className?: string />` (Mark + "rt-analytics").

- [ ] **Step 1: Failing tests.** `proxy.test.ts`: `runsProxy("/icon.svg")` is `false`.
  `mark.test.tsx`: `Wordmark` has text "rt-analytics" and one `svg[aria-hidden="true"]` with three
  `rect`s; `Mark` alone has no text.

- [ ] **Step 2: Run** `npx vitest run src/proxy.test.ts src/components/mark.test.tsx` — FAIL.

- [ ] **Step 3: Mark** — viewBox `0 0 16 16`, rects `(1,9,3.6,6)`, `(6.2,5,3.6,10)`,
  `(11.4,1,3.6,14)`, `rx="0.8"`, `fill="var(--primary)"`, default size `1.1em`. Wordmark:
  `inline-flex items-center gap-2 font-semibold tracking-tight`.

- [ ] **Step 4: Favicon** — `app/icon.svg` with the same rects in the sRGB hex of
  `oklch(0.52 0.2 300)` (`node ~/.claude-helpers/oklch-contrast.mjs --hex "oklch(0.52 0.2 300)"`);
  `git rm src/app/favicon.ico`; proxy matcher `…|favicon.ico|icon.svg).*)`.

- [ ] **Step 5: Placement.** `[appId]/layout.tsx` aside: `w-52 bg-sidebar`, a static `<div
  className="px-5 pt-4"><Wordmark /></div>` above the Suspense. `AppSidebar` root changes from
  `flex h-full flex-col` to `flex min-h-0 flex-1 flex-col`, so the footer (theme switch, Sign out)
  stays inside the `h-dvh` aside. Drawer (`mobile-nav.tsx`): `SheetContent` adds `bg-sidebar`; the
  wrapper becomes `flex h-full flex-col`, its top `pt-10` space becomes a `h-10 shrink-0 px-4 flex
  items-center` row with `<Wordmark />` (the close button stays top right), then the sidebar. `PageBar`: `<Mark
  className="size-4 md:hidden" />` right after `MobileNavTrigger`. Sign-in page: the `h1` holds
  `<Wordmark />` at `text-2xl`.

- [ ] **Step 6: Brand uses.** Active sidebar link: `bg-sidebar-accent text-sidebar-accent-foreground
  font-semibold`. Live badge (`page-bar.tsx`): `className="bg-sidebar-accent
  text-sidebar-accent-foreground"`. Progress line: `bg-primary`. Compare checkbox: `accent-primary`.
  Links `text-primary underline underline-offset-2`: privacy mailto, settings back link,
  `RetryButton`. Focus rings: in `ui/button`, `ui/input`, `ui/select` trigger and `ui/badge` replace
  `focus-visible:ring-3 focus-visible:ring-ring/50` (badge `ring-[3px]`) with `focus-visible:ring-2
  focus-visible:ring-ring`; calendar day `group-data-[focused=true]/day:ring-[3px]
  group-data-[focused=true]/day:ring-ring/50` → `group-data-[focused=true]/day:ring-2
  group-data-[focused=true]/day:ring-ring` (keep the prefix).

- [ ] **Step 7: Screenshot helper** (gitignored, repo root) — `claude-tmp-helpers/screens/pages.spec.ts`:
  widths 1440 and 390; `SCREENS_THEME=light|dark` sets the `rta-theme` cookie before the first goto;
  also log every `td` whose `scrollWidth > clientWidth` (cell overflow) per page.

- [ ] **Step 8: Run** `npm test && npm run build` — Expected: PASS. Then one screenshot run (overview,
  1440 and 390, light) and look at the sidebar (footer visible without scrolling), drawer and top bar.

- [ ] **Step 9: Commit** `git commit -m "feat(dashboard): violet mark, wordmark and favicon; quiet brand accents"`

---

### Task 8: Range picker selected preset and violet range

**Files:**
- Modify: `src/view/range-ui.ts` (+ its test), `src/components/range-picker.tsx`,
  `src/components/range-picker.test.tsx`, `src/components/ui/calendar.tsx`

**Interfaces:**
- Produces: `selectedPreset(range: DateRange, today: string): RangePreset | null`.

- [ ] **Step 1: Failing tests.** `range-ui` test: with `today = "2026-10-17"`,
  `selectedPreset(presetRange(28, today), today)` → `28`; same for 7 and 90; `{ from: "2026-09-19",
  to: "2026-10-16" }` (28 days ending yesterday) → `null`; `{ from: "2026-09-18", to: "2026-10-17" }`
  (30 days) → `null`. `range-picker.test.tsx`: opened with `range = presetRange(28, today)`, "Last 28
  days" has `aria-pressed="true"` and the other presets `"false"`; with a custom range all three are
  `"false"`; opened with a range, clicking one day leaves exactly that day selected (`data-range-start`
  or `data-selected-single`), with no other day selected.

- [ ] **Step 2: Run** `npx vitest run src/view src/components/range-picker.test.tsx` — FAIL.

- [ ] **Step 3: Implement** `selectedPreset` by comparing with `presetRange(days, today)` for each of
  `RANGE_PRESETS`. In `RangePicker`, presets get `aria-pressed` and, when selected,
  `bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent
  dark:hover:bg-sidebar-accent`. The calendar's `selected` shows the current range when no start is
  picked: `start ? { from: dayToDate(start), to: undefined } : { from: dayToDate(range.from), to:
  dayToDate(range.to) }`, and the Calendar gets `onSelect={() => {}}` so react-day-picker treats
  `selected` as controlled (without `onSelect` it is only the initial value). `ui/calendar.tsx`: range
  middle `bg-muted text-foreground` → `bg-sidebar-accent text-sidebar-accent-foreground`; the
  `range_start`/`range_end` cell classes `bg-muted after:bg-muted` → `bg-sidebar-accent
  after:bg-sidebar-accent` (the day buttons already use `bg-primary`).

- [ ] **Step 4: Run** `npm test` — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "feat(dashboard): range picker marks the selected preset and range"`

---

### Task 9: Middle sizes, controls and the remaining pages

**Files:**
- Modify: `src/components/panel.tsx`, `src/components/page-bar.tsx`, `src/app/[appId]/page.tsx`,
  `src/app/[appId]/events/page.tsx`, `src/app/[appId]/funnels/page.tsx`,
  `src/app/[appId]/settings/page.tsx`, `src/components/ui/button.tsx`, `ui/input.tsx`,
  `ui/select.tsx`, `src/components/funnel-editor.tsx`, `src/components/explorer-controls.tsx`,
  `src/app/page.tsx`, `src/app/loading.tsx`

**Interfaces:**
- Consumes: `Wordmark` (Task 7), `KpiSkeleton`, `ChartSkeleton`, `TableSkeleton` (Tasks 4 to 6).
- Produces: `Panel` root carries `data-panel={title}` when `title` is a string (Task 10's layout-shift
  test uses it).

- [ ] **Step 1: Panel** — `Card` `gap-3`; title `text-sm font-semibold` (13 px); `data-panel`.

- [ ] **Step 2: Page frames** — the `main` of overview, events, funnels, settings, `/` and
  `app/loading.tsx`: `p-4 sm:p-5` (sign-in and privacy keep their own centered layout); overview/explorer/funnels grids `gap-3`;
  `PageBar` `mb-3`.

- [ ] **Step 3: Controls 30 px** — `ui/button` size `default` `h-7.5`, `icon` `size-7.5`;
  `ui/input` `h-7.5`; `ui/select` trigger `data-[size=default]:h-7.5`. Hand-written `selectClass`
  (funnel editor, explorer controls) and the settings select/textarea: `h-7.5` (textarea no height),
  `rounded-md border border-input bg-transparent px-2 text-base md:text-sm focus-visible:outline-none
  focus-visible:ring-2 focus-visible:ring-ring`; the funnel editor's `selectClass` keeps `min-w-0`.

- [ ] **Step 4: Explorer column skeleton** — add `data-testid="selection-column"` to the selection
  column wrapper (`events/page.tsx`, the `flex min-w-0 flex-col gap-4` div), measure it loaded at
  1440 px with the screenshot helper (`SCREENS_ELEMENTS=selection-column`) for
  `/demo/events?event=calendar_poll` and set the `BlockSkeleton` height to it (today `h-[460px]`).

- [ ] **Step 4b: Pre-measure the fixed-shape panels** (saves e2e runs in Task 10) — with the screenshot
  helper at 1440 and 390, log the `[data-panel] [data-slot="card-content"]` heights of Summary, Over
  time, Web vitals and Errors over time, loaded, and compare with the skeleton heights (render the
  fallbacks via a delayed page switch in the same helper spec or by reading the skeleton classes);
  fix differences > 4 px now.

- [ ] **Step 5: App list `/`** — `<Wordmark className="text-lg" />` above the `h1`; the "Loading…"
  fallback becomes three `Skeleton h-5 w-32` lines in `space-y-2`; app links
  `text-primary underline underline-offset-2`.

- [ ] **Step 6: Root `loading.tsx`** — shape of the overview frame: `p-4 sm:p-5`, a `h-8` bar line,
  `KpiSkeleton` (Summary shape) and `ChartSkeleton count={3} titles legend` inside `gap-3`.

- [ ] **Step 7: Run** `npm test && npm run lint && npm run typecheck && npm run build` — PASS. One
  screenshot run of overview, events, funnels, settings, `/` at 1440 and 390 (light) and compare with
  the "Middle · light" artboards.

- [ ] **Step 8: Commit** `git commit -m "feat(dashboard): Middle sizes, 30 px controls, restyled app list and loading page"`

---

### Task 10: Theme and layout-shift e2e, dark screenshots and full verification

**Files:**
- Create: `e2e/theme.spec.ts`, `e2e/layout-shift.spec.ts`
- Modify: `e2e/dashboard.spec.ts` (390 px checks in both themes; `/` in the hard-load list)
- Uses the screenshot helper as extended in Task 7 Step 7.

- [ ] **Step 1: `theme.spec.ts`** (test login as in `dashboard.spec.ts` where needed):
  - "head script sets the theme before any JS": cookie `rta-theme=dark` for localhost,
    `page.route("**/_next/static/chunks/**", r => r.abort())`, goto `/sign-in` → `<html>` has class
    `dark` and `data-theme-choice="dark"`.
  - "switch persists across reload": goto `/demo`, first `expect` "Dark" in group "Theme" to have
    `aria-pressed="false"` (the attribute only exists after hydration, so the click is not lost), click
    "Dark" → `<html>` class `dark`; reload → still `dark`, "Dark" `aria-pressed="true"`; click
    "System" → no `dark`/`light`. (Tests without data needs use `/sign-in`, which runs no query.)
  - "system follows the OS without JS": no cookie, `emulateMedia({ colorScheme: "light" })` then
    `"dark"` → `getComputedStyle(document.body).backgroundColor` differs between the two.
  - "dark overview has no console errors": cookie dark, collect `console` errors and `pageerror` on
    `/demo` until `kpi-pageviews` is visible → none.

- [ ] **Step 2: `layout-shift.spec.ts`** — for widths 1440 and 390: goto `/demo/events`, wait
  `networkidle`, `slowRsc(page, 2500)`, then navigate to the overview: at 1440 click "Overview" in nav
  "Pages"; at 390 click "Open menu" first and then "Overview" in the drawer (the aside is hidden on
  phones). For each fixed-shape panel (`[data-panel="Summary"]`, `"Over time"`, `"Web vitals"`,
  `"Errors over time"`) wait until it contains a `[data-testid="skeleton"]`, then read the height of
  its `[data-slot="card-content"]` (not the card: grid rows stretch cards to their table neighbour);
  wait until no skeleton is left (timeout 20 s), read again; assert `Math.abs(before - after) <= 4`
  per panel and print the offenders. Table panels have a variable row count and are not checked.
  Task 9 Step 4b already fixed the known differences; run this spec on its own at most twice.

- [ ] **Step 3: 390 px both themes** — the existing phone checks in `dashboard.spec.ts` (phone menu,
  funnel result) also run with cookie `rta-theme=dark`; add a loop over `/demo`, `/demo/events?event=calendar_poll`,
  `/demo/funnels?steps=place_selected&steps=subscribe_click` asserting no horizontal overflow at 390 px in light and dark. Add `/` to the
  hard-load "no Loading text" list.

- [ ] **Step 4: Screenshots** — light and dark, 1440 and 390, for overview, events, funnels; check by
  eye against the "Middle" artboards (light and dark neutral).

- [ ] **Step 5: Manual dev check** — `npm run dev`, open `/demo` with the browser console open (via
  the Playwright/Chrome MCP), confirm no React warning about the head `<script>`; stop the dev server.
  If the warning shows, switch to `next/script` with `strategy="beforeInteractive"` and the same
  `themeScript` in the root layout, and re-run the "head script" e2e.

- [ ] **Step 6: Full verification** — `npm run lint && npm run typecheck && npm test && npm run build &&
  npx playwright test` (full suite once). Expected: all green; report counts.

- [ ] **Step 7: Commit** `git commit -m "test(dashboard): theme and layout-shift e2e, both themes at 390 px"`

- [ ] **Step 8: Final review** — one fresh reviewer agent on the whole branch against the spec; fix
  findings; re-run the affected checks.
