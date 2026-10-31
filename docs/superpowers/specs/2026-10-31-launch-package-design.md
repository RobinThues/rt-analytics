# Launch package: sources, failure events, alerts, log scale, goals

Date: 2026-10-31. Robin approved the scope (backlog items 1 to 5 from that day's review) and was away during the
build, so the details below are Claude's decisions. Target: live before the first public wetter-in-kalender Short
on 2026-11-09.

## 1. Social and in-app sources

SDK: the ingest handler stores a new nullable `in_app` column (instagram, tiktok, facebook, ...), detected from the
user agent. The raw user agent stays unstored. The column must exist before an app runs the new SDK.

Dashboard: one `sourceExpr()` used by the Sources panel and by goals:

1. An external referrer host, mapped to a platform name when known (`l.instagram.com` to instagram).
2. Else `utm_source`, lowercased and mapped the same way (`ig` to instagram).
3. Else `in_app`.
4. Else `direct`.

The referrer stays first because that is what the todo agreed, and for tagged social links both give the same
answer. Steps 1 and 2 are SQL, so they also correct old rows in every app, with no bump. `sessionsCte()` only reads
`in_app` when a query asks for it, so all other SQL stays the same.

## 2. Failure events

SDK: `withFailureEvents({ tracker, route, schedule }, handler)` wraps a route handler. A response with status 500 or
higher, or a thrown error, writes a `$route_failure` server event with `{ route, status, count }`. The error is
rethrown.

Writes are limited per instance, route and status to one per 10 seconds, and `count` carries the failures since the
last write. Without this limit, an outage like the 8,400 failed searches of 2026-10-27 would also mean 8,400 BigQuery
writes on a Vercel team near its limits. Readers must use `SUM(count)`, not `COUNT(*)`. The failures that come after
the last write of an instance can be lost, which is accepted.

Rows hold no visitor data, no URL and no error text, so nothing personal can leak in.

Dashboard: a "Failed routes" panel in the quality group. `$` events stay out of the explorer.

wetter-in-kalender wraps `/api/geocode`, `/api/cal` and `/api/location`. Only 5xx counts: `/api/location` answers 404
when ipapi refuses, and that stays uncounted on purpose, because prefilling a place is optional.

## 3. Alerts

A GitHub Actions job runs `scripts/alerts/run.ts` every 15 minutes, for wetter-in-kalender only at first. Other apps
have traffic too low for these rules and get their own values later.

Rules, on the last 60 minutes against the same 60 minutes on each of the previous 7 days (median). The median ignores
a single past spike:

| Rule | Fires when |
|---|---|
| `error_share` | Share of sessions with an error is high, with a minimum number of error sessions |
| `route_failures` | `SUM(count)` per route passes a minimum |
| `silent_all` | No event of any kind for 45 minutes |
| `silent_pageviews` | 0 pageviews in 60 minutes while the median is high enough |
| `traffic_spike` | Pageviews over a multiple of the median, with a minimum (information only) |
| `traffic_drop` | Pageviews under a share of the median, with a minimum median |

`error_share` counts sessions and not events. On launch day one session wrote hundreds of "Script error." rows, so
event share is decided by a few sessions. The share is over sessions with a pageview or an error, so a page that fails
before its pageview still counts.

Only rows without a session count for `route_failures`. The public ingest refuses this event name from version 0.6.0,
but older SDKs accept it, and browser rows always have a session. Route names must be plain paths, because they go into
public logs, and a row's `count` is limited to 100,000.

`silent_all` is 45 minutes. Before launch, at about 200 events a day, gaps reached 70 minutes. Since 2026-10-28, at
about 20,000 events a day, the longest gap is under a minute.

**One message per problem.** State is stored per app and rule. A rule fires at once and clears after 4 clean runs (1
hour), so a noisy value doesn't flap.

**Delivery.** With a `RESEND_API_KEY` secret, the job sends email with numbers for start and end. Without it, the run
fails on the check that starts a problem, and GitHub's own "run failed" email is the alert. There is then no message
at the end of a problem. Robin has no Resend account yet, so the second path is what runs first.

**The repo is public, and so are the run logs.** Logs and summaries name only app and rule, never numbers.

**Access.** A new keyless service account `rt-analytics-alerts`, reached through a `github` workload identity pool
that only accepts `main` of this repo. It reads `analytics` and writes only the new `analytics_alerts` dataset. State
does not go in `dashboard_config`, because write access there would also allow changing settings and funnels. State
is read with `tabledata.list`, which costs no query bytes.

**Keep alive.** GitHub turns off scheduled runs after 60 days without a commit. From day 50 a failed run once a day
asks for a commit. The job doesn't renew itself with the workflow enable API, because GitHub's docs say notifications
then go to whoever re-enabled it, and that would be a bot token on the only alert path.

Values come from a backtest against the real days, `scripts/alerts/backtest.ts`.

## 4. Linear/Log switch

As in [the todo](../../todo/2026-10-31-log-scale-charts.md): URL parameter `scale=log`, next to Daily | Hourly,
display only.

## 5. Goals per source

Settings get one optional goal per app: an event and a label. The overview gets a "Goal" panel with sessions,
conversions and rate, plus tables by source, entry page and device, each with the previous period when Compare is on.

A session counts as converted when it has the goal event, so goals only work for events with a session id. The
settings list offers only those. wetter-in-kalender's goal is `subscribe_click` with the label "Clicks on subscribe",
because it counts clicks and not working subscriptions. `calendar_poll` is a server event, so it can't link to a
source.

The panel runs its own query, only when a goal is set.

## Also fixed

wetter-in-kalender had no saved settings, so `www.wetter-in-kalender.de` counted as a source. The own hosts are now
set.

## Release order

1. Add the `in_app` column.
2. Push `main` (dashboard), tag and publish the SDK.
3. Bump wetter-in-kalender, deploy.
4. Create the alert access, turn on alerts.
