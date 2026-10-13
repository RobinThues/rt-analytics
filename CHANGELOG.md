# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

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

[0.2.0]: https://github.com/RobinThues/rt-analytics/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/RobinThues/rt-analytics/releases/tag/v0.1.0
