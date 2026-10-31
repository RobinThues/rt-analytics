# Decisions

Entries up to 2026-10-27 were collected on 2026-10-31 from the specs and working notes, so they are summaries written after the fact. Robin did not review them line by line, and where a source gave no reason, the Why line is Claude's reading. The linked specs have the detail.

## 2026-07-11: Build our own analytics on BigQuery

Decided by: Robin
Decision: Build the whole library ourselves and store all apps in one shared BigQuery dataset and table.
Why: Learning and ownership were explicit goals, and the running cost must stay at $0 at hobby scale.
Rejected: Reusing an existing analytics tool, with no specific tools recorded.
Spec: [design](superpowers/specs/2026-07-11-rt-analytics-design.md)

## 2026-07-11: Ingest inside each app with the Storage Write API

Decided by: both
Decision: Each app deploys a same-origin route handler from the library, and it writes directly to BigQuery with the Storage Write API.
Why: This stays in the Vercel free tier, and the Storage Write API includes 2 TiB per month for free.
Rejected: Legacy `insertAll`, because it is paid. A queue or buffer between Vercel and BigQuery, because it adds infrastructure that hobby traffic doesn't need.

## 2026-07-11: Visitor identity depends on consent

Decided by: both
Decision: Use a cookieless daily hash before or without consent, and a persistent localStorage id only after consent.
Why: Apps can count visitors without storing anything in the browser, and they get returning visitors only with consent.
Rejected: Fingerprinting (ruled out again for the dashboard on 2026-10-13).

## 2026-10-12: Exclude own traffic with a secret link and cookie

Decided by: both
Decision: A secret link sets an ignore cookie, and the ingest route drops batches that carry it. Normal visitors get nothing stored.
Why: It works on any network and is built as a package option, so every app can use it.
Rejected: IP filtering, because German ISPs rotate IPs daily.
Spec: [0.2.0 design](superpowers/specs/2026-10-12-rt-analytics-0.2.0-design.md)

## 2026-10-12: Fresh start for wetter-in-kalender data

Decided by: Robin
Decision: Delete all rows from before the verified ignore cookie cutoff, not only the known test rows.
Why: The numbers should be clean from the first day of real measurement.
Rejected: Deleting only the known test rows, because other own visits would stay in the data.

## 2026-10-13: Publish through GitHub Actions trusted publishing

Decided by: both
Decision: Releases run in `.github/workflows/release.yml` when a version tag is pushed, with provenance.
Why: Publishing by hand needed a real terminal and 2FA, so an agent could not finish a release.
Rejected: Publishing from a local machine, which is how 0.1.0 was released.

## 2026-10-13: Own Next.js dashboard, generic for all apps

Decided by: Robin
Decision: Build a multi-app Next.js dashboard on Vercel with no app-specific code. Built-in `$` events get fixed panels, and app events and props are discovered from the data.
Why: It can be built and changed in a reproducible way, and it could become self-hostable later without a rewrite.
Rejected: Looker Studio. It is free and quick, but it has no API, so it can't be built reproducibly.
Spec: [dashboard design](superpowers/specs/2026-10-14-dashboard-design.md)

## 2026-10-13: Query BigQuery directly, with a cache and a byte cap

Decided by: both
Decision: Pages query BigQuery directly through a cache with a TTL. There is a per-user "Live" toggle, a "Refresh" for everyone, and `maximumBytesBilled` on each query.
Why: It needs no extra infrastructure, and the cap and quotas protect the budget.
Rejected: Precomputed daily aggregates for now. They stay a v2 item, only if bytes scanned or load times grow.

## 2026-10-13: Google sign-in with an allowlist and keyless GCP access

Decided by: both
Decision: Google OAuth with an email allowlist. The dashboard reaches GCP through Vercel OIDC and Workload Identity Federation.
Why: v1 is for Robin only, and no service account key has to be stored for the dashboard.
Rejected: None recorded.

## 2026-10-13: Demo data lives in the real table

Decided by: both
Decision: Demo rows use `app_id = 'demo'` in the real `analytics.events` table. Maintenance SQL that works by date or app must filter by `app_id`.
Why: The dashboard is built and tested against the same schema and queries as production.
Rejected: None recorded.

## 2026-10-13: Move to an npm workspaces monorepo

Decided by: both
Decision: `packages/rt-analytics`, `apps/dashboard` and `apps/demo` are npm workspaces, with `sql/` at the root.
Why: The dashboard imports types from the library, and the demo app is the integration reference.
Rejected: None recorded.

## 2026-10-14: TypeScript 6.0 for the repo

Decided by: Robin
Decision: The repo uses TypeScript 6.0 and goes back to 7 when `typescript-eslint` supports it.
Why: `typescript-eslint` doesn't support TypeScript 7 yet.
Rejected: TypeScript 7 now, because linting would break.

## 2026-10-17: Dashboard layout

Decided by: Robin
Decision: Sidebar with the app switcher at the top, a range picker that applies directly (presets 7, 28, 90 and a two-click calendar), a left-to-right funnel chart, skeletons on page or app switch, and dimmed old numbers on changes within a page.
Why: Robin picked these from mockups.
Rejected: Sankey funnel chart.
Spec: [layout design](superpowers/specs/2026-10-16-dashboard-layout-design.md)

## 2026-10-17: Visual style

Decided by: Robin
Decision: A mix of flat ops tools and calm web analytics (Grafana with Plausible or Umami). No box inside a box, violet brand color used quietly and never in charts, neutral dark mode with a system, light and dark switch, 6 px panels and 4 px controls, skeletons and no spinners.
Why: Robin likes the simplicity and density of the existing dashboard and picked the final look from a mockup.
Rejected: SaaS card kits (Tremor, shadcn blocks). Green, lime and amber as brand colors, because they read as good or bad.
Spec: [visual style design](superpowers/specs/2026-10-17-dashboard-visual-style-design.md)

## 2026-10-19: E2E tests replay recorded BigQuery results

Decided by: both
Decision: E2E runs replay recorded fixtures by default, only `@bq` tests use real BigQuery, and local runs use a dev service account with a 10 GiB per-user daily quota.
Why: A full day of runs reached the 30 GiB project quota, which production needs too. A full real run took 138 jobs and 1.36 GiB. Replay now uses 0, and `@bq` about 0.38 GiB.
Rejected: Running the full suite against real BigQuery.
Spec: [e2e cost design](superpowers/specs/2026-10-19-e2e-bigquery-cost-design.md)

## 2026-10-27: Hourly charts use wall-clock hour buckets

Decided by: Claude
Decision: Hourly charts bucket by wall-clock hour in the app timezone, and the previous period is aligned by wall clock. Daily SQL stays byte-identical, so daily cache keys and fixtures don't change.
Why: A review showed that the previous period drifts by 1 hour after a DST change with elapsed-hour buckets.
Rejected: Elapsed-hour buckets, which were the first draft.
Spec: [hourly charts design](superpowers/specs/2026-10-27-hourly-charts-design.md)
