# Handoff: launch package

Updated: 2026-10-31, branch main

Goal: Alerts live before the first public wetter-in-kalender Short on 2026-11-09. Spec: [launch package](../superpowers/specs/2026-10-31-launch-package-design.md).

State: Sources, failure events, the Linear/Log switch and goals are live, with SDK 0.6.0 on npm and wetter-in-kalender on it. The `in_app` column exists, and wetter's settings hold its own hosts and its goal. The alert job is merged but stays off, because its `vars.ALERTS_WIF_PROVIDER` isn't set. The permission check refused the setup, because it grants access rights, even after Robin's go for BigQuery and deploys.

Next step: Robin runs this, or names the IAM grant in a message, and sets the two variables it prints:

    npm run setup:gcp -- --alerts --github-repo RobinThues/rt-analytics --project robin-thues

Then start the Alerts workflow by hand and check that it passes.

Verify:

- Force one failing scheduled run, for example with a temporary low value in `scripts/alerts/config.ts`, and confirm that Robin gets GitHub's email. It is the only alert path until Resend exists, and it has never been tested. Scheduled-run emails go to whoever last changed the cron, so a manual run doesn't prove this.
- `npx tsx scripts/alerts/run.ts --dry` prints the rules for the current hour. It prints numbers, so run it locally only.
- Nobody has opened the production dashboard since the deploy. The same build was checked locally against real wetter data with the dev service account: all panels loaded.

Traps:

- The live `/kontakt` privacy text wasn't read in a browser, because Vercel's bot check blocks headless browsers. Commit a66a7eb contains it.
- `claude-tmp-helpers/ingest-smoke-test.sh` tests the live ingest and removes its row. Use it, not `/api/cal`, which writes real `calendar_poll` rows.
- `calendar_poll` rows may fall with wetter's CDN cache from 2026-10-31. If gaps pass 45 minutes, `silent_all` needs a higher value. `claude-tmp-helpers/alert-event-gaps.sh` shows them.
- Other apps stay on 0.5.x, and their `^0.5.x` range won't take 0.6.0. They get the SQL part of sources without a bump.
- Two wetter tests can fail on timing limits under heavy machine load (`occasion-pages-en`, `place-index-data`). They pass when the machine is quiet.
