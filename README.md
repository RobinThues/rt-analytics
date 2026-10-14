# rt-analytics

Self-owned, free web analytics for Next.js apps on Vercel, backed by BigQuery.

| folder | what |
|---|---|
| [`packages/rt-analytics`](packages/rt-analytics) | the npm package (client SDK, React provider, Next.js ingest handler); see its README |
| [`apps/demo`](apps/demo) | demo app (`appId: "demo"`), also the integration reference |
| [`sql`](sql) | BigQuery views and query templates |
| [`scripts`](scripts) | `npm run setup:gcp`, `npm run pseudonymize`, demo data |

MIT, see [LICENSE](LICENSE).
