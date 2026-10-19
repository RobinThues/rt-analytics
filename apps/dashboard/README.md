# rt-analytics dashboard

Generic multi-app dashboard for the rt-analytics BigQuery data. Run locally with `npm run dev -w rt-analytics-dashboard`.
Design: [docs/superpowers/specs/2026-10-14-dashboard-design.md](../../docs/superpowers/specs/2026-10-14-dashboard-design.md).

Secrets: how to keep the dashboard's secrets in Chrome's Google Password Manager is in [docs/guides/dashboard-secrets.html](../../docs/guides/dashboard-secrets.html) (open the file in a browser).

## End-to-end tests

Run `npm run build` first; the tests start `next start`. Every mode fixes "today" to 2026-10-13, the last day
of the demo data.

- `npm run e2e`: the default. BigQuery answers come from the recorded files in `e2e/fixtures`, so it needs no
  GCP access and bills nothing. Tests tagged `@bq` are skipped.
- `npm run e2e:bq`: only the `@bq` tests (config writes, Live and Refresh, one overview smoke, one explorer
  and one funnel test) against real BigQuery, as the `rt-analytics-dashboard-dev` service account (run
  `vercel env pull apps/dashboard/.env.development.local --yes` from the repo root first). About 0.4 GiB.
- `npm run e2e:all`: both, then the free BigQuery dry runs of every query. Run it before pushing to main.
- `npm run e2e:record`: re-records the fixtures against real BigQuery (about 0.4 GiB). Needed when a test
  fails with "No e2e fixture … Run npm run e2e:record", which means a query's SQL or params changed. The
  recorder only records the synthetic apps `demo` and `demo-b`, because the fixtures are committed.
