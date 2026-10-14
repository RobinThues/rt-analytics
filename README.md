# rt-analytics

Self-owned, free web analytics for Next.js apps on Vercel, backed by BigQuery.

| folder                                           | what                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| [`packages/rt-analytics`](packages/rt-analytics) | the npm package (client SDK, React provider, Next.js ingest handler); see its README |
| [`apps/demo`](apps/demo)                         | demo app (`appId: "demo"`), also the integration reference                           |
| [`sql`](sql)                                     | BigQuery views and query templates                                                   |
| [`scripts`](scripts)                             | `npm run setup:gcp`, `npm run pseudonymize`, demo data                               |

## Demo data

The dashboard is built against demo data in the real `analytics.events` table, under `app_id = 'demo'`.

```bash
npm run demo:generate -- --dry-run          # counts only, writes nothing
npm run demo:generate                       # 90 days ending yesterday (UTC), gcloud default project
npm run demo:generate -- --replace          # first deletes demo rows before today, then loads
```

Flags: `--days` (default 90), `--seed` (default 42, same data on every run), `--project`, `--dataset` (default
`analytics`). It uses your `gcloud` application default credentials and a free load job. Without `--replace` it
refuses to run when demo rows before today already exist. `apps/demo` adds live demo events on top.

Remove all demo data: ``DELETE FROM `<project>.analytics.events` WHERE app_id = 'demo'``.

**Rule:** demo rows share the table with real apps. Any maintenance SQL that deletes or changes rows by date or by
app must filter by `app_id`. Deletions of one person by `visitor_id` (like `sql/templates/delete_visitor.sql`) do not
need it, because visitor ids are unique across apps.

MIT, see [LICENSE](LICENSE).
