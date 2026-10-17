# rt-analytics dashboard: visual style, brand and dark mode

**Status:** agreed with Robin on 2026-10-17 (grilling session, then picks from a mockup canvas).
Reviewed once by a fresh agent; its findings are worked in. Builds on the v1 dashboard
(`docs/superpowers/specs/2026-10-14-dashboard-design.md`, the "v1 spec") and the layout redesign
(`docs/superpowers/specs/2026-10-16-dashboard-layout-design.md`, the "layout spec"), both live on main
ee6b386.

Mockup canvas (private artifact, Robin's account): https://claude.ai/artifact/Y4i79mbqTBrUoAngCBAT4t.
The chosen artboards are "Middle · light", "Middle · dark neutral", "Middle · phone", the 6 px column
of "Radius" and the "True violet" cells of "Brand".

## Why

The layout redesign kept shadcn's stock look on purpose: neutral grays, 10 to 14 px corners and
cards. Robin likes the simplicity and information density, but not the rounded boxes inside rounded
boxes (KPI tiles inside the Summary card). The dashboard also has no identity of its own and no dark
mode.

Robin's references: he likes Datadog (work) and Grafana, Plausible and Umami. He dislikes
Optimizely because its frontend feels unreliable (things jump around), and polished SaaS card kits
(Tremor, shadcn blocks) because of the nested card look.

## Goals

- One visual style for every page: flat and fairly dense like an ops tool, calm like Plausible.
- No box inside a box anywhere.
- A quiet color identity for rt-analytics: a violet brand color, a mark and a wordmark.
- Dark mode that follows the system, with a manual switch.

## Non-goals

- Changes to the layout (layout spec), queries, metrics or caching.
- A new font. Geist stays.
- A new chart library. Recharts stays.
- Red/green coloring of KPI changes (later, see "Later").
- The identity outside the dashboard: npm README, GitHub social image, `apps/demo` (later).

## Anti-goals (would make this a failure even if it looks good)

- Layout shift: a panel whose skeleton has a different height than its loaded content (more than
  4 px, see Testing), digits that change width while numbers update, columns that jump.
- Spinners. Loading stays skeletons, dimming and the progress line (layout spec).
- A flash of the wrong theme on page load.
- The brand color used as a data color, or any color that reads as "good" or "bad" (green, lime,
  amber) used for identity.
- Horizontal page scroll at 390 px (layout spec rule stays).

## Decided with Robin

### Style: the "Middle" variant

Calm's look with tighter spacing. Today's page is close to it in size. Target sizes:

| Element | Middle | Today |
| --- | --- | --- |
| Body text (`text-sm`) | 13 px | 14 px |
| KPI value | 24 px, semibold, tabular | 24 px |
| KPI label, small text (`text-xs`) | 12 px | 14 / 12 px |
| Panel title | 13 px semibold, normal case | 16 px |
| Page padding | 20 px from `sm`, 16 px on phones | 24 / 16 px |
| Gap between panels | 12 px | 16 px |
| Padding inside panels | 16 px | 16 px |
| Table row height | about 30 px | about 37 px |
| Buttons, inputs, selects | 30 px high | 32 px (settings: 36 px) |
| Sidebar width | 208 px | 224 px |
| Breakdown tables per row (desktop) | 2 | 2 |

- Body text: redefine `--text-sm` as 13 px (with a matching line height) in `@theme`. The root font
  size stays 16 px, so rem-based spacing does not shrink.
- Inputs and native selects stay 16 px below `md` (as `ui/input.tsx` does today), so iOS Safari does
  not zoom on focus.
- The phone drawer keeps its width.
- The other values are targets. The plan may round them to the nearest Tailwind step where that does
  not change the look.

### Boxes and corners

- Panels stay boxes: `--card` background, a 1 px `border-border` (replacing Card's
  `ring-1 ring-foreground/10`), **6 px** radius, no shadow.
- The radius scale is set explicitly in `@theme inline`, not derived from `--radius`:
  `--radius-sm: 2px; --radius-md: 4px; --radius-lg: 4px; --radius-xl: 6px`. Card keeps
  `rounded-xl` (6 px). Buttons, inputs, selects, popovers, tooltips, sidebar items and skeletons
  (`rounded-md` / `rounded-lg`) come out at 4 px. Small buttons' `rounded-[min(var(--radius-md),…)]`
  follows. Badge stays a pill.
- Hand-written controls get the same 4 px and 30 px height: `selectClass` in
  `components/funnel-editor.tsx` and `components/explorer-controls.tsx`, and the input and textarea
  in `app/[appId]/settings/page.tsx`.
- Nothing with a border or a radius sits inside a panel. Allowed exceptions: controls, tooltips,
  skeletons, row bars (below), chart marks (funnel bars, funnel chips) and the funnel result bars.
  The KPI tiles lose their border.

### KPI row

- One component, `KpiRow`, holds the numbers as plain cells split by thin lines, with no outer box per
  number. Lines go between columns and between rows, never around the outside. A row with one cell
  has no lines.
- Column counts per place:
  - Summary (overview): 2 on phones, 3 from `sm`, 6 from `lg` (as today).
  - Web vitals (overview quality panel): 3.
  - People (overview) and the explorer's metric total: a single cell.
- Which edges get a line is decided by a pure function of the cell index, the cell count and the
  column count, called once per breakpoint, so it can be unit-tested.
- The change line: a neutral arrow and the rounded percent with a no-break space before `%`, for
  example `▲ 13 %` or `▼ 26 %`, then "vs previous period" in muted text. `0 %` and `new` stay as
  they are. The arrow is a fixed-width inline SVG with `aria-hidden`, followed by sr-only text "up"
  or "down", so it does not depend on the font having ▲/▼ and does not break tabular columns. Arrows
  are in the normal text color, never green or red.
- The same change display is used in table change columns (breakdowns, event list, explorer
  breakdown). Tests that assert today's `+13 %` format change with it (`lib/format.test.ts`,
  `components/kpi-tile.test.tsx`, `components/breakdown-table.test.tsx` and any e2e text checks).

### Tables

- Breakdown-style tables get a light bar behind the label cell: overview breakdowns, the explorer's
  event list and its property breakdown. The bar's width is the row's pageviews (or count) as a share
  of the top row's. Color `--chart-bar`, 2 px radius, inset 3 px from the row's top and bottom.
- No bar for: "Other" (stays last and muted), any row when the top row is 0, and the tables of slow
  pages, top errors, consent, retention and saved funnels.
- The funnel result keeps its own bars, with 2 px corners instead of `rounded-full`.
- Header row: muted, 12 px, hairline under it. Row lines use `--row-line`, one step closer to the
  panel color than the border: `oklch(0.94 0 0)` light, `oklch(0.245 0 0)` dark.
- Numbers right-aligned, tabular. Tables use `table-layout: fixed` with fixed widths for the number
  columns, so values do not shift and the label cell's width is known for the bar.

### Charts

- Data colors stay exactly as today: current period `--chart-current` (blue `#2a78d6` light,
  `#3987e5` dark), previous period `--chart-previous` (`#8f8e88`), dashed.
- A light area fill under the current line, color `--chart-area`.
- Lighter grid lines (`--row-line`), axis text 11 px muted and tabular.
- TrendChart gets a `legend` option (default on). The overview's "Over time" panel turns it off for
  its three charts and shows one legend line above them, inside the data part (where `compare` is
  known): "This period", plus "Previous period" only when compare is on. "Errors over time" and the
  explorer chart keep their own legend. Labels and tooltips keep today's wording.
- Chart height about 160 px including axes (today 192 px).
- Tooltips use `bg-popover` (today `bg-background`, which becomes the gray page color). The funnel
  chart's chips use `var(--card)`.
- The funnel chart keeps its colors (current blue, previous gray, drop-off bands in muted).

### Brand color

- **True violet**, oklch hue 300: `oklch(0.52 0.2 300)` in light mode, `oklch(0.74 0.15 300)` in dark
  mode. Text on violet: white in light mode, `oklch(0.18 0.03 300)` in dark mode.
- A soft variant for selected backgrounds: `oklch(0.95 0.035 300)` light, `oklch(0.3 0.07 300)` dark.
- Used quietly, only for:
  - the mark;
  - the active sidebar item (`bg-sidebar-accent text-sidebar-accent-foreground`, semibold);
  - primary buttons (shadcn `default` variant: sign in, save funnel, settings save);
  - focus rings: 2 px, full-opacity `--ring` (violet), so they reach 3:1 against white and the dark
    panels;
  - links: the privacy page's mailto, the settings back link, the app list on `/`, and the
    underlined "Retry" button in query errors (`components/retry-button.tsx`). Event names in the event list stay in the text color, since they
    are a data column;
  - the range picker: the selected preset and the selected days in the calendar;
  - the native Compare checkbox (`accent-color: var(--primary)`);
  - the "Live" badge (soft violet background, violet text);
  - the progress line (today data blue).
- Never for: surfaces (page, panels, sidebar), charts or data, KPI changes, errors.
- Red (`--destructive`) stays reserved for real errors: sign-in errors, the credentials banner, form
  errors, query errors.

### Range picker selected preset (new behavior)

A preset button is selected (`aria-pressed="true"`, soft violet) when the current range ends today and
is exactly that many days long. Otherwise no preset is selected. The calendar shows the selected range
(both ends and the days between) in violet, not only a clicked start day.

### Mark, wordmark and favicon

- Mark: **rising bars** (three bars of growing height, violet), as an inline SVG component.
- Wordmark: the mark plus `rt-analytics` in lowercase Geist semibold, normal text color (no violet
  in the text).
- Places:
  - Desktop sidebar: in the aside's static part above the app switcher, outside the Suspense that waits
    for the user and the app list, so it shows at once. The sidebar skeleton keeps its space below it.
  - Phone drawer: in the top space next to the close button.
  - Phone top bar: the mark only (`md:hidden`), next to the menu button.
  - Sign-in page heading and the app list page `/`.
- Favicon: the mark as `app/icon.svg` (Next.js file convention). `app/favicon.ico` (Next's default
  icon) is deleted. The proxy matcher (`src/proxy.ts`) must exclude `icon.svg`, or signed-out visitors
  get a redirect instead of the icon; a proxy test covers it.
- The unused "rt" monogram option is kept outside the repo for Robin's other projects
  (`~/.claude-helpers/brand-assets/rt-monogram.svg`).

### Color tokens

Neutral grays, no tint in either mode. Every token is written once in `globals.css` with
`light-dark(<light>, <dark>)`. `color-scheme` decides which side applies (see Dark mode), so there is
no second dark block. The `--sidebar-*` tokens are used from now on: the aside and the phone drawer use
`bg-sidebar` (today `bg-muted/30` and `bg-popover`).

| Token | Light | Dark |
| --- | --- | --- |
| `--background` (page) | `oklch(0.97 0 0)` | `oklch(0.155 0 0)` |
| `--card`, `--popover` | `oklch(1 0 0)` | `oklch(0.195 0 0)` |
| `--foreground`, `--card-foreground`, `--popover-foreground` | `oklch(0.2 0 0)` | `oklch(0.95 0 0)` |
| `--muted-foreground` | `oklch(0.5 0 0)` | `oklch(0.71 0 0)` |
| `--muted`, `--secondary`, `--accent` (hover, skeletons, select item focus) | `oklch(0.945 0 0)` | `oklch(0.27 0 0)` |
| `--secondary-foreground`, `--accent-foreground` | `oklch(0.2 0 0)` | `oklch(0.95 0 0)` |
| `--border`, `--input`, `--sidebar-border` | `oklch(0.9 0 0)` | `oklch(0.28 0 0)` |
| `--row-line` (new) | `oklch(0.94 0 0)` | `oklch(0.245 0 0)` |
| `--primary`, `--ring`, `--sidebar-primary`, `--sidebar-ring` | `oklch(0.52 0.2 300)` | `oklch(0.74 0.15 300)` |
| `--primary-foreground`, `--sidebar-primary-foreground` | `oklch(1 0 0)` | `oklch(0.18 0.03 300)` |
| `--sidebar` | `oklch(1 0 0)` | `oklch(0.175 0 0)` |
| `--sidebar-foreground` | `oklch(0.2 0 0)` | `oklch(0.95 0 0)` |
| `--sidebar-accent` (active item, Live badge, selected preset) | `oklch(0.95 0.035 300)` | `oklch(0.3 0.07 300)` |
| `--sidebar-accent-foreground` | `oklch(0.52 0.2 300)` | `oklch(0.74 0.15 300)` |
| `--destructive` | as today | as today's dark value |
| `--chart-current` | `#2a78d6` | `#3987e5` |
| `--chart-previous` | `#8f8e88` | `#8f8e88` |
| `--chart-bar` (new) | `color-mix(in oklab, var(--chart-current) 11%, transparent)` | same formula, 18 % |
| `--chart-area` (new) | `color-mix(in oklab, var(--chart-current) 9%, transparent)` | same formula, 14 % |

The new tokens are registered in `@theme inline` (`--color-row-line`, `--color-chart-bar`,
`--color-chart-area`). `--chart-1` to `--chart-5` stay unused and unchanged. Body and muted text must
reach at least 4.5:1 on panels and on the page in both modes; the plan checks it with a small contrast
script.

### Dark mode

- Default: follow the system (`prefers-color-scheme`).
- A switch in the sidebar footer, above the email: a three-part segmented control "System / Light /
  Dark". It is also in the phone drawer (the drawer renders the same sidebar).
- The choice is stored in a cookie `rta-theme` (`system`, `light` or `dark`; path `/`, one year,
  `SameSite=Lax`, `Secure` on https). Changing it updates the page at once, with no reload. During the
  change, transitions are turned off for one frame, so not every control animates.
- No flash: the root layout renders an explicit `<head>` whose first child is
  `<script dangerouslySetInnerHTML={{ __html: themeScript }} />`. The script runs before first paint,
  reads the cookie and:
  - adds `dark` or `light` to `<html>` with `classList.add` (nothing for `system`), keeping the
    existing font and layout classes;
  - sets `data-theme-choice="system|light|dark"` on `<html>`.
  The server does not read the cookie, so `cacheComponents` and static pages are unaffected. `<html>`
  gets `suppressHydrationWarning`.
- `themeScript` is a string constant built in its own module, so it can be unit-tested by evaluating
  it against a fake `document`.
- CSS:
  - `:root { color-scheme: light dark }`, `:root.light { color-scheme: light }`,
    `:root.dark { color-scheme: dark }`. This drives `light-dark()` and makes native selects,
    checkboxes and scrollbars follow the theme.
  - Tailwind's `dark:` variant (used inside shadcn components) follows the same rule:
    `@custom-variant dark { &:where(.dark, .dark *) { @slot; } @media (prefers-color-scheme: dark) { &:where(:root:not(.light), :root:not(.light) *) { @slot; } } }`
    (replacing today's `(&:is(.dark *))`).
- The switch's state comes from one small theme store (cookie plus `<html>` attributes) read with
  `useSyncExternalStore`, so the sidebar and the drawer copy stay in sync. The selected segment is
  styled from `data-theme-choice` on `<html>` with CSS, so it is right from the first paint and
  nothing jumps at hydration; `aria-pressed` follows the store after hydration.
- The sign-in, privacy and app list pages follow the theme too (no switch; cookie or system setting).

### Numbers and loading

- Tabular figures wherever numbers can change: KPIs, tables, chart axes, tooltips, the funnel.
- Skeletons have the height of what they stand for at the new sizes. Per panel:
  - Summary: a `KpiRow`-shaped skeleton (2/3/6 columns) plus the coverage line.
  - Over time: the legend line plus three charts with their titles.
  - Breakdowns, slow pages, top errors, consent, retention: table skeletons at the new row height
    with the panel's row count.
  - Web vitals: a 3-cell `KpiRow` skeleton (today it wrongly uses a 5-row table skeleton).
  - Errors over time and the explorer chart: one chart at the new height (today `ChartSkeleton`
    defaults to 220 px against a 192 px chart).
  - Explorer: the fixed `h-[460px]` column is re-measured against its new content.
  - The root `app/loading.tsx` and the app list on `/` (today "Loading…") use the new skeleton
    shapes.
- No spinners anywhere. Dimming and the progress line stay as in the layout spec.

### Other pages

Explorer, funnels, settings, sign-in, privacy and the app list `/` get the same tokens, panels, radius,
table style and brand use. They get no mockup round of their own. The range picker changes only as
described above (4 px radius, selected preset, violet selected days); the rest of its look follows the
tokens.

## Testing

- Unit:
  - `themeScript` against a fake `document` (no cookie, each value, a garbage value → system).
  - The theme store and switch: writes the cookie, updates `<html>` class and `data-theme-choice`,
    two switch instances stay in sync.
  - The change display (arrow, sr-only text, no-break space, `0 %`, `new`).
  - The `KpiRow` edge function for 1, 3 and 6 cells at 2, 3 and 6 columns.
  - Row bar widths: share of the top row, no bar for "Other" or a zero top row.
  - The selected preset rule (ends today and N days long; otherwise none).
  - The proxy excludes `/icon.svg`.
- E2E (Playwright, against `next start`):
  - With `rta-theme=dark` set and `/_next/static/chunks/**` aborted, the loaded page's `<html>` has
    class `dark` and `data-theme-choice="dark"` (the script works before any JS bundle).
  - The theme switch persists across a reload.
  - Dark mode renders the overview without console errors.
  - The 390 px no-horizontal-scroll check stays green in both themes.
  - Layout shift: on the overview at 1440 and 390 px, with a custom range that is not cached, each
    panel's height while its skeleton shows differs from its loaded height by at most 4 px. Runs only
    in the final full e2e run (BigQuery cost).
- Manual: one `next dev` load with the console open, to catch React's dev-only warning about the
  head script.
- Screenshots of overview, explorer and funnels in light and dark at 1440 and 390 px with the
  screenshot helper, for Robin's review.
- BigQuery cost: during the work use the screenshot helper on a few pages; run the full e2e suite once
  at the end (a full day of runs hit the 30 GiB daily quota before).

## Later (not in this work)

- Red/green KPI changes. Needs a per-metric "higher is better / worse" setting (a rising bounce rate is
  bad, rising visitors are good). Its own small design task.
- The identity outside the dashboard: npm README, GitHub social image, `apps/demo`.
