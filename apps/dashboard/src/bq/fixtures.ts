// e2e fixtures (spec 2026-10-19-e2e-bigquery-cost, part D): a QueryClient that replays recorded BigQuery
// results from files, and one that records them while running the real query. Local runs only; env.ts refuses
// DASHBOARD_FIXTURES in deployments. The files are committed to a public repo, so the recorder only records
// the synthetic demo apps.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toPlain, type QueryClient } from "./run-query";

/** The only apps whose results may be recorded. `demo-b` has no events; the app-switch tests use it. */
export const FIXTURE_APPS = ["demo", "demo-b"] as const;

type Options = Record<string, unknown>;

/** JSON with object keys sorted at every level, so equal values always give equal text. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const queryName = (options: Options) => (options.labels as { rtd_query?: string } | undefined)?.rtd_query ?? "query";

/** `<query name>-<hash of SQL, params and types>.json`; the byte cap and job source do not change it. */
export function fixtureFile(options: Options): string {
  const key = stableJson({ query: options.query, params: options.params ?? {}, types: options.types ?? null });
  return `${queryName(options)}-${createHash("sha256").update(key).digest("hex").slice(0, 16)}.json`;
}

export function createReplayClient(dir: string, delayMs = 150): QueryClient {
  return {
    async query(options) {
      // A small delay so tests still see skeletons and dimmed states between loads.
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const file = fixtureFile(options);
      let text: string;
      try {
        text = readFileSync(join(dir, file), "utf8");
      } catch {
        console.error("[rtd] no e2e fixture", file);
        throw new Error(`No e2e fixture ${file}. Run npm run e2e:record.`);
      }
      return [JSON.parse(text) as unknown[]];
    },
  };
}

export function createRecordClient(real: QueryClient, dir: string): QueryClient {
  const allowed = new Set<string>(FIXTURE_APPS);
  return {
    async query(options) {
      const appId = (options.params as Record<string, unknown> | undefined)?.app_id;
      if (typeof appId === "string" && !allowed.has(appId)) {
        throw new Error(`Refusing to record app ${appId}: fixtures may only hold ${FIXTURE_APPS.join(", ")}`);
      }
      const [rows] = await real.query(options);
      let plain = rows.map((r) => toPlain(r));
      if (queryName(options) === "app_list") {
        const ids = new Set(plain.map((r) => (r as { app_id: string }).app_id).filter((id) => allowed.has(id)));
        ids.add("demo-b");
        plain = [...ids].sort().map((app_id) => ({ app_id }));
      }
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, fixtureFile(options)), `${JSON.stringify(plain, null, 2)}\n`);
      return [plain];
    },
  };
}
