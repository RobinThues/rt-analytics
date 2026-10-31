# Handoff: launch package

Updated: 2026-10-31, branch feat/launch-package

Goal: Social and in-app sources, failure events, alerts, Linear/Log switch and goals, live before the first public wetter-in-kalender Short on 2026-11-09. Spec: [launch package](../superpowers/specs/2026-10-31-launch-package-design.md).

State: All five are built, reviewed and committed, and nothing is pushed or live. rt-analytics is on `feat/launch-package`. wetter-in-kalender is on `feat/rt-analytics-0.6` in the worktree `.claude/worktrees/rt-analytics-0.6` of that repo. npm has no 0.6.0 yet, and the wetter branch needs it, so it doesn't build until step 4.

Blocked: The auto-mode permission check refused `ALTER TABLE` on `analytics.events` as a change to a shared resource, so step 1 needs Robin, or his explicit go for that command. The dashboard and the SDK depend on the column, so nothing later can go first.

Next step, in this order:

1. Add the column (nullable, safe while apps write):

       bq --project_id=robin-thues --location=EU query --use_legacy_sql=false 'ALTER TABLE `robin-thues.analytics.events` ADD COLUMN IF NOT EXISTS in_app STRING'

2. Create the alert access, then set the two GitHub variables it prints. The alert job stays off until they exist:

       npm run setup:gcp -- --alerts --github-repo RobinThues/rt-analytics

3. Merge `feat/launch-package` to `main`, run `npm run e2e:record` and `npm run e2e:all` in `apps/dashboard`, and push `main`. This deploys the dashboard. Then push tag `v0.6.0`, which publishes the SDK.
4. In the wetter worktree run `npm install rt-analytics@0.6.0`, then `npm test`, `npm run typecheck` and `npm run build`. Update `CONTACT_UPDATED` in `src/lib/contact-content.ts` to the deploy day. Merge to `main` from the worktree and push.
5. In the dashboard's wetter-in-kalender settings, set own hostnames `wetter-in-kalender.de` and `www.wetter-in-kalender.de`, goal event `subscribe_click`, goal name `Clicks on subscribe`.
6. Start the Alerts workflow by hand and check that it passes.

Verify:

- After step 4, `sdk_version = '0.6.0'` rows appear for wetter-in-kalender, and rows from in-app browsers have `in_app` set.
- `npx tsx scripts/alerts/run.ts --dry` prints the rules for the current hour. It prints numbers, so run it locally only.
- Force one failing scheduled run, for example with a temporary low value in `scripts/alerts/config.ts`, and confirm that Robin gets GitHub's email. It is the only alert path until Resend exists, and it has never been tested.
- The Sources panel shows `instagram` and `youtube`, and `www.wetter-in-kalender.de` is gone.

Traps:

- Fixtures on the branch were recorded with a local patch that added a virtual NULL `in_app` column, read-only and not committed. Demo rows have no in-app value, so a real recording should give the same data. Step 3 records them for real.
- `RTD_DRY_RUN` tests fail on `in_app` until step 1 is done.
- Do not add a goal to the demo app without re-recording, because the e2e test expects "No goal set".
- The goal panel has only been seen with temporary fixtures, not in a real browser on real data. The goal SQL did run read-only on real wetter-in-kalender data.
- `/api/location` answers 404 when ipapi refuses, and that isn't counted as a failure, on purpose.
- Other apps stay on 0.5.x. Their `^0.5.x` range won't take 0.6.0, and they get the SQL part of sources without a bump.
- `calendar_poll` rows may fall with the CDN cache from 2026-10-31. If gaps pass 45 minutes, `silent_all` needs a higher value. Run `claude-tmp-helpers/alert-event-gaps.sh` to check.
- Deploys empty wetter's feed cache, and the Vercel team is near its limits, see `docs/handoffs/vercel-limits.md` in that repo. Deploy wetter only once.
