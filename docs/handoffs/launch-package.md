# Handoff: launch package

Updated: 2026-11-01, branch main

Goal: Alerts live before the first public wetter-in-kalender Short on 2026-11-09. Spec: [launch package](../superpowers/specs/2026-10-31-launch-package-design.md).

State: Sources, failure events, the Linear/Log switch and goals are live, with SDK 0.6.0 on npm and wetter-in-kalender on it. The alert job works when started by hand, but GitHub's schedule has never started it, so alerts do not run on their own yet.

Tested with manual runs on 2026-11-01:

- A forced problem failed the run, and GitHub's "Run failed" email reached Robin's inbox.
- The state row was written. The next run passed with no second alert.
- After the test value was reverted, 4 clean runs ended the problem and emptied the state table.

GitHub's schedule: no scheduled run in 5 hours, from 22:45 UTC on 31 Oct to 03:49 UTC on 1 Nov. Turning the workflow off and on did not help, and neither did a new cron line. githubstatus.com shows Actions as operational. The community forum has had the same reports since August 2026, with runs hours late or missing and no fix from GitHub ([206019](https://github.com/orgs/community/discussions/206019), [208729](https://github.com/orgs/community/discussions/208729), [210059](https://github.com/orgs/community/discussions/210059)).

Next step: Robin decides on the trigger. The proposal is Cloud Scheduler starting the workflow every 15 minutes through the API. It needs a change in GCP and a token that only Robin can create:

1. Create a fine-grained GitHub token for this repo only, with Actions read and write, valid for 1 year.
2. Enable the API and create the job, with the token in `$ALERTS_DISPATCH_TOKEN`:

```bash
gcloud services enable cloudscheduler.googleapis.com --project robin-thues
```

```bash
gcloud scheduler jobs create http rt-analytics-alerts --project robin-thues --location europe-west3 --schedule "3,18,33,48 * * * *" --http-method POST --uri https://api.github.com/repos/RobinThues/rt-analytics/actions/workflows/alerts.yml/dispatches --headers "Accept=application/vnd.github+json,Authorization=Bearer $ALERTS_DISPATCH_TOKEN,User-Agent=rt-analytics-alerts" --message-body '{"ref":"main"}'
```

Keep the GitHub cron as a backup. If both start a run, the runs wait for each other and a problem only ends a little sooner.

Verify: `gh run list --workflow=Alerts --limit 8` shows a new `workflow_dispatch` run every 15 minutes. `claude-tmp-helpers/run-alerts-once.sh [runs]` starts runs by hand and prints the result and the state table.

Traps:

- Cloud Scheduler's price wasn't read from Google's page, because it didn't load. As far as known, 3 jobs per billing account are free and more cost about $0.10 a month each. Check this before creating the job.
- If the token expires or the scheduler fails, no email says so. GitHub warns by email before a token expires.
- A failed run emails whoever started it. With the token, that is Robin. A failed scheduled run was never seen, so that email path is untested.
- Nobody has opened the production dashboard since the deploy. The same build was checked locally against real wetter data with the dev service account: all panels loaded.
- The live `/kontakt` privacy text wasn't read in a browser, because Vercel's bot check blocks headless browsers. Commit a66a7eb in wetter-in-kalender contains it.
- `claude-tmp-helpers/ingest-smoke-test.sh` tests the live ingest and removes its row. Use it, not `/api/cal`, which writes real `calendar_poll` rows.
- `calendar_poll` rows may fall with wetter's CDN cache from 2026-10-31. If gaps pass 45 minutes, `silent_all` needs a higher value. `claude-tmp-helpers/alert-event-gaps.sh` shows them.
- Other apps stay on 0.5.x, and their `^0.5.x` range won't take 0.6.0. They get the SQL part of sources without a bump.
- Two wetter tests can fail on timing limits under heavy machine load (`occasion-pages-en`, `place-index-data`). They pass when the machine is quiet.
