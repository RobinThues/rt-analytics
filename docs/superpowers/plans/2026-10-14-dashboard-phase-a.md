# Dashboard Phase A (foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the repo into an npm workspaces monorepo on TypeScript 6.0.3, add linting, the `rt-analytics/schema` entry and fixed SQL templates, and fill BigQuery with 90 days of realistic demo data plus a live demo app, so the dashboard (Phase B/C) can be built against demo data.

**Architecture:** The library moves to `packages/rt-analytics` unchanged in behavior; root holds ops scripts (`scripts/`), SQL (`sql/`) and shared tooling. A pure, seeded generator in `scripts/demo/` simulates the SDK's real session and identity behavior and is loaded into `analytics.events` with a free load job. `example/` becomes `apps/demo` (`appId: "demo"`).

**Tech Stack:** npm workspaces, TypeScript 6.0.3, tsdown 0.23, Vitest 5, ESLint 10 (flat config) + typescript-eslint 8 + Prettier 3, Next.js 16.4, @google-cloud/bigquery 9.

**Spec:** [docs/superpowers/specs/2026-10-14-dashboard-design.md](../specs/2026-10-14-dashboard-design.md) (sections 1, 8, 11). Read it before starting.

## Phases

| phase | spec PRs | plan |
|---|---|---|
| **A: foundation** (this plan) | 1 monorepo, 2 lint, 3 library, 4 demo | this file |
| B: GCP and dashboard shell | 5 GCP, 6 dashboard part 1, 7 dashboard part 2 | written after Phase A is merged |
| C: pages | 8 overview, 9 explorer, 10 funnels, 11 secrets guide | written after Phase B is merged |

Each PR is its own branch, stacked in order: `chore/monorepo` → `chore/lint-library` → `feat/schema-entry` → `feat/demo-data`. Nothing is pushed without Robin's OK.

## Global Constraints

- TypeScript `6.0.3` everywhere (one root lockfile); reason documented in spec section 1. Do not install TypeScript 7.
- Library `engines.node` stays `>=22`; apps use Node 24 LTS.
- The library's published file list and built `dist` must not change in Task 1 (compare against the baseline).
- Library tags stay `vX.Y.Z`; `release.yml` publishes from `packages/rt-analytics`.
- No secrets in git: `.env.analytics`, `key.json`, `.env*` stay gitignored at the root.
- Demo rows use `app_id = 'demo'`; any SQL that deletes by date or app filters by `app_id`.
- Commits: author is Robin's git config; no `Co-Authored-By` or other attribution trailers (Robin's global rule).
- Before adding any dependency, check its latest stable version with `npm view <pkg> version --prefer-online` and use that.
- Throw-away commands go into files under `claude-tmp-helpers/` (gitignored), not inline one-liners.

## Review Focus

1. **Published tarball changes silently after the move** (missing LICENSE, README, CHANGELOG or a dist file): owner Task 1, pinned by the pack file-list diff in Step 1.11.
2. **Release workflow publishes nothing or the wrong folder** (tag guard reads the root `package.json`, which has no library version): owner Task 1, pinned by running the guard command and `npm publish --dry-run` from the package folder in Step 1.12.
3. **Running the demo generator twice duplicates all demo rows:** owner Task 6, pinned by the `planLoad` unit test (refuses without `--replace` when demo rows exist).
4. **Demo rows dated today or in the future** (they would sit in the streaming-write window and look like live traffic): owner Task 5, pinned by the "all timestamps before the end" test.
5. **Consumers importing `EventRow` from `rt-analytics/next` break when the type moves:** owner Task 3, pinned by a `test-d` import of both `rt-analytics/next` and `rt-analytics/schema`.

---

### Task 1: Monorepo move and TypeScript 6.0.3 (PR 1, branch `chore/monorepo`)

**Files:**
- Move (git mv): `src/`, `test-d/`, `tsdown.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.dist-types.json`, `CHANGELOG.md`, `README.md` → `packages/rt-analytics/`
- Move: `src/next/pseudonymize-script.test.ts` → `scripts/pseudonymize.test.ts`
- Move: `example/` → `apps/demo/`
- Create: `packages/rt-analytics/package.json`, `packages/rt-analytics/LICENSE` (copy), root `package.json` (rewrite), root `tsconfig.json`, root `vitest.config.ts`, root `README.md`
- Modify: `scripts/pseudonymize.ts:6`, `.github/workflows/release.yml`, `.gitignore`, `apps/demo/package.json`, `packages/rt-analytics/tsconfig.json`, `packages/rt-analytics/README.md:97`
- Delete: `apps/demo/package-lock.json`

**Interfaces:**
- Produces: workspace package `rt-analytics` at `packages/rt-analytics`; root scripts `test`, `typecheck`, `build`, `setup:gcp`, `pseudonymize`; root Vitest config collecting `scripts/**/*.test.ts`; workspace app `rt-analytics-demo` at `apps/demo`.

- [ ] **Step 1.1: Branch and baseline**

```bash
git switch -c chore/monorepo
mkdir -p claude-tmp-helpers/baseline
npm ci && npm run build
npm pack --dry-run --json > claude-tmp-helpers/baseline/pack-before.json
rm -rf claude-tmp-helpers/baseline/dist-before && cp -r dist claude-tmp-helpers/baseline/dist-before
npm test 2>&1 | tail -5 > claude-tmp-helpers/baseline/test-before.txt
```

Expected: tests pass; note the test count in `test-before.txt`.

- [ ] **Step 1.2: Move files**

```bash
mkdir -p packages/rt-analytics apps
git mv src/next/pseudonymize-script.test.ts scripts/pseudonymize.test.ts
git mv src test-d tsdown.config.ts vitest.config.ts tsconfig.json tsconfig.dist-types.json CHANGELOG.md README.md packages/rt-analytics/
cp LICENSE packages/rt-analytics/LICENSE
git mv example apps/demo
rm -rf example dist apps/demo/node_modules apps/demo/.next
git rm -q apps/demo/package-lock.json
```

- [ ] **Step 1.3: Library `package.json`**

Create `packages/rt-analytics/package.json` from the old root file: same `name`, `version`, `description`, `license`, `type`, `sideEffects`, `engines`, `files`, `exports`, `dependencies`, `peerDependencies`, `peerDependenciesMeta`. Changes:

```json
  "repository": {
    "type": "git",
    "url": "git+https://github.com/RobinThues/rt-analytics.git",
    "directory": "packages/rt-analytics"
  },
  "scripts": {
    "build": "tsdown",
    "prepublishOnly": "npm test && npm run typecheck && npm run build && npm run typecheck:dist",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "prepare": "tsdown",
    "typecheck:dist": "tsc -p tsconfig.dist-types.json"
  },
```

`devDependencies`: the old list without `@google-cloud/bigquery` and `tsx` (they move to the root), and `"typescript": "6.0.3"`.

- [ ] **Step 1.4: Library tsconfig**

In `packages/rt-analytics/tsconfig.json` change `"include"` to `["src", "tsdown.config.ts", "vitest.config.ts"]` (scripts now live at the root).

- [ ] **Step 1.5: Root `package.json`**

Replace the root `package.json` with (versions: check latest with `npm view` per Global Constraints; `typescript` pinned to 6.0.3):

```json
{
  "name": "rt-analytics-monorepo",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "build": "npm run build -w rt-analytics",
    "test": "vitest run && npm test --workspaces --if-present",
    "typecheck": "tsc --noEmit && npm run typecheck --workspaces --if-present",
    "setup:gcp": "tsx scripts/setup-gcp.ts",
    "pseudonymize": "tsx scripts/pseudonymize.ts"
  },
  "devDependencies": {
    "@google-cloud/bigquery": "^9.3.0",
    "@types/node": "^22.10.0",
    "tsx": "^4.23.15",
    "typescript": "6.0.3",
    "vitest": "^5.0.4"
  }
}
```

- [ ] **Step 1.6: Root tsconfig and Vitest config**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["scripts", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

// Root tests: ops scripts and SQL templates. Workspace packages run their own suites.
export default defineConfig({
  test: { environment: "node", include: ["scripts/**/*.test.ts"] },
});
```

- [ ] **Step 1.7: Pseudonymize script and test**

`scripts/pseudonymize.ts` line 6 becomes:

```ts
import { createServerTracker } from "rt-analytics/next";
```

`scripts/pseudonymize.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServerTracker } from "rt-analytics/next";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("./pseudonymize.ts", import.meta.url));

describe("scripts/pseudonymize.ts", () => {
  it("prints the same pseudonyms as the tracker", () => {
    const key = "salt-0123456789abcdef";
    const out = execFileSync("npx", ["tsx", script, "--app", "wetter", "s:0123456789abcdef", "link:x"], {
      env: { ...process.env, ANALYTICS_DAILY_SALT: key, ANALYTICS_PSEUDONYM_KEY: "" },
      encoding: "utf8",
    });
    const tracker = createServerTracker({ appId: "wetter", pseudonymKey: key });
    expect(out.trim().split("\n")).toEqual([
      `${tracker.pseudonymize("s:0123456789abcdef")}\ts:0123456789abcdef`,
      `${tracker.pseudonymize("link:x")}\tlink:x`,
    ]);
  }, 30_000);
});
```

- [ ] **Step 1.8: Demo app package, gitignore, READMEs**

`apps/demo/package.json`: set `"name": "rt-analytics-demo"` and `"rt-analytics": "*"` (workspace). Keep its scripts for now (Task 7 changes them).

`.gitignore`: replace `example/.next/` and `example/node_modules/` with `apps/*/.next/`, and add `.vercel/`.

`packages/rt-analytics/README.md` line 97: replace "See `example/` for a complete minimal app wired against the package's own build output." with "See [`apps/demo/`](https://github.com/RobinThues/rt-analytics/tree/main/apps/demo) in the repository for a complete minimal app wired against the package's own build output." Other `npm run setup:gcp` / `pseudonymize` / `sql/` references stay valid (they are run from the repo root).

Root `README.md`:

```markdown
# rt-analytics

Self-owned, free web analytics for Next.js apps on Vercel, backed by BigQuery.

| folder | what |
|---|---|
| [`packages/rt-analytics`](packages/rt-analytics) | the npm package (client SDK, React provider, Next.js ingest handler); see its README |
| [`apps/demo`](apps/demo) | demo app (`appId: "demo"`), also the integration reference |
| [`sql`](sql) | BigQuery views and query templates |
| [`scripts`](scripts) | `npm run setup:gcp`, `npm run pseudonymize`, demo data |

MIT, see [LICENSE](LICENSE).
```

- [ ] **Step 1.9: Release workflow**

In `.github/workflows/release.yml`, replace the guard and publish steps:

```yaml
      - name: Check that the tag matches the package version
        run: test "$GITHUB_REF_NAME" = "v$(node -p "require('./packages/rt-analytics/package.json').version")"

      - run: npm ci

      # prepublishOnly runs tests and typecheck, prepare builds dist.
      # The repo is public, so npm attaches provenance automatically.
      - run: npm publish
        working-directory: packages/rt-analytics
```

- [ ] **Step 1.10: Install and run everything**

```bash
npm install
npm test
npm run typecheck
npm run build
npm run typecheck:dist -w rt-analytics
npm run build -w rt-analytics-demo
```

Expected: install regenerates `package-lock.json` for workspaces (TS 6.0.3 resolved once); library test count equals `test-before.txt`; root runs 1 test file (pseudonymize) green; demo builds.

- [ ] **Step 1.11: Compare against the baseline**

Create `claude-tmp-helpers/compare-pack.mjs`:

```js
// Usage: node claude-tmp-helpers/compare-pack.mjs <before.json> <after.json>
// Compares two `npm pack --dry-run --json` outputs by file path and size; exits 1 on any difference.
import { readFileSync } from "node:fs";
const files = (p) => new Map(JSON.parse(readFileSync(p, "utf8"))[0].files.map((f) => [f.path, f.size]));
const [a, b] = [files(process.argv[2]), files(process.argv[3])];
let diff = 0;
for (const [path, size] of a) if (b.get(path) !== size) { console.log(`changed or missing: ${path}`); diff++; }
for (const path of b.keys()) if (!a.has(path)) { console.log(`new: ${path}`); diff++; }
console.log(diff ? `${diff} differences` : "identical");
process.exit(diff ? 1 : 0);
```

Run:

```bash
(cd packages/rt-analytics && npm pack --dry-run --json) > claude-tmp-helpers/baseline/pack-after.json
node claude-tmp-helpers/compare-pack.mjs claude-tmp-helpers/baseline/pack-before.json claude-tmp-helpers/baseline/pack-after.json
diff -r claude-tmp-helpers/baseline/dist-before packages/rt-analytics/dist && echo "dist identical"
```

Expected: `identical` (only `package.json` may differ in size because of `repository.directory` and scripts; that one difference is accepted, anything else is a bug) and `dist identical`.

- [ ] **Step 1.12: Release dry run**

```bash
GITHUB_REF_NAME="v$(node -p "require('./packages/rt-analytics/package.json').version")" \
  sh -c 'test "$GITHUB_REF_NAME" = "v$(node -p "require(\"./packages/rt-analytics/package.json\").version")" && echo guard ok'
(cd packages/rt-analytics && npm publish --dry-run 2>&1 | tail -15)
```

Expected: `guard ok`; the dry run lists `rt-analytics@0.3.0` with LICENSE, README.md, CHANGELOG.md and `dist/**`, and fails only with "You cannot publish over the previously published versions" or similar (no other error).

- [ ] **Step 1.13: Commit**

```bash
git add -A
git status --short   # check: no .env*, key.json, node_modules, .next, claude-tmp-helpers
git commit -m "chore: npm workspaces monorepo (packages/rt-analytics, apps/demo), TypeScript 6.0.3"
```

---

### Task 2: ESLint and Prettier for the library and scripts (PR 2, branch `chore/lint-library` from `chore/monorepo`)

**Files:**
- Create: `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`
- Modify: root `package.json` (devDependencies, scripts `lint`, `format`, `format:check`), any source files the formatter or linter changes

**Interfaces:**
- Produces: root `npm run lint`, `npm run format`, `npm run format:check`; root ESLint config that ignores `apps/**` (each app brings its own `eslint.config.mjs` with `eslint-config-next`; ESLint 10 looks up the nearest config per file).

- [ ] **Step 2.1: Install**

```bash
git switch -c chore/lint-library
for p in eslint @eslint/js typescript-eslint eslint-plugin-react-hooks prettier eslint-config-prettier globals; do echo "$p $(npm view $p version --prefer-online)"; done
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks prettier eslint-config-prettier globals
```

Expected: `typescript-eslint` installs without peer warnings against TypeScript 6.0.3.

- [ ] **Step 2.2: Config files**

`eslint.config.mjs`:

```js
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// Library, scripts and SQL helpers. Apps under apps/ have their own eslint.config.mjs (eslint-config-next).
export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "apps/**", "claude-tmp-helpers/**", "**/*.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/rt-analytics/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  { files: ["scripts/**/*.ts", "**/*.config.{ts,mjs}"], languageOptions: { globals: globals.node } },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  prettier,
);
```

`.prettierrc.json` (matches the current code style: double quotes, semicolons, trailing commas, long lines):

```json
{ "printWidth": 120 }
```

`.prettierignore`:

```
dist
node_modules
.next
package-lock.json
CHANGELOG.md
claude-tmp-helpers
apps/demo/next-env.d.ts
```

Root `package.json` scripts:

```json
    "lint": "eslint . && npm run lint --workspaces --if-present",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
```

- [ ] **Step 2.3: Format in its own commit**

```bash
npm run format
npm test && npm run typecheck
git add -A && git commit -m "style: prettier"
```

Expected: tests and typecheck still green (formatting only).

- [ ] **Step 2.4: Lint and fix**

Run `npx eslint .`. Fix each finding in the source. Allowed: an inline `// eslint-disable-next-line <rule> -- <reason>` only where the code is intentionally that way (e.g. `any` at a JSON boundary that is validated on the next line). Re-run until clean.

```bash
npx eslint . && npm test && npm run typecheck && npm run build && npm run typecheck:dist -w rt-analytics
```

Expected: no lint errors; all green; `diff -r claude-tmp-helpers/baseline/dist-before packages/rt-analytics/dist` shows no behavior-relevant change (if lint fixes changed emitted code, check each hunk is a pure refactor).

- [ ] **Step 2.5: Commit**

```bash
git add -A && git commit -m "chore: ESLint flat config and Prettier for library and scripts"
```

---

### Task 3: `rt-analytics/schema` entry (PR 3 part 1, branch `feat/schema-entry` from `chore/lint-library`)

**Files:**
- Create: `packages/rt-analytics/src/schema/index.ts`, `packages/rt-analytics/src/schema/event-row.ts`, `packages/rt-analytics/src/schema/index.test.ts`
- Modify: `packages/rt-analytics/src/next/bigquery-writer.ts:4-27` (EventRow moves), `packages/rt-analytics/src/next/index.ts`, `src/core/analytics.ts:97,103,141,144`, `src/core/webvitals.ts:7`, `src/core/errors.ts:5,11`, `src/next/server-tracker.ts:100`, `src/next/enrich.ts:38`, `tsdown.config.ts`, `package.json` (exports), `tsconfig.json` (paths), `vitest.config.ts` (alias), `test-d/consumer.test-d.tsx`, `CHANGELOG.md`

**Interfaces:**
- Produces (`rt-analytics/schema`):
  - `BUILTIN_EVENTS: readonly ["$pageview", "$session_start", "$web_vital", "$error", "$consent", "$identify"]`
  - `type BuiltinEvent = (typeof BUILTIN_EVENTS)[number]`
  - `EVENTS: { pageview: "$pageview"; sessionStart: "$session_start"; webVital: "$web_vital"; error: "$error"; consent: "$consent"; identify: "$identify" }`
  - `type RowConsentState = ConsentState | "server"`; `SERVER_CONSENT_STATE: "server"`
  - `DAILY_VISITOR_PREFIX: "d_"`
  - `interface EventRow` (same fields as today; `consent_state: RowConsentState`)

- [ ] **Step 3.1: Branch and write the failing test**

```bash
git switch -c feat/schema-entry
```

`packages/rt-analytics/src/schema/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dailyVisitorId } from "../next/enrich.js";
import { BUILTIN_EVENTS, DAILY_VISITOR_PREFIX, EVENTS, SERVER_CONSENT_STATE } from "./index.js";

describe("schema", () => {
  it("EVENTS covers exactly the built-in event names", () => {
    expect(new Set(Object.values(EVENTS))).toEqual(new Set(BUILTIN_EVENTS));
  });

  it("built-in names start with $", () => {
    for (const name of BUILTIN_EVENTS) expect(name.startsWith("$")).toBe(true);
  });

  it("daily visitor ids use the prefix", () => {
    expect(dailyVisitorId("salt-0123456789abcdef", "1.2.3.4", "ua", "app", new Date()).startsWith(DAILY_VISITOR_PREFIX)).toBe(true);
  });

  it("server consent state", () => {
    expect(SERVER_CONSENT_STATE).toBe("server");
  });
});
```

- [ ] **Step 3.2: Run it to verify it fails**

Run: `npm test -w rt-analytics -- src/schema`
Expected: FAIL, cannot resolve `./index.js`.

- [ ] **Step 3.3: Implement**

`src/schema/event-row.ts`: move the `EventRow` interface from `bigquery-writer.ts` unchanged except `consent_state: RowConsentState;` and import `type { RowConsentState } from "./index.js"`.

`src/schema/index.ts`:

```ts
import type { ConsentState } from "../core/types.js";

/** Event names the SDK emits by itself. App events never start with "$". */
export const BUILTIN_EVENTS = ["$pageview", "$session_start", "$web_vital", "$error", "$consent", "$identify"] as const;
export type BuiltinEvent = (typeof BUILTIN_EVENTS)[number];

export const EVENTS = {
  pageview: "$pageview",
  sessionStart: "$session_start",
  webVital: "$web_vital",
  error: "$error",
  consent: "$consent",
  identify: "$identify",
} as const satisfies Record<string, BuiltinEvent>;

/** consent_state as stored in BigQuery: the client states plus "server" for server-side events. */
export type RowConsentState = ConsentState | "server";
export const SERVER_CONSENT_STATE = "server" satisfies RowConsentState;

/** Prefix of the daily visitor ids the ingest assigns when the client sends none (cookieless). */
export const DAILY_VISITOR_PREFIX = "d_";

export type { EventRow } from "./event-row.js";
```

`bigquery-writer.ts`: replace the interface with `import type { EventRow } from "../schema/event-row.js";` and `export type { EventRow };`. `src/next/index.ts` keeps `export type { EventRow, RowWriter, WriterConfig } from "./bigquery-writer.js";`.

Replace the literals: `analytics.ts` (`EVENTS.sessionStart`, `EVENTS.consent`, `EVENTS.pageview`, `EVENTS.identify`), `webvitals.ts` (`EVENTS.webVital`), `errors.ts` (`EVENTS.error`), `server-tracker.ts` (`SERVER_CONSENT_STATE`), `enrich.ts` (`` `${DAILY_VISITOR_PREFIX}${hash.slice(0, 32)}` ``). Import from `../schema/index.js`.

Wire the entry:
- `tsdown.config.ts`, first config `entry`: add `"schema/index": "src/schema/index.ts"`.
- `package.json` `exports`: add
  ```json
  "./schema": { "types": "./dist/schema/index.d.ts", "import": "./dist/schema/index.js", "default": "./dist/schema/index.js" }
  ```
- `tsconfig.json` `paths`: add `"rt-analytics/schema": ["./src/schema/index.ts"]`; `vitest.config.ts` alias: add the same.

- [ ] **Step 3.4: Consumer type test (Review Focus 5)**

Append to `test-d/consumer.test-d.tsx`:

```ts
import type { EventRow as NextEventRow } from "rt-analytics/next";
import { BUILTIN_EVENTS, type EventRow, type RowConsentState } from "rt-analytics/schema";

const sameRow = (r: EventRow): NextEventRow => r;
const consent: RowConsentState = "server";
export const schemaChecks = [sameRow, consent, BUILTIN_EVENTS] as const;
```

- [ ] **Step 3.5: Run everything**

```bash
npm test -w rt-analytics && npm run typecheck && npm run build && npm run typecheck:dist -w rt-analytics && npx eslint .
ls packages/rt-analytics/dist/schema
```

Expected: all green; `dist/schema/index.js` and `index.d.ts` exist. Check that `dist/index.js` (client bundle) did not grow beyond the inlined constants: `diff <(wc -c < claude-tmp-helpers/baseline/dist-before/index.js) <(wc -c < packages/rt-analytics/dist/index.js)` shows a small difference only.

- [ ] **Step 3.6: CHANGELOG and commit**

Add at the top of `packages/rt-analytics/CHANGELOG.md`:

```markdown
## Unreleased

### Added
- `rt-analytics/schema`: `EventRow`, `BUILTIN_EVENTS`, `EVENTS`, `RowConsentState`, `SERVER_CONSENT_STATE`, `DAILY_VISITOR_PREFIX`, for tools that read the BigQuery table (like the dashboard).

### Changed
- `EventRow.consent_state` is typed as `RowConsentState` instead of `string`.
```

```bash
git add -A && git commit -m "feat: rt-analytics/schema entry with event row type and built-in names"
```

---

### Task 4: SQL template fixes (PR 3 part 2, same branch `feat/schema-entry`)

**Files:**
- Modify: `sql/templates/retention.sql`, `sql/templates/funnel.sql`
- Create: `scripts/sql-templates.test.ts`, `claude-tmp-helpers/dry-run-template.sh`

- [ ] **Step 4.1: Write the failing test**

`scripts/sql-templates.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(new URL(`../sql/templates/${name}`, import.meta.url), "utf8");

describe("sql templates", () => {
  it("never use LIKE 'd_%' (underscore is a wildcard)", () => {
    for (const name of ["retention.sql", "funnel.sql", "web_vitals.sql", "errors.sql"]) {
      expect(read(name)).not.toMatch(/LIKE\s+'d_%'/i);
    }
  });

  it("retention filters persistent ids with STARTS_WITH and has a date filter", () => {
    const sql = read("retention.sql");
    expect(sql).toMatch(/NOT STARTS_WITH\(visitor_id, 'd_'\)/);
    expect(sql).toMatch(/DATE\(timestamp\) BETWEEN/);
  });

  it("funnel takes each step after the previous step", () => {
    const sql = read("funnel.sql");
    expect(sql).toMatch(/ev\.timestamp > s1\.t1/);
    expect(sql).toMatch(/ev\.timestamp > s2\.t2/);
  });
});
```

- [ ] **Step 4.2: Run it to verify it fails**

Run: `npx vitest run scripts/sql-templates.test.ts`
Expected: FAIL on `LIKE 'd_%'` and the missing patterns.

- [ ] **Step 4.3: Rewrite the templates**

`sql/templates/retention.sql`:

```sql
-- Weekly retention cohorts (persistent visitor ids only, i.e. consented visitors).
-- Replace PROJECT, APP_ID and the dates. Cohort = week (Monday) of a visitor's first event in the range;
-- visitors seen before the range count as new. Cookieless ids (d_...) change every day and are excluded.
WITH persistent AS (
  SELECT visitor_id, DATE(timestamp) AS day
  FROM `PROJECT.analytics.events`
  WHERE app_id = 'APP_ID'
    AND DATE(timestamp) BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'
    AND visitor_id IS NOT NULL
    AND NOT STARTS_WITH(visitor_id, 'd_')
),
firsts AS (
  SELECT visitor_id, DATE_TRUNC(MIN(day), WEEK(MONDAY)) AS cohort_week
  FROM persistent
  GROUP BY visitor_id
),
activity AS (
  SELECT DISTINCT visitor_id, DATE_TRUNC(day, WEEK(MONDAY)) AS active_week
  FROM persistent
)
SELECT
  f.cohort_week,
  DATE_DIFF(a.active_week, f.cohort_week, WEEK) AS week_n,
  COUNT(DISTINCT a.visitor_id) AS visitors
FROM firsts f
JOIN activity a USING (visitor_id)
GROUP BY cohort_week, week_n
ORDER BY cohort_week, week_n;
```

`sql/templates/funnel.sql`:

```sql
-- Funnel: replace PROJECT, APP_ID, the dates and the three step event names.
-- Counts visitors who completed the steps in order: each step is the first occurrence of its event
-- strictly after the previous step. Only persistent visitor ids make sense across days; cookieless ids
-- (d_...) change every day, so for cookieless apps use session_id instead of visitor_id.
WITH ev AS (
  SELECT visitor_id, event_name, timestamp
  FROM `PROJECT.analytics.events`
  WHERE app_id = 'APP_ID'
    AND DATE(timestamp) BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'
    AND visitor_id IS NOT NULL
    AND event_name IN ('STEP_1_EVENT', 'STEP_2_EVENT', 'STEP_3_EVENT')
),
s1 AS (
  SELECT visitor_id, MIN(timestamp) AS t1
  FROM ev
  WHERE event_name = 'STEP_1_EVENT'
  GROUP BY visitor_id
),
s2 AS (
  SELECT s1.visitor_id, MIN(ev.timestamp) AS t2
  FROM s1
  JOIN ev ON ev.visitor_id = s1.visitor_id AND ev.event_name = 'STEP_2_EVENT' AND ev.timestamp > s1.t1
  GROUP BY s1.visitor_id
),
s3 AS (
  SELECT s2.visitor_id, MIN(ev.timestamp) AS t3
  FROM s2
  JOIN ev ON ev.visitor_id = s2.visitor_id AND ev.event_name = 'STEP_3_EVENT' AND ev.timestamp > s2.t2
  GROUP BY s2.visitor_id
)
SELECT
  (SELECT COUNT(*) FROM s1) AS step1,
  (SELECT COUNT(*) FROM s2) AS step2,
  (SELECT COUNT(*) FROM s3) AS step3;
```

- [ ] **Step 4.4: Run tests and a BigQuery dry run**

`claude-tmp-helpers/dry-run-template.sh`:

```bash
#!/usr/bin/env bash
# Usage: claude-tmp-helpers/dry-run-template.sh <template.sql> [project] [app_id]
# Fills the placeholders of an sql/templates file and runs it as a free BigQuery dry run.
set -euo pipefail
project="${2:-$(gcloud config get-value project 2>/dev/null)}"
app="${3:-demo}"
from="$(date -u -d '30 days ago' +%F)"; to="$(date -u +%F)"
sql="$(sed -e "s/PROJECT/${project}/g" -e "s/APP_ID/${app}/g" \
  -e "0,/'YYYY-MM-DD'/s//'${from}'/" -e "0,/'YYYY-MM-DD'/s//'${to}'/" \
  -e "s/STEP_1_EVENT/place_selected/g" -e "s/STEP_2_EVENT/subscribe_click/g" -e "s/STEP_3_EVENT/\$pageview/g" "$1")"
bq query --use_legacy_sql=false --dry_run --location=EU "$sql"
```

```bash
chmod +x claude-tmp-helpers/dry-run-template.sh
npx vitest run scripts/sql-templates.test.ts
claude-tmp-helpers/dry-run-template.sh sql/templates/retention.sql
claude-tmp-helpers/dry-run-template.sh sql/templates/funnel.sql
```

Expected: tests PASS; both dry runs print "Query successfully validated".

- [ ] **Step 4.5: Commit**

```bash
git add sql/templates scripts/sql-templates.test.ts
git commit -m "fix(sql): retention uses STARTS_WITH and a date filter; funnel steps follow the previous step"
```

---

### Task 5: Demo data generator (PR 4 part 1, branch `feat/demo-data` from `feat/schema-entry`)

**Files:**
- Create: `scripts/demo/rng.ts`, `scripts/demo/profile.ts`, `scripts/demo/dwd-profile.ts`, `scripts/demo/simulate.ts`, `scripts/demo/ndjson.ts`, `scripts/demo/simulate.test.ts`, `scripts/demo/test-profile.ts`

**Interfaces:**
- Consumes: `rt-analytics/schema` (`EventRow`, `EVENTS`, `DAILY_VISITOR_PREFIX`, `SERVER_CONSENT_STATE`, `RowConsentState`), `SDK_VERSION` from `rt-analytics`.
- Produces:
  - `createRng(seed: number): Rng`
  - `type DemoProfile` (see `profile.ts`), `dwdProfile: DemoProfile`
  - `generateDemoEvents(profile: DemoProfile, opts: { from: Date; days: number; seed: number }): EventRow[]` (sorted by timestamp, all in `[from, from + days)`)
  - `simulateVisit(profile, rng, visitor: Visitor, start: Date): EventRow[]`, `dailyVisitorId(visitorKey: string, at: Date): string`
  - `toNdjsonLine(row: EventRow): string`

- [ ] **Step 5.1: Branch, RNG and profile types**

```bash
git switch -c feat/demo-data
```

`scripts/demo/rng.ts`:

```ts
// Seeded pseudo-random numbers (mulberry32), so demo data is the same on every run with the same seed.
export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T extends { weight: number }>(items: readonly T[]): T;
  hex(chars: number): string;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)]!,
    weighted: (items) => {
      let r = next() * items.reduce((sum, i) => sum + i.weight, 0);
      for (const item of items) {
        r -= item.weight;
        if (r < 0) return item;
      }
      return items[items.length - 1]!;
    },
    hex: (chars) => {
      let s = "";
      while (s.length < chars) s += Math.floor(next() * 16).toString(16);
      return s;
    },
  };
}

export function uuid(rng: Rng): string {
  const h = rng.hex(32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
```

`scripts/demo/profile.ts`:

```ts
import type { Rng } from "./rng.js";

export interface Weighted<T> {
  value: T;
  weight: number;
}

export interface Device {
  browser: string;
  os: string;
  deviceType: "desktop" | "mobile" | "tablet";
  viewport: readonly [number, number];
}

export interface Source {
  referrer: string | null;
  utm?: { source: string; medium: string; campaign: string };
}

/** State shared by the events of one visit (e.g. the place a dwd visitor picked). */
export interface VisitState {
  place: string | null;
}

export interface ClientEventDef {
  name: string;
  /** Paths where the event can happen. */
  paths: readonly string[];
  /** Chance per pageview on one of those paths. */
  chance: number;
  /** Only possible after this event happened earlier in the same visit. */
  after?: string;
  props(rng: Rng, visit: VisitState): Record<string, unknown>;
}

export interface Subscription {
  key: string;
  kind: "token" | "legacy";
  client: string;
}

export interface ServerEventDef {
  name: string;
  /** Number of active subscriptions on the first and the last day (linear growth). */
  pool: { start: number; end: number };
  pollsPerDay: { min: number; max: number };
  newSubscription(rng: Rng, index: number): Subscription;
  props(rng: Rng, sub: Subscription, utcDay: string): Record<string, unknown>;
}

export interface DemoProfile {
  appId: string;
  /** Origin of the demo site, used for self-referrals after full page loads. */
  origin: string;
  visitsPerDay: { start: number; end: number };
  /** Index = Date.getUTCDay() (Sunday first). */
  weekdayFactor: readonly number[];
  /** 24 weights for UTC hours. */
  hourWeights: readonly number[];
  consent: { pending: number; accepted: number; declined: number };
  /** Chance that a known (consented) visitor comes back on a given day. */
  returnChancePerDay: number;
  pages: readonly Weighted<string>[];
  pageviews: { mean: number; max: number };
  /** Chance that a navigation is a full page load instead of a client-side navigation. */
  fullLoadChance: number;
  /** Chance that a cookieless visit ends with a late $web_vital in a new session without pageview. */
  vitalsOnlySessionChance: number;
  errorChancePerPageview: number;
  sources: readonly Weighted<Source>[];
  countries: readonly Weighted<string>[];
  devices: readonly Weighted<Device>[];
  clientEvents: readonly ClientEventDef[];
  serverEvents: readonly ServerEventDef[];
}
```

- [ ] **Step 5.2: Test profile and failing tests**

`scripts/demo/test-profile.ts`:

```ts
import type { DemoProfile } from "./profile.js";

/** Small, predictable profile for tests. Override fields per test. */
export function testProfile(over: Partial<DemoProfile> = {}): DemoProfile {
  return {
    appId: "demo",
    origin: "http://localhost:3000",
    visitsPerDay: { start: 20, end: 20 },
    weekdayFactor: [1, 1, 1, 1, 1, 1, 1],
    hourWeights: Array.from({ length: 24 }, () => 1),
    consent: { pending: 0.8, accepted: 0.15, declined: 0.05 },
    returnChancePerDay: 0.3,
    pages: [
      { value: "/", weight: 3 },
      { value: "/faq", weight: 1 },
    ],
    pageviews: { mean: 2, max: 5 },
    fullLoadChance: 0.3,
    vitalsOnlySessionChance: 0.1,
    errorChancePerPageview: 0.05,
    sources: [{ value: { referrer: null }, weight: 1 }],
    countries: [{ value: "DE", weight: 1 }],
    devices: [{ value: { browser: "Chrome", os: "Windows", deviceType: "desktop", viewport: [1920, 1080] }, weight: 1 }],
    clientEvents: [
      {
        name: "place_selected",
        paths: ["/"],
        chance: 0.5,
        props: (rng, visit) => {
          visit.place = rng.pick(["Köln", "Berlin"]);
          return { source: "search", place: visit.place };
        },
      },
    ],
    serverEvents: [
      {
        name: "calendar_poll",
        pool: { start: 2, end: 4 },
        pollsPerDay: { min: 1, max: 2 },
        newSubscription: (_rng, i) => ({ key: `s${i}`, kind: i % 2 === 0 ? "token" : "legacy", client: "apple" }),
        props: (_rng, sub, day) => ({
          subscription: sub.kind === "token" ? `tok-${sub.key}` : `leg-${sub.key}-${day}`,
          kind: sub.kind,
          client: sub.client,
        }),
      },
    ],
    ...over,
  };
}
```

`scripts/demo/simulate.test.ts`:

```ts
import { DAILY_VISITOR_PREFIX } from "rt-analytics/schema";
import { describe, expect, it } from "vitest";
import { toNdjsonLine } from "./ndjson.js";
import { createRng } from "./rng.js";
import { dailyVisitorId, generateDemoEvents, simulateVisit, type Visitor } from "./simulate.js";
import { testProfile } from "./test-profile.js";

const from = new Date("2026-07-01T00:00:00Z");
const days = 14;
const end = from.getTime() + days * 86_400_000;
const rows = generateDemoEvents(testProfile(), { from, days, seed: 7 });
const visitor = (over: Partial<Visitor> = {}): Visitor => ({
  key: "v1",
  kind: "pending",
  persistentId: null,
  device: { browser: "Chrome", os: "Windows", deviceType: "desktop", viewport: [1920, 1080] },
  country: "DE",
  ...over,
});

describe("generateDemoEvents", () => {
  it("is repeatable with the same seed", () => {
    const again = generateDemoEvents(testProfile(), { from, days, seed: 7 });
    expect(again.map(toNdjsonLine)).toEqual(rows.map(toNdjsonLine));
  });

  it("keeps every row inside [from, end) and sorted (Review Focus 4)", () => {
    expect(rows.length).toBeGreaterThan(100);
    for (const r of rows) {
      expect(r.timestamp.getTime()).toBeGreaterThanOrEqual(from.getTime());
      expect(r.timestamp.getTime()).toBeLessThan(end);
    }
    const times = rows.map((r) => r.timestamp.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("uses the demo app id and valid event names", () => {
    for (const r of rows) {
      expect(r.app_id).toBe("demo");
      expect(r.event_name).toMatch(/^\$?[a-z][a-z0-9_]*$/);
    }
  });

  it("gives server events no visitor, session or page data", () => {
    const polls = rows.filter((r) => r.event_name === "calendar_poll");
    expect(polls.length).toBeGreaterThan(0);
    for (const r of polls) {
      expect([r.visitor_id, r.session_id, r.page_path, r.country]).toEqual([null, null, null, null]);
      expect(r.consent_state).toBe("server");
    }
  });

  it("keeps token subscriptions stable and changes legacy ones every day", () => {
    const subs = rows
      .filter((r) => r.event_name === "calendar_poll")
      .map((r) => JSON.parse(r.props!) as { subscription: string; kind: string });
    const token = new Set(subs.filter((s) => s.kind === "token").map((s) => s.subscription));
    const legacy = new Set(subs.filter((s) => s.kind === "legacy").map((s) => s.subscription));
    expect(token.size).toBeLessThanOrEqual(2);
    expect(legacy.size).toBeGreaterThan(days);
  });

  it("mixes cookieless and persistent visitors", () => {
    const sessions = new Map<string, string>();
    for (const r of rows) if (r.session_id && r.visitor_id) sessions.set(r.session_id, r.visitor_id);
    const ids = [...sessions.values()];
    const daily = ids.filter((id) => id.startsWith(DAILY_VISITOR_PREFIX)).length / ids.length;
    expect(daily).toBeGreaterThan(0.6);
    expect(daily).toBeLessThan(0.95);
  });

  it("produces some sessions without a pageview", () => {
    const withPageview = new Set(rows.filter((r) => r.event_name === "$pageview").map((r) => r.session_id));
    const all = new Set(rows.filter((r) => r.session_id).map((r) => r.session_id));
    expect(all.size).toBeGreaterThan(withPageview.size);
  });
});

describe("simulateVisit", () => {
  it("starts a new session on every full page load for cookieless visitors", () => {
    const p = testProfile({ fullLoadChance: 1, pageviews: { mean: 4, max: 4 }, vitalsOnlySessionChance: 0, clientEvents: [] });
    const out = simulateVisit(p, createRng(1), visitor(), new Date("2026-07-01T10:00:00Z"));
    const pageviews = out.filter((r) => r.event_name === "$pageview");
    expect(new Set(pageviews.map((r) => r.session_id)).size).toBe(pageviews.length);
    expect(out.filter((r) => r.event_name === "$session_start").length).toBe(pageviews.length);
    expect(pageviews.slice(1).every((r) => r.referrer?.startsWith("http://localhost:3000/"))).toBe(true);
  });

  it("keeps one session over client-side navigations", () => {
    const p = testProfile({ fullLoadChance: 0, pageviews: { mean: 4, max: 4 }, vitalsOnlySessionChance: 0, clientEvents: [] });
    const out = simulateVisit(p, createRng(1), visitor(), new Date("2026-07-01T10:00:00Z"));
    expect(new Set(out.map((r) => r.session_id)).size).toBe(1);
  });

  it("splits session and visitor when consent is accepted", () => {
    const v = visitor({ kind: "accepted" });
    const p = testProfile({ fullLoadChance: 0, vitalsOnlySessionChance: 0, clientEvents: [] });
    const out = simulateVisit(p, createRng(2), v, new Date("2026-07-01T10:00:00Z"));
    const consent = out.find((r) => r.event_name === "$consent")!;
    expect(JSON.parse(consent.props!)).toEqual({ state: "accepted" });
    const before = out.filter((r) => r.timestamp < consent.timestamp);
    expect(before.every((r) => r.visitor_id!.startsWith("d_") && r.consent_state === "pending")).toBe(true);
    expect(consent.visitor_id!.startsWith("d_")).toBe(false);
    expect(consent.session_id).not.toBe(before[0]!.session_id);
    expect(v.persistentId).toBe(consent.visitor_id);
  });

  it("changes the daily id at 00:00 UTC", () => {
    expect(dailyVisitorId("v1", new Date("2026-07-01T23:59:59Z"))).not.toBe(
      dailyVisitorId("v1", new Date("2026-07-02T00:00:01Z")),
    );
    expect(dailyVisitorId("v1", new Date("2026-07-01T01:00:00Z"))).toBe(dailyVisitorId("v1", new Date("2026-07-01T22:00:00Z")));
  });
});

describe("toNdjsonLine", () => {
  it("writes ISO timestamps and props as JSON objects", () => {
    const row = rows.find((r) => r.props !== null)!;
    const parsed = JSON.parse(toNdjsonLine(row)) as { timestamp: string; props: unknown };
    expect(parsed.timestamp).toBe(row.timestamp.toISOString());
    expect(typeof parsed.props).toBe("object");
  });
});
```

Run: `npx vitest run scripts/demo`
Expected: FAIL, `./simulate.js` and `./ndjson.js` not found.

- [ ] **Step 5.3: Implement simulate and ndjson**

`scripts/demo/ndjson.ts`:

```ts
import type { EventRow } from "rt-analytics/schema";

/** One NDJSON line for a BigQuery load job: ISO timestamp, props as a JSON object (JSON column). */
export function toNdjsonLine(row: EventRow): string {
  return JSON.stringify({
    ...row,
    timestamp: row.timestamp.toISOString(),
    props: row.props === null ? null : (JSON.parse(row.props) as unknown),
  });
}
```

`scripts/demo/simulate.ts`:

```ts
// Simulates visits the way the rt-analytics SDK records them (see spec section 6, "Sessions"):
// cookieless sessions live in memory and restart on full page loads, accepting consent starts a new session
// with a new persistent visitor id, late web vitals can create sessions without a pageview, and daily ids
// change at 00:00 UTC.
import { createHash } from "node:crypto";
import { SDK_VERSION } from "rt-analytics";
import {
  DAILY_VISITOR_PREFIX,
  EVENTS,
  SERVER_CONSENT_STATE,
  type EventRow,
  type RowConsentState,
} from "rt-analytics/schema";
import type { DemoProfile, Device, ServerEventDef, Subscription, VisitState } from "./profile.js";
import { createRng, uuid, type Rng } from "./rng.js";

const DAY_MS = 86_400_000;

export interface Visitor {
  key: string;
  kind: "pending" | "accepted" | "declined";
  /** Set once the visitor accepted consent; reused on later visits. */
  persistentId: string | null;
  device: Device;
  country: string;
}

export interface GenerateOptions {
  from: Date;
  days: number;
  seed: number;
}

/** Same shape as the ingest's daily id (UTC day), but derived from a demo visitor key. */
export function dailyVisitorId(visitorKey: string, at: Date): string {
  const day = at.toISOString().slice(0, 10);
  return DAILY_VISITOR_PREFIX + createHash("sha256").update(`demo:${day}:${visitorKey}`).digest("hex").slice(0, 32);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function webVital(rng: Rng, metric: "LCP" | "CLS" | "INP", mobile: boolean): Record<string, unknown> {
  if (metric === "LCP") {
    const value = Math.round((900 + rng.next() * 2600) * (mobile ? 1.3 : 1));
    return { metric, value, rating: value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor" };
  }
  if (metric === "CLS") {
    const value = Math.round(rng.next() ** 3 * 0.4 * 1000) / 1000;
    return { metric, value, rating: value <= 0.1 ? "good" : value <= 0.25 ? "needs-improvement" : "poor" };
  }
  const value = Math.round(40 + rng.next() ** 2 * 500);
  return { metric, value, rating: value <= 200 ? "good" : value <= 500 ? "needs-improvement" : "poor" };
}

const ERRORS = [
  "TypeError: Cannot read properties of undefined (reading 'lat')",
  "Failed to fetch",
  "ChunkLoadError: Loading chunk 742 failed.",
];

export function simulateVisit(profile: DemoProfile, rng: Rng, visitor: Visitor, start: Date): EventRow[] {
  const rows: EventRow[] = [];
  const source = rng.weighted(profile.sources).value;
  const mobile = visitor.device.deviceType !== "desktop";
  let decided = visitor.kind === "pending" || visitor.persistentId !== null;
  let consent: RowConsentState = visitor.persistentId !== null ? "accepted" : "pending";
  let persistentId = visitor.persistentId;
  let sessionId = "";
  let t = start.getTime();
  let path = rng.weighted(profile.pages).value;
  let referrer = source.referrer;
  let utm = source.utm ?? null;
  const visit: VisitState = { place: null };
  const happened = new Set<string>();

  const push = (name: string, props: Record<string, unknown>) => {
    const at = new Date(t);
    rows.push({
      event_id: uuid(rng),
      app_id: profile.appId,
      event_name: name,
      timestamp: at,
      visitor_id: persistentId ?? dailyVisitorId(visitor.key, at),
      session_id: sessionId,
      user_id: null,
      page_path: path,
      referrer,
      utm_source: utm?.source ?? null,
      utm_medium: utm?.medium ?? null,
      utm_campaign: utm?.campaign ?? null,
      country: visitor.country,
      browser: visitor.device.browser,
      os: visitor.device.os,
      device_type: visitor.device.deviceType,
      viewport_w: visitor.device.viewport[0],
      viewport_h: visitor.device.viewport[1],
      props: Object.keys(props).length > 0 ? JSON.stringify(props) : null,
      consent_state: consent,
      sdk_version: SDK_VERSION,
    });
    t += 200 + rng.int(0, 2000);
  };
  const newSession = () => {
    sessionId = uuid(rng);
    push(EVENTS.sessionStart, {});
  };

  const pageviews = Math.min(
    profile.pageviews.max,
    1 + Math.floor(-Math.log(1 - rng.next()) * Math.max(0, profile.pageviews.mean - 1)),
  );
  newSession();
  for (let i = 0; i < pageviews; i++) {
    let fullLoad = i === 0;
    if (i > 0) {
      t += rng.int(20, 180) * 1000;
      const previous = path;
      path = rng.weighted(profile.pages).value;
      utm = null; // UTM parameters are only in the landing URL
      fullLoad = rng.chance(profile.fullLoadChance);
      if (fullLoad) {
        referrer = `${profile.origin}${previous}`;
        if (persistentId === null) newSession(); // in-memory sessions do not survive a full page load
      }
    }
    push(EVENTS.pageview, {});
    if (fullLoad) {
      push(EVENTS.webVital, webVital(rng, "LCP", mobile));
      push(EVENTS.webVital, webVital(rng, "CLS", mobile));
    }

    if (!decided) {
      decided = true;
      t += rng.int(3, 30) * 1000;
      if (visitor.kind === "accepted") {
        persistentId = uuid(rng);
        visitor.persistentId = persistentId;
        consent = "accepted";
        newSession(); // switching to sessionStorage starts a new session
        push(EVENTS.consent, { state: "accepted" });
      } else {
        consent = "declined";
        push(EVENTS.consent, { state: "declined" });
      }
    }

    for (const def of profile.clientEvents) {
      if (!def.paths.includes(path)) continue;
      if (def.after && !happened.has(def.after)) continue;
      if (!rng.chance(def.chance)) continue;
      t += rng.int(5, 60) * 1000;
      push(def.name, def.props(rng, visit));
      happened.add(def.name);
    }
    if (rng.chance(profile.errorChancePerPageview)) {
      push(EVENTS.error, {
        message: rng.pick(ERRORS),
        source: `${profile.origin}/_next/static/chunks/app.js`,
        line: rng.int(1, 4000),
      });
    }
    if (rng.chance(0.6)) push(EVENTS.webVital, webVital(rng, "INP", mobile));
  }

  if (persistentId === null && rng.chance(profile.vitalsOnlySessionChance)) {
    t += 31 * 60 * 1000 + rng.int(0, 600) * 1000; // tab hidden after the 30-minute session timeout
    newSession();
    push(EVENTS.webVital, webVital(rng, "INP", mobile));
  }
  return rows;
}

function serverRow(appId: string, name: string, at: Date, props: Record<string, unknown>, rng: Rng): EventRow {
  return {
    event_id: uuid(rng),
    app_id: appId,
    event_name: name,
    timestamp: at,
    visitor_id: null,
    session_id: null,
    user_id: null,
    page_path: null,
    referrer: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    country: null,
    browser: null,
    os: null,
    device_type: null,
    viewport_w: null,
    viewport_h: null,
    props: JSON.stringify(props),
    consent_state: SERVER_CONSENT_STATE,
    sdk_version: SDK_VERSION,
  };
}

function simulateServerEvents(profile: DemoProfile, def: ServerEventDef, rng: Rng, opts: GenerateOptions): EventRow[] {
  const rows: EventRow[] = [];
  const subs: Subscription[] = [];
  for (let d = 0; d < opts.days; d++) {
    const dayStart = opts.from.getTime() + d * DAY_MS;
    const progress = opts.days > 1 ? d / (opts.days - 1) : 1;
    const target = Math.round(lerp(def.pool.start, def.pool.end, progress));
    while (subs.length < target) subs.push(def.newSubscription(rng, subs.length));
    const day = new Date(dayStart).toISOString().slice(0, 10);
    for (const sub of subs) {
      const polls = rng.int(def.pollsPerDay.min, def.pollsPerDay.max);
      for (let p = 0; p < polls; p++) {
        const at = new Date(dayStart + rng.int(0, DAY_MS / 1000 - 1) * 1000);
        rows.push(serverRow(profile.appId, def.name, at, def.props(rng, sub, day), rng));
      }
    }
  }
  return rows;
}

export function generateDemoEvents(profile: DemoProfile, opts: GenerateOptions): EventRow[] {
  const rng = createRng(opts.seed);
  const rows: EventRow[] = [];
  const known = new Set<Visitor>();
  let counter = 0;
  const consentKinds = [
    { kind: "pending" as const, weight: profile.consent.pending },
    { kind: "accepted" as const, weight: profile.consent.accepted },
    { kind: "declined" as const, weight: profile.consent.declined },
  ];
  const hours = profile.hourWeights.map((weight, hour) => ({ hour, weight }));

  for (let d = 0; d < opts.days; d++) {
    const dayStart = opts.from.getTime() + d * DAY_MS;
    const progress = opts.days > 1 ? d / (opts.days - 1) : 1;
    const base = lerp(profile.visitsPerDay.start, profile.visitsPerDay.end, progress);
    const weekday = new Date(dayStart).getUTCDay();
    const visits = Math.round(base * (profile.weekdayFactor[weekday] ?? 1) * (0.85 + rng.next() * 0.3));
    const today: Visitor[] = [];
    for (const v of known) if (today.length < visits && rng.chance(profile.returnChancePerDay)) today.push(v);
    while (today.length < visits) {
      today.push({
        key: `v${counter++}`,
        kind: rng.weighted(consentKinds).kind,
        persistentId: null,
        device: rng.weighted(profile.devices).value,
        country: rng.weighted(profile.countries).value,
      });
    }
    for (const v of today) {
      const start = new Date(dayStart + rng.weighted(hours).hour * 3_600_000 + rng.int(0, 3599) * 1000);
      rows.push(...simulateVisit(profile, rng, v, start));
      if (v.persistentId !== null) known.add(v);
    }
  }
  for (const def of profile.serverEvents) rows.push(...simulateServerEvents(profile, def, rng, opts));

  const end = opts.from.getTime() + opts.days * DAY_MS;
  return rows.filter((r) => r.timestamp.getTime() < end).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
```

- [ ] **Step 5.4: Run tests**

Run: `npx vitest run scripts/demo`
Expected: PASS. If the "mixes cookieless and persistent" ratio fails, check the consent split logic before touching the bounds (the bounds follow from 80/15/5 with returning visitors).

- [ ] **Step 5.5: The dwd profile**

`scripts/demo/dwd-profile.ts`:

```ts
// Demo profile modeled on wetter-in-kalender.de (dwd): place search, subscribe buttons and calendar polls.
// Paths match apps/demo, so live demo events join the generated history.
import { createHash } from "node:crypto";
import type { DemoProfile } from "./profile.js";

const PLACES = ["Düsseldorf", "Köln", "Berlin", "Hamburg", "München", "Leipzig", "Wien", "Zürich"];
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

export const dwdProfile: DemoProfile = {
  appId: "demo",
  origin: "http://localhost:3000",
  visitsPerDay: { start: 40, end: 120 },
  weekdayFactor: [0.8, 1.1, 1.05, 1, 1, 0.95, 0.75],
  // UTC hours: morning and evening peaks in Berlin time (UTC+1/+2).
  hourWeights: [1, 0.5, 0.3, 0.3, 1, 3, 5, 5, 4, 3, 3, 3, 3, 3, 3, 3, 4, 5, 5, 4, 3, 2, 1.5, 1],
  consent: { pending: 0.8, accepted: 0.15, declined: 0.05 },
  returnChancePerDay: 0.12,
  pages: [
    { value: "/", weight: 70 },
    { value: "/faq", weight: 12 },
    { value: "/about", weight: 10 },
    { value: "/privacy", weight: 8 },
  ],
  pageviews: { mean: 2.2, max: 8 },
  fullLoadChance: 0.3,
  vitalsOnlySessionChance: 0.03,
  errorChancePerPageview: 0.01,
  sources: [
    { value: { referrer: null }, weight: 45 },
    { value: { referrer: "https://www.google.com/" }, weight: 30 },
    { value: { referrer: "https://duckduckgo.com/" }, weight: 5 },
    { value: { referrer: "https://www.reddit.com/" }, weight: 5 },
    { value: { referrer: "https://mastodon.social/" }, weight: 7 },
    { value: { referrer: null, utm: { source: "newsletter", medium: "email", campaign: "autumn" } }, weight: 8 },
  ],
  countries: [
    { value: "DE", weight: 85 },
    { value: "AT", weight: 6 },
    { value: "CH", weight: 5 },
    { value: "NL", weight: 2 },
    { value: "US", weight: 2 },
  ],
  devices: [
    { value: { browser: "Chrome", os: "Windows", deviceType: "desktop", viewport: [1920, 1080] }, weight: 25 },
    { value: { browser: "Safari", os: "iOS", deviceType: "mobile", viewport: [390, 844] }, weight: 30 },
    { value: { browser: "Chrome", os: "Android", deviceType: "mobile", viewport: [412, 915] }, weight: 20 },
    { value: { browser: "Safari", os: "macOS", deviceType: "desktop", viewport: [1512, 982] }, weight: 12 },
    { value: { browser: "Firefox", os: "Linux", deviceType: "desktop", viewport: [1366, 768] }, weight: 5 },
    { value: { browser: "Edge", os: "Windows", deviceType: "desktop", viewport: [1536, 864] }, weight: 5 },
    { value: { browser: "Safari", os: "iOS", deviceType: "tablet", viewport: [820, 1180] }, weight: 3 },
  ],
  clientEvents: [
    {
      name: "place_selected",
      paths: ["/"],
      chance: 0.55,
      props: (rng, visit) => {
        visit.place = rng.pick(PLACES);
        const source = rng.weighted([
          { value: "search", weight: 60 },
          { value: "suggestion", weight: 25 },
          { value: "ip", weight: 15 },
        ]).value;
        return { source, place: visit.place };
      },
    },
    {
      name: "subscribe_click",
      paths: ["/"],
      chance: 0.3,
      after: "place_selected",
      props: (rng, visit) => ({
        target: rng.weighted([
          { value: "apple", weight: 35 },
          { value: "google", weight: 30 },
          { value: "outlook", weight: 15 },
          { value: "copy", weight: 20 },
        ]).value,
        place: visit.place,
        fields: rng.pick(["temp,rain", "temp,rain,wind", "temp", "temp,rain,uv"]),
      }),
    },
  ],
  serverEvents: [
    {
      name: "calendar_poll",
      pool: { start: 15, end: 140 },
      pollsPerDay: { min: 2, max: 6 },
      newSubscription: (rng, i) => ({
        key: `sub${i}`,
        kind: rng.chance(0.85) ? "token" : "legacy",
        client: rng.weighted([
          { value: "apple", weight: 40 },
          { value: "google", weight: 35 },
          { value: "outlook", weight: 15 },
          { value: "browser", weight: 5 },
          { value: "other", weight: 5 },
        ]).value,
      }),
      props: (_rng, sub, day) => ({
        subscription: hash(sub.kind === "token" ? `demo-token:${sub.key}` : `demo-legacy:${sub.key}:${day}`),
        kind: sub.kind,
        client: sub.client,
      }),
    },
  ],
};
```

Add to `simulate.test.ts`:

```ts
import { dwdProfile } from "./dwd-profile.js";

describe("dwdProfile", () => {
  it("generates a realistic volume for 90 days", () => {
    const all = generateDemoEvents(dwdProfile, { from, days: 90, seed: 42 });
    expect(all.length).toBeGreaterThan(30_000);
    expect(all.length).toBeLessThan(300_000);
    expect(new Set(all.map((r) => r.event_name))).toEqual(
      new Set(["$session_start", "$pageview", "$web_vital", "$consent", "$error", "place_selected", "subscribe_click", "calendar_poll"]),
    );
  });
});
```

Run: `npx vitest run scripts/demo` → PASS.

- [ ] **Step 5.6: Lint and commit**

```bash
npx eslint scripts && npm run typecheck
git add scripts/demo && git commit -m "feat(demo): seeded demo data generator modeled on dwd"
```

---

### Task 6: Load CLI (PR 4 part 2, branch `feat/demo-data`)

**Files:**
- Create: `scripts/generate-demo-data.ts`, `scripts/demo/load-plan.ts`, `scripts/demo/load-plan.test.ts`
- Modify: root `package.json` (script `demo:generate`)

**Interfaces:**
- Consumes: `generateDemoEvents`, `dwdProfile`, `toNdjsonLine` (Task 5).
- Produces: `planLoad(existingDemoRows: number, replace: boolean): "load" | "replace-then-load" | "refuse"`; CLI `npm run demo:generate -- [--days 90] [--seed 42] [--project <id>] [--dataset analytics] [--replace] [--dry-run]`.

- [ ] **Step 6.1: Failing test (Review Focus 3)**

`scripts/demo/load-plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planLoad } from "./load-plan.js";

describe("planLoad", () => {
  it("loads into an empty table", () => expect(planLoad(0, false)).toBe("load"));
  it("refuses to duplicate existing demo rows", () => expect(planLoad(5, false)).toBe("refuse"));
  it("replaces when asked", () => expect(planLoad(5, true)).toBe("replace-then-load"));
  it("replace on an empty table just loads", () => expect(planLoad(0, true)).toBe("load"));
});
```

Run: `npx vitest run scripts/demo/load-plan.test.ts` → FAIL (module missing).

- [ ] **Step 6.2: Implement `load-plan.ts`**

```ts
/** Decides what the demo loader does, so a second run never duplicates the demo history. */
export function planLoad(existingDemoRows: number, replace: boolean): "load" | "replace-then-load" | "refuse" {
  if (existingDemoRows === 0) return "load";
  return replace ? "replace-then-load" : "refuse";
}
```

Run the test → PASS.

- [ ] **Step 6.3: CLI**

`scripts/generate-demo-data.ts`:

```ts
// Usage: npm run demo:generate -- [--days 90] [--seed 42] [--project <id>] [--dataset analytics] [--replace] [--dry-run]
// Generates demo events (app_id "demo", dwd profile) for the given number of days ending yesterday (UTC) and
// loads them into <dataset>.events with a BigQuery load job (free). Uses your gcloud application default
// credentials. Refuses when older demo rows exist, unless --replace (deletes demo rows before today first).
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { BigQuery } from "@google-cloud/bigquery";
import { dwdProfile } from "./demo/dwd-profile.js";
import { planLoad } from "./demo/load-plan.js";
import { toNdjsonLine } from "./demo/ndjson.js";
import { generateDemoEvents } from "./demo/simulate.js";

const DAY_MS = 86_400_000;
const { values } = parseArgs({
  options: {
    days: { type: "string", default: "90" },
    seed: { type: "string", default: "42" },
    project: { type: "string" },
    dataset: { type: "string", default: "analytics" },
    replace: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

const days = Number(values.days);
const seed = Number(values.seed);
if (!Number.isInteger(days) || days < 1 || !Number.isInteger(seed)) {
  console.error("--days and --seed must be whole numbers, --days at least 1");
  process.exit(2);
}
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const from = new Date(today.getTime() - days * DAY_MS);
const rows = generateDemoEvents(dwdProfile, { from, days, seed });

const counts = new Map<string, number>();
for (const r of rows) counts.set(r.event_name, (counts.get(r.event_name) ?? 0) + 1);
console.log(`${rows.length} rows from ${from.toISOString().slice(0, 10)} to ${new Date(today.getTime() - DAY_MS).toISOString().slice(0, 10)}`);
for (const [name, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${name.padEnd(16)} ${n}`);
if (values["dry-run"]) process.exit(0);

const project = values.project ?? execFileSync("gcloud", ["config", "get-value", "project"], { encoding: "utf8" }).trim();
const table = `\`${project}.${values.dataset}.events\``;
const bq = new BigQuery({ projectId: project, location: "EU" });
const params = { app: dwdProfile.appId, before: today };

const [[existing]] = (await bq.query({
  query: `SELECT COUNT(*) AS n FROM ${table} WHERE app_id = @app AND timestamp < @before`,
  params,
})) as [Array<{ n: number }>];
const plan = planLoad(Number(existing?.n ?? 0), values.replace);
if (plan === "refuse") {
  console.error(`${existing?.n} demo rows before today already exist in ${table}. Run again with --replace.`);
  process.exit(1);
}
if (plan === "replace-then-load") {
  await bq.query({ query: `DELETE FROM ${table} WHERE app_id = @app AND timestamp < @before`, params });
  console.log(`deleted ${existing?.n} old demo rows`);
}

const dir = mkdtempSync(join(tmpdir(), "rta-demo-"));
const file = join(dir, "events.ndjson");
try {
  writeFileSync(file, rows.map(toNdjsonLine).join("\n") + "\n");
  const [job] = await bq.dataset(values.dataset).table("events").load(file, {
    sourceFormat: "NEWLINE_DELIMITED_JSON",
    writeDisposition: "WRITE_APPEND",
  });
  const errors = job.status?.errors;
  if (errors?.length) throw new Error(JSON.stringify(errors));
  console.log(`loaded ${rows.length} rows into ${table}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
```

Root `package.json` script: `"demo:generate": "tsx scripts/generate-demo-data.ts"`.

- [ ] **Step 6.4: Dry run, lint, commit**

```bash
npm run demo:generate -- --dry-run
npx eslint scripts && npm run typecheck && npx vitest run scripts
git add scripts package.json && git commit -m "feat(demo): load CLI for demo data (refuses duplicates, --replace)"
```

Expected dry-run output: tens of thousands of rows, all eight event names listed.

---

### Task 7: Demo app (PR 4 part 3, branch `feat/demo-data`)

**Files:**
- Modify: `apps/demo/app/layout.tsx`, `apps/demo/app/page.tsx`, `apps/demo/app/api/a/route.ts`, `apps/demo/package.json`
- Create: `apps/demo/app/nav.tsx`, `apps/demo/app/faq/page.tsx`, `apps/demo/app/about/page.tsx`, `apps/demo/app/privacy/page.tsx`, `apps/demo/app/api/cal/route.ts`, `apps/demo/events.ts`, `apps/demo/eslint.config.mjs`, `claude-tmp-helpers/smoke-demo.sh`

**Interfaces:**
- Consumes: `rt-analytics/react` (`AnalyticsProvider`, `ConsentBanner`, `useAnalytics`), `rt-analytics/next/client` (`PageviewTracker`), `rt-analytics/next` (`createAnalyticsHandler`, `createServerTracker`).
- Produces: demo app sending `place_selected`, `subscribe_click`, `calendar_poll` with the same props as `dwdProfile`, at paths `/`, `/faq`, `/about`, `/privacy`.

- [ ] **Step 7.1: Event types and layout**

`apps/demo/events.ts`:

```ts
// Same events and props as scripts/demo/dwd-profile.ts, so live events join the generated history.
export type DemoEvents = {
  place_selected: { source: "search" | "suggestion" | "ip"; place: string };
  subscribe_click: { target: "apple" | "google" | "outlook" | "copy"; place: string; fields: string };
};
```

`apps/demo/app/nav.tsx`:

```tsx
import Link from "next/link";

// Link = client-side navigation (same session); <a> = full page load (new session when cookieless).
export function Nav() {
  return (
    <nav style={{ display: "flex", gap: 12 }}>
      <Link href="/">Home</Link>
      <Link href="/faq">FAQ</Link>
      <Link href="/about">About</Link>
      <a href="/privacy">Privacy (full page load)</a>
    </nav>
  );
}
```

`apps/demo/app/layout.tsx`:

```tsx
import { PageviewTracker } from "rt-analytics/next/client";
import { AnalyticsProvider, ConsentBanner } from "rt-analytics/react";
import { Nav } from "./nav";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AnalyticsProvider appId="demo">
          <PageviewTracker />
          <Nav />
          {children}
          <ConsentBanner />
        </AnalyticsProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 7.2: Pages**

`apps/demo/app/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useAnalytics } from "rt-analytics/react";
import type { DemoEvents } from "../events";

const PLACES = ["Düsseldorf", "Köln", "Berlin"];
const TARGETS = ["apple", "google", "outlook", "copy"] as const;

export default function Home() {
  const analytics = useAnalytics<DemoEvents>();
  const [place, setPlace] = useState<string | null>(null);
  return (
    <main>
      <h1>rt-analytics demo</h1>
      <p>Pick a place, then subscribe. Events go to app_id &quot;demo&quot;.</p>
      {PLACES.map((p) => (
        <button
          key={p}
          onClick={() => {
            setPlace(p);
            analytics.track("place_selected", { source: "search", place: p });
          }}
        >
          {p}
        </button>
      ))}
      {place && (
        <div>
          {TARGETS.map((target) => (
            <button key={target} onClick={() => analytics.track("subscribe_click", { target, place, fields: "temp,rain" })}>
              Subscribe ({target})
            </button>
          ))}
        </div>
      )}
      <button onClick={() => analytics.flush()}>Flush now</button>
    </main>
  );
}
```

`apps/demo/app/faq/page.tsx`, `about/page.tsx`, `privacy/page.tsx` (one each, title changes):

```tsx
export default function Page() {
  return (
    <main>
      <h1>FAQ</h1>
      <p>Static demo page.</p>
    </main>
  );
}
```

- [ ] **Step 7.3: Ingest and calendar route**

`apps/demo/app/api/a/route.ts`:

```ts
import { createAnalyticsHandler } from "rt-analytics/next";

export const { GET, POST } = createAnalyticsHandler({ allowedAppIds: ["demo"] });
```

`apps/demo/app/api/cal/route.ts`:

```ts
import { createServerTracker } from "rt-analytics/next";

const tracker = createServerTracker({ appId: "demo" });

// Mimics dwd's calendar feed: /api/cal?s=<16 hex> records one calendar_poll per request.
export async function GET(req: Request): Promise<Response> {
  const s = new URL(req.url).searchParams.get("s") ?? "";
  if (/^[0-9a-f]{16}$/.test(s)) {
    const subscription = tracker.pseudonymize(`s:${s}`);
    if (subscription) await tracker.track("calendar_poll", { subscription, kind: "token", client: "browser" });
  }
  return new Response("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n", {
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" },
  });
}
```

- [ ] **Step 7.4: Scripts and lint config**

`apps/demo/package.json` scripts (Next only loads `.env*` from the app folder, so the root credentials are loaded explicitly; `--env-file-if-exists` needs Node ≥ 22.9):

```json
  "scripts": {
    "dev": "node --env-file-if-exists=../../.env.analytics ../../node_modules/next/dist/bin/next dev",
    "build": "next build",
    "start": "node --env-file-if-exists=../../.env.analytics ../../node_modules/next/dist/bin/next start",
    "lint": "eslint ."
  },
```

Add dev dependencies with current versions: `eslint-config-next`, `eslint`, `@types/react`, `@types/node`. `apps/demo/eslint.config.mjs`:

```js
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default [...nextVitals, ...nextTs, { ignores: [".next/**", "next-env.d.ts"] }];
```

(`eslint-config-next` 16.4 exports `.`, `./core-web-vitals`, `./typescript` and `./parser` as flat configs.)

- [ ] **Step 7.5: Build and smoke test**

`claude-tmp-helpers/smoke-demo.sh`:

```bash
#!/usr/bin/env bash
# Usage: claude-tmp-helpers/smoke-demo.sh
# Builds and starts apps/demo, posts one demo batch to /api/a and polls /api/cal once, then stops the server.
# The rows land in BigQuery with app_id "demo" (real table, demo app id).
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build -w rt-analytics-demo >/dev/null
(cd apps/demo && npm run start -- -p 3100 > /tmp/rta-demo.log 2>&1 &) ; sleep 6
ua="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"
id="smoke-$(date +%s)"
body='{"appId":"demo","sdkVersion":"smoke","consentState":"pending","events":[{"eventId":"'"$(uuidgen)"'","name":"place_selected","ts":"'"$(date -u +%FT%T.000Z)"'","sessionId":"'"$id"'","visitorId":null,"userId":null,"pagePath":"/","referrer":null,"utmSource":null,"utmMedium":null,"utmCampaign":null,"viewportW":1920,"viewportH":1080,"props":{"source":"search","place":"Köln"}}]}'
curl -s -o /dev/null -w "POST /api/a -> %{http_code}\n" -A "$ua" -H "content-type: application/json" -d "$body" http://localhost:3100/api/a
curl -s -o /dev/null -w "GET /api/cal -> %{http_code}\n" "http://localhost:3100/api/cal?s=0123456789abcdef"
sleep 3; pkill -f "next start -p 3100" || true
grep -iE "error|not set" /tmp/rta-demo.log || echo "no errors logged"
echo "session id: $id"
```

```bash
chmod +x claude-tmp-helpers/smoke-demo.sh
npm run lint -w rt-analytics-demo && npm run build -w rt-analytics-demo
claude-tmp-helpers/smoke-demo.sh
bq query --use_legacy_sql=false --location=EU \
  "SELECT event_name, consent_state, visitor_id IS NOT NULL AS has_visitor FROM \`robin-thues.analytics.events\` WHERE app_id = 'demo' AND timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 10 MINUTE)"
```

Expected: `POST /api/a -> 202`, `GET /api/cal -> 200`, "no errors logged"; BigQuery shows one `place_selected` (pending, `has_visitor` true via the daily id) and one `calendar_poll` (server, `has_visitor` false). If the log says credentials are not set, the `--env-file-if-exists` path is wrong: fix it before going on.

- [ ] **Step 7.6: Commit**

```bash
git add apps/demo package.json package-lock.json
git commit -m "feat(demo): example becomes the demo app (appId demo) with dwd-like events and a calendar route"
```

---

### Task 8: Load 90 days of demo data (operational, branch `feat/demo-data`)

No code changes; uses Robin's `gcloud` application default credentials (present on this machine). Writes only `app_id = 'demo'` rows.

- [ ] **Step 8.1: Dry run and load**

```bash
npm run demo:generate -- --dry-run
npm run demo:generate -- --project robin-thues
```

Expected: "loaded N rows". If it refuses because demo rows exist (e.g. from Task 7's smoke test, which are today's rows and are not counted), read the message; only use `--replace` for rows before today.

- [ ] **Step 8.2: Verify in BigQuery**

```bash
bq query --use_legacy_sql=false --location=EU "
SELECT DATE(timestamp, 'Europe/Berlin') AS day, COUNTIF(event_name = '\$pageview') AS pageviews,
  COUNT(DISTINCT IF(event_name = '\$pageview', session_id, NULL)) AS sessions,
  COUNT(DISTINCT visitor_id) AS visitors, COUNTIF(event_name = 'calendar_poll') AS polls
FROM \`robin-thues.analytics.events\`
WHERE app_id = 'demo' AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 100 DAY)
GROUP BY day ORDER BY day DESC LIMIT 10"
claude-tmp-helpers/dry-run-template.sh sql/templates/retention.sql
```

Expected: rows for the last days with growing numbers, weekday dips; dry run validates. Also check that no other app's rows changed: `SELECT app_id, COUNT(*) ... GROUP BY app_id` before and after Step 8.1 (only `demo` grows).

- [ ] **Step 8.3: Phase A wrap-up**

```bash
npm test && npm run typecheck && npm run lint && npm run format:check
git log --oneline main..feat/demo-data
```

Then: one fresh reviewer checks the whole Phase A diff (`main..feat/demo-data`) against the spec and this plan. After that, ask Robin to push the four branches and open the PRs in order (`chore/monorepo` → `chore/lint-library` → `feat/schema-entry` → `feat/demo-data`).
