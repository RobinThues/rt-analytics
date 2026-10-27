# rt-analytics dashboard: hourly charts

**Status:** asked for by Robin on 2026-10-27 ("a traffic spike during the morning, I only see the day, not
the hour; granularity up to one hour, maybe not only in the overview"). Robin was away and asked for
autonomous work, so the calls below are Claude's, checked by a reviewer agent. Builds on the v1 spec
(`2026-10-14-dashboard-design.md`), the layout spec and the e2e-cost spec, live on main 1d07ef7.

## Goals

- Every over-time chart can show one point per hour: overview "Over time" (visitors, sessions, pageviews),
  overview "Errors over time" and the explorer series chart.
- The choice is part of the view URL, like range and Compare, and survives page and app switches.
  `viewQuery` writes it, which covers the explorer redirect, links and form, and the funnel links.
- Daily charts, KPI tiles, breakdowns and every other number stay exactly as they are. The daily SQL stays
  byte for byte the same, so cache keys and e2e fixtures of the daily queries stay valid.
- Correct in the app's timezone, also on DST days and in timezones with a half-hour offset.

## Non-goals

- Weekly or monthly points (possible later with the same parameter).
- Hourly sparklines in the explorer event list (80 px wide; they stay daily).
- Hourly KPIs ("visitors per hour"). Tiles keep their per-day and range meanings.

## Behavior

- URL parameter `interval`: `hour` or `day`. Missing or broken means automatic: hourly for a one-day range,
  daily otherwise (a one-day range showed a single point before, so this only fixes a useless chart).
- Hourly is allowed for ranges up to 7 days (168 points; Plausible uses the same limit). For longer ranges
  the effective interval is daily, whatever the URL says, and the parameter stays in the URL, so picking a
  short range again brings hourly back.
- Control: a two-button group "Daily | Hourly" in the page bar next to Compare, on the overview and the
  explorer only (funnels have no time chart). It applies at once like Compare (same pending navigation,
  same dimming). "Hourly" is disabled for ranges over 7 days, with the reason as its title.
- Sidebar page and app links keep `interval` together with the range and Compare. The explorer form and
  links keep it. The funnel save redirect keeps it.

## Hour buckets

An hour bucket is the wall-clock hour in the app timezone, formatted in SQL:
`FORMAT_DATETIME('%Y-%m-%dT%H:00', DATETIME(ts, @tz))` (column `hour_start`, e.g. `2026-10-27T09:00`). `@tz`
is already a param of these queries, so no new params, and the cache rule "params depend only on the range
and today" holds. (A first draft used elapsed hours since the period start; the review showed that the
previous period then drifts by one hour after a DST change, which happens in the "last 7 days" this week.)

- The list of points comes from the server: step from the range's first local midnight to the end in
  one-hour steps, take each instant's wall-clock hour, drop repeats. Autumn DST day: 24 points, the repeated
  hour is one point with both hours' events (once a year, accepted). Spring DST day: 23 points, the skipped
  hour does not exist. Half-hour timezones (Asia/Kolkata) start at local midnight, so points are local hours.
- Previous period aligned by wall clock, like days: the point `D HH:00` is compared with `(D minus the
range's day count) HH:00`. A previous hour without events is 0.
- Labels are these strings. The browser only cuts strings, so its own timezone can never change a label and
  hydration stays stable. Every `at` is unique, so the chart's category axis never sees duplicates.
- Hours after the data are left out: the hourly queries return `CURRENT_TIMESTAMP() AS as_of`, and points
  after the hour of `as_of` are dropped (the hour of `as_of` stays, partial, like today in the daily chart).
  A cached result therefore never draws fake zero hours between its query time and the render, and the
  render needs no clock. Without rows there is nothing to cut. Recorded e2e fixtures carry an `as_of` after
  their range, so nothing is cut there.

## Queries

- `trafficQuery(ctx)`: unchanged for daily. Hourly groups `ev` and `ss` by `period, hour_start` instead of
  `period, day` (sessions by the hour of their first event, as days today) and returns `hour_start` and
  `as_of`.
- `eventSeriesQuery(ctx, sel)`: unchanged for daily. Hourly adds `hour_start` to `sel` and a third grouping
  set: `GROUPING SETS ((period, day), (period, hour_start), (period))`, plus `as_of`. Daily rows still feed
  the per-day averages of the total tile, hourly rows feed the chart, the `(period)` row is the range total.
  The model must tell the three row kinds apart (`day` NULL alone is no longer the total; a missing
  `hour_start` counts as NULL, since daily and breakdown rows have none).
- Job names (`traffic`, `event_series`) stay; the fixture file name has the SQL hash, so hourly specs get
  their own fixtures.
- Bytes: the same columns are read (`timestamp` is already in every query), so the bytes cap is unaffected.

## Chart

`TrendChart` gets points `{ at, prevAt, cur, prev }` (`at` is a day or a wall-clock hour string) and an
`interval` (the context carries the effective interval, so React's per-request cache keys on it). Daily
rendering stays the same (labels from `at` instead of the old `day`/`prevFrom` pair).
Hourly: tooltip "27 Oct, 09:00"; ticks at the first hour of each day labelled "27 Oct", or every 3 hours
labelled "09:00" when the range is one day.

## Tests

- Unit (TDD): interval parsing and the 7-day rule; URL helpers keep `interval`; hour point list and
  alignment incl. DST in both directions and in the previous period only, Asia/Kolkata, the `as_of` cut; label formatting; the explorer
  model with hourly rows (totals unchanged); query builders: daily SQL identical to before, hourly SQL
  shape; chart ticks.
- Dry run: hourly traffic and explorer series added to the BigQuery dry-run list.
- e2e (replay, new fixtures recorded once): switching to Hourly on the overview shows hourly tooltips and
  keeps the URL parameter; Hourly is disabled for 28 days; the explorer chart follows the parameter.
