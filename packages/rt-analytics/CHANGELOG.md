# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [0.4.0] - 2026-10-16

### Added

- `rt-analytics/schema`: `EventRow`, `BUILTIN_EVENTS`, `BUILTIN_PREFIX`, `EVENTS`, `RowConsentState`, `SERVER_CONSENT_STATE`,
  `DAILY_VISITOR_PREFIX`, for tools that read the BigQuery table (like the dashboard).

### Changed

- `EventRow.consent_state` is typed as `RowConsentState` instead of `string`.

### Fixed

- `sql/templates/retention.sql` dropped persistent visitor ids starting with "d" (`LIKE 'd_%'` treats `_` as a
  wildcard) and had no date filter. `sql/templates/funnel.sql` now takes each step after the previous step.

## [0.3.0] - 2026-10-13

### Added
- `createServerTracker` in `rt-analytics/next`: server-side events written straight to BigQuery, with
  `pseudonymize(value)` for stable keyed ids (HMAC-SHA-256, key derived per app).
- `ANALYTICS_PSEUDONYM_KEY` (optional; falls back to the salt).
- `sql/templates/delete_pseudonyms.sql` and `npm run pseudonymize` for deletion requests.

### Changed
- The `sessions` view ignores rows without a session (server events). **Upgrade:** re-run
  `npm run setup:gcp` to apply the new view before sending server events; otherwise each app gets one
  fake session made of all server rows.
- The funnel template ignores rows without a visitor.
- One BigQuery connection per destination table instead of one per process.

### Fixed
- An invalid `ANALYTICS_GCP_CREDENTIALS` value no longer puts part of the credentials into the error log.

## [0.2.0] - 2026-10-13

### Added
- Ignore link for the site owner: `GET /api/a?ignore=<key>` sets an `rta_ignore` cookie, and the
  handler drops batches that carry it (`x-rta: ignored`). Key from `ANALYTICS_IGNORE_KEY` or
  `ignoreKey`.
- `allowedAppIds` handler option.
- `cookieless` config flag: never touch browser storage.
- `AnalyticsProvider` accepts typed instances (`Analytics<E>`) without a cast or `appId`.
- `"default"` export condition, so CommonJS resolvers (Jest) find the package.
- `setup:gcp` prints a generated `ANALYTICS_IGNORE_KEY`.

### Changed
- **Breaking:** the salt must be at least 16 characters, otherwise all events are dropped. The
  handler checks credentials first, then the salt.
- **Breaking (types):** `AnalyticsProviderProps` is a union type.
- The provider starts error and Web Vitals capture in an effect and stops it on unmount.
- README: credentials for Production only; WAF rate-limit rule.

### Fixed
- Doubled `$error` / `$web_vital` events and doubled pageviews under React StrictMode in dev.
- Storage access no longer throws when storage is blocked or full.

## [0.1.0] - 2026-10-12

### Added
- Initial release: browser SDK with consent model, sessions, Web Vitals and error capture; React
  provider and consent banner; Next.js pageview tracker and ingest handler writing to BigQuery via
  the Storage Write API; `setup:gcp` script, SQL views and query templates.

[0.4.0]: https://github.com/RobinThues/rt-analytics/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/RobinThues/rt-analytics/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/RobinThues/rt-analytics/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/RobinThues/rt-analytics/releases/tag/v0.1.0
