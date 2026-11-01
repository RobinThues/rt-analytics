# Backlog

## Now

- [ ] **Give the alerts a reliable trigger**: the job works when started by hand, but GitHub's schedule has never started it. Proposal: Cloud Scheduler starts the workflow every 15 minutes through the API. Why: alerts don't run on their own until then, and the first public wetter-in-kalender Short is on 2026-11-09. See the [handoff](handoffs/launch-package.md). (me)

## Next

- [ ] **Delete events after 14 months**: set partition expiration on `analytics.events` (also in `setup:gcp`) and name the fixed period in the wetter-in-kalender privacy text. Why: the table has no expiration today, so rows stay forever. (me)

## Later

## Icebox

- [ ] **Fix the Next.js `new Date()` warning in the app layout**: `[appId]/layout.tsx` calls `listApps()` next to `requireUser()`, so the clock is read before any request data, and `next start` logs "unstable value `new Date()` while prerendering". Why: pages work, but the log noise can hide real errors, and e2e can't see it because it uses a fixed today. (claude)
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
- [ ] **Weekly digest, and alerts for the other apps**: one email with a table of apps, a falling step rate, and alert values for the apps with little traffic. Alerts for wetter-in-kalender are in the launch package. Why: the other apps have no alerts, and nothing sums up a week. (claude)
- [ ] **Resend for alert emails**: create an account and set `RESEND_API_KEY`, `ALERT_EMAIL_TO` and `ALERT_EMAIL_FROM` as repo secrets. Why: until then the alert is GitHub's "run failed" email, with no numbers and no message when a problem ends. (me)
- [ ] **All-apps start page**: trend, errors, last event and SDK version per app. Why: there is no overview across apps, and SDK lag in an app stays unseen. (claude)
- [ ] **Local CLI and MCP server**: read-only access on the dashboard's query builders, plus MCP Toolbox for free SQL with a byte cap. Why: agents write one-off BigQuery scripts in several projects. (claude)
- [ ] **Fewer overview queries**: one query per page, skip server events, and keep the cache across deploys. Why: each job bills at least 10 MB, and scans grow as the 58-day window fills. (claude)
- [ ] **Fewer heartbeat rows**: store far fewer `calendar_poll` rows per subscription, and design it with active ids. Why: it is the largest share of rows, and active counts don't need them all. (claude)
- [ ] **Clean test data**: an off switch for server events and one clean-up command. Why: several projects delete test rows by hand, because the ignore cookie can't reach server events. (claude)
- [ ] **Rotate the daily salt once**: after checking that every app has its own pseudonym key. Why: it cuts the link from past rows back to an IP and browser. (claude)
- [ ] **Active ids and retention on any prop**: active per day, 7 and 28 days, new per day, retention by first day, split by another prop. Why: active subscriptions are the main wetter-in-kalender metric and need hand-written SQL, and installed software needs the same metric. (claude)
- [ ] **Saved metrics**: pin an explorer view or funnel as a KPI on the overview and in the digest. Why: app-specific metrics live in SQL files in each app repo. (claude)
- [ ] **Better errors in the SDK**: per-session cap and dedupe, short stack, app version, scrubbed text. Why: a few sessions can write over a thousand rows, and errors have no stack or version. (claude)
- [ ] **Collect less without consent, and correct the consent wording**: drop viewport, cut referrer query strings, and replace the README's "banner is optional" sentence. Why: German authorities and the EDPB read device access more widely than the README says. (claude)
- [ ] **Retention per data type**: stable pseudonyms kept shorter than page rows, with daily aggregates kept. Why: 14 months of row data is hard to defend for stable ids, and partition expiry is one setting for the whole table. Check this before the "Delete events after 14 months" item. (claude)
- [ ] **Annotations and version markers on charts**: manual notes in `dashboard_config`, plus markers from `app_version` first seen. Why: spikes and drops need an explanation next to the chart. (claude)
- [ ] **Correct the README's native client claim**: the ingest drops most non-browser user agents and answers 202. Why: the README says Go, mobile and CLI clients can POST directly, and their events are silently lost. (claude)
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
- [x] **Social and in-app sources, failure events, Linear/Log switch, goals per source**: SDK 0.6.0, live 2026-10-31, [spec](superpowers/specs/2026-10-31-launch-package-design.md).

## Rejected

- ~~**Filter own traffic by IP**~~: German ISPs rotate IPs daily.
- ~~**Looker Studio dashboard**~~: it has no API, so it can't be built in a reproducible way.
- ~~**Sankey funnel chart**~~: Robin picked a left-to-right funnel chart.
- ~~**SaaS card kits (Tremor, shadcn blocks)**~~: they don't fit the flat, dense style Robin wants.
- ~~**Capped y-axis for traffic spikes**~~: a peak that falls over several days clips the latest days, see the Linear/Log switch.
- ~~**More built-in events in the funnel builder**~~: Robin dropped it on 2026-10-31. `$pageview` is already there with a `path` filter.
