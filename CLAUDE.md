# rt-analytics

Self-owned web analytics for Next.js apps on Vercel, backed by BigQuery. The repo has two main parts that ship separately:

- `packages/rt-analytics`: the tracking package. It reaches apps through an npm release, and each app must then bump its version.
- `apps/dashboard`: the Next.js dashboard. It goes live when `main` is pushed.

`apps/demo` is the demo app and integration reference. README.md has the full layout.

## Records

Open work is in docs/BACKLOG.md, decisions in docs/DECISIONS.md, specs and plans in docs/superpowers/.

## Rules

- The repo is public. Never commit secrets (`key.json`, `.env.*`) or private details.
- Pushing `main` deploys to production. Push only when Robin asks to push and deploy.
- Demo rows share `analytics.events` with real apps. Maintenance SQL that works by date or app must filter by `app_id`.
- Ask before changing anything in GCP or Vercel.

## Commands

- From the root: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- In `apps/dashboard`: `npm run e2e` replays recorded fixtures with no BigQuery cost. `e2e:bq` and `e2e:record` use real BigQuery.
- Dashboard env: run `vercel env pull apps/dashboard/.env.development.local --yes` from the repo root, because the Vercel link is there.
- Release: bump the version in `package.json`, the lockfile and `src/core/version.ts`, update the CHANGELOG, then push tag `vX.Y.Z`. GitHub Actions publishes to npm.
