# To do: Linear/Log switch for the trend charts

Status: open, not started. Noted 2026-10-31. Robin picked log after seeing the real wetter-in-kalender curve
drawn with a linear axis, two capped axes and a log axis.

## Problem

A traffic peak flattens everything else on the linear axis. On wetter-in-kalender, one launch day reached about
100 times normal traffic and then fell over several days, so normal days became a flat line at the bottom.

## What to build

- A Linear/Log switch for `TrendChart` (`apps/dashboard/src/components/trend-chart.tsx`). It is used by the
  traffic charts and the Errors chart (`app/[appId]/panels/traffic.tsx`) and the explorer series chart
  (`app/[appId]/events/page.tsx`).
- Linear stays the default. The app never switches on its own, so no spike rule is needed.
- Log mode uses a symlog scale, because daily charts and especially hourly charts can have zeros and a true log
  axis can't show 0.
- Log mode draws only the lines and no filled area, because the area means little on a log axis. The compare line
  stays.
- The tooltip keeps showing the real numbers. The y-axis has ticks at 0, 1, 10, 100, 1,000 and so on.

## Suggestions for the builder

- One switch per page, in the URL like `compare` and `interval` (`view/range-ui.ts`), placed next to
  `IntervalToggle` in `components/page-bar.tsx`. The three overview charts sit side by side, so one click should
  change all of them, and a shared link keeps the view.
- This is display only. SQL, query cache keys and e2e fixtures should not change.
- Not tried yet: recharts has a `log` scale but may need a custom d3 `scaleSymlog` passed as the `scale` prop.
  Check this first, and check the tick labels in both themes.

## Out of scope

The sparklines in the event list, and a capped axis (see the decision of 2026-10-31 in `docs/DECISIONS.md`).
