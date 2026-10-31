# Backlog

## Now

- [ ] **Tell social and in-app visits apart**: source falls back to `utm_source`, plus in-app detection and a host-to-platform map. Why: TikTok and Instagram visits show as "direct", and the numbers should be clean before the first public wetter-in-kalender Short on 2026-11-09. Details: [todo](todo/2026-10-24-social-referrals.md). (me)

## Next

- [ ] **Delete events after 14 months**: set partition expiration on `analytics.events` (also in `setup:gcp`) and name the fixed period in the wetter-in-kalender privacy text. Why: the table has no expiration today, so rows stay forever. (me)

## Later

## Icebox

- [ ] **Own domain for the dashboard**: move it to `analytics.thues.eu`. Why: it still runs on `rt-analytics-dashboard.vercel.app`, and the plan was to move once it is stable. (me)
- [ ] **Try the consent banner on wetter-in-kalender**: use the library's banner and update the privacy text. Why: the site is cookieless today, so it has no persistent visitor data for returning visitors, retention or person funnels. (me)
- [ ] **Dashboard v2**: person funnels, "seen on N days", identity stitching, week and month uniques, funnel editing, preview sign-in, FCP and TTFB, more filters, daily aggregates, self-hosting. Why: defined but not built in v1, see [section 13 of the spec](superpowers/specs/2026-10-14-dashboard-design.md). (me)
- [ ] **Red and green KPI changes**: needs a "higher is better or worse" setting per metric. Why: the neutral arrows don't show if a change is good. Needs its own small design. (me)
- [ ] **Test `identify()` with a login app**: integrate an app that has Firebase auth. Why: no app uses `identify()` yet, so it has only been tested in unit tests. (me)
- [ ] **Brand the README, social image and demo app**: use the wordmark and violet there too. Why: the visual style work only covered the dashboard. (me)
- [ ] **Move the ingest writer to OIDC**: replace `ANALYTICS_GCP_CREDENTIALS` in the ingest path. Why: it is the last service account key in use. (claude)
- [ ] **Back to TypeScript 7**: leave 6.0 when `typescript-eslint` supports it. Why: the repo stays on 6.0 only because of that gap. (claude)
- [ ] **Node 26 LTS for the apps**: upgrade when Vercel supports it. Why: from the dashboard spec follow-ups. (claude)
- [ ] **Remove the zod override**: drop the root `overrides` entry once `@vercel/cli-config` allows zod 4.6.6 or newer. Why: it pins 4.1.11 today, and the override only exists for the audit fix. (claude)
- [ ] **Cap `PREV_END` at `prev_to_ts`**: fixes `npm run e2e:record` changing old fixtures, because live demo events after the fixed today count as "prev". Why: e2e only, but it changes all SQL, so it needs a full re-record. (claude)
- [ ] **E2E recording minors**: a refused recording doesn't fail `e2e:record`, a failed recording leaves the fixtures deleted (`git restore` fixes it), demo-b empty states are only partly tested, and the per-user quota flag accepts fractions. Why: open from the 2026-10-19 final review. (claude)
- [ ] **Remove the calendar poll agent log in wetter-in-kalender**: check the "unknown app" lines in the Vercel logs, confirm the patterns in `calendar-client.ts`, then remove the log. Why: the code says to remove it once the patterns are confirmed. (claude)
- [ ] **Show first subscription numbers**: run `docs/analytics/*.sql` in the wetter-in-kalender repo. Why: planned for about two weeks after 2026-10-13, and I found no record of it. (claude)
- [ ] **Check background revalidation with OIDC**: look at the runtime logs when a page is reopened more than 1 hour after the first load (Hobby keeps logs for 30 minutes). Why: normal production queries work, but this case was never observed. (claude)

## Done

- [x] **Exclude own traffic and harden the ingest route**: released in 0.2.0, [spec](superpowers/specs/2026-10-12-rt-analytics-0.2.0-design.md).
- [x] **Fresh start of wetter-in-kalender data**: rows from before the cutoff deleted, first row in the table is now from 2026-10-13.
- [x] **Rate limit on the ingest route**: the Vercel firewall rule on wetter-in-kalender moved from log mode to rate limit (120 per 60 s).
- [x] **Dashboard v1 (overview, explorer, funnels)**: [spec](superpowers/specs/2026-10-14-dashboard-design.md).
- [x] **Dashboard layout**: [spec](superpowers/specs/2026-10-16-dashboard-layout-design.md).
- [x] **Dashboard visual style and dark mode**: [spec](superpowers/specs/2026-10-17-dashboard-visual-style-design.md).
- [x] **Cheaper e2e on BigQuery**: [spec](superpowers/specs/2026-10-19-e2e-bigquery-cost-design.md).
- [x] **Hourly charts**: [spec](superpowers/specs/2026-10-27-hourly-charts-design.md).

## Rejected

- ~~**Filter own traffic by IP**~~: German ISPs rotate IPs daily.
- ~~**Looker Studio dashboard**~~: it has no API, so it can't be built in a reproducible way.
- ~~**Sankey funnel chart**~~: Robin picked a left-to-right funnel chart.
- ~~**SaaS card kits (Tremor, shadcn blocks)**~~: they don't fit the flat, dense style Robin wants.
