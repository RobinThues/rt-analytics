// The only place that runs SQL. Never throws: panels get a result they can render (spec section 5).
export type QueryParam = string | number | boolean | string[] | null;

/** Every query's name; it becomes the `rtd_query` job label and the fixture file prefix. */
export const QUERY_NAMES = [
  "kpis",
  "traffic",
  "breakdown",
  "web_vitals",
  "slow_pages",
  "top_errors",
  "consent",
  "retention",
  "event_list",
  "event_series",
  "event_breakdown",
  "prop_values",
  "funnel",
  "app_list",
  "event_names",
  "prop_keys",
  "settings_read",
  "settings_save",
  "funnels_list",
  "funnel_save",
  "funnel_delete",
  /** Test-only and dry-run-only specs. */
  "check",
] as const;
export type QueryName = (typeof QUERY_NAMES)[number];

/** Where a job comes from; the `rtd_source` job label. */
export const JOB_SOURCES = ["production", "development", "e2e"] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export interface QuerySpec {
  name: QueryName;
  sql: string;
  params: Record<string, QueryParam>;
  /** Needed for array params (`["STRING"]`), because an empty array has no type BigQuery can infer. */
  types?: Record<string, string | string[]>;
}

export type QueryResult<T> = { ok: true; rows: T[] } | { ok: false; error: "bytes-cap" | "failed"; message: string };

export interface QueryClient {
  query(options: Record<string, unknown>): Promise<[unknown[], ...unknown[]]>;
}

/** Converts BigQuery's value classes (dates, timestamps, Big.js numbers) to plain JSON for cache and React. */
export function toPlain(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  const v = value as Record<string, unknown> & { toNumber?: () => number };
  if (typeof v.toNumber === "function") return v.toNumber();
  // BigQuery's value classes (BigQueryDate, BigQueryTimestamp, ...) hold a single `value`; plain result rows
  // can have a column named value too, so only class instances are unwrapped.
  const isClassInstance = Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null;
  if (isClassInstance && typeof v.value === "string" && Object.keys(v).length === 1) return v.value;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)]));
}

function isBytesCap(err: unknown): boolean {
  const e = err as { errors?: Array<{ reason?: string }>; message?: string };
  return (
    e.errors?.some((x) => x.reason === "bytesBilledLimitExceeded") === true || /bytes billed/i.test(e.message ?? "")
  );
}

export async function runQuery<T>(
  client: QueryClient,
  spec: QuerySpec,
  maxBytes: number,
  source: JobSource,
): Promise<QueryResult<T>> {
  try {
    const [rows] = await client.query({
      query: spec.sql,
      params: spec.params,
      ...(spec.types ? { types: spec.types } : {}),
      location: "EU",
      maximumBytesBilled: String(maxBytes),
      labels: { rtd_source: source, rtd_query: spec.name },
    });
    return { ok: true, rows: rows.map((r) => toPlain(r) as T) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: isBytesCap(err) ? "bytes-cap" : "failed", message };
  }
}
