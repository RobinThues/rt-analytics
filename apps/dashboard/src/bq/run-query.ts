// The only place that runs SQL. Never throws: panels get a result they can render (spec section 5).
export interface QuerySpec {
  sql: string;
  params: Record<string, string | number | boolean | string[] | null>;
  types?: Record<string, string>;
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

export async function runQuery<T>(client: QueryClient, spec: QuerySpec, maxBytes: number): Promise<QueryResult<T>> {
  try {
    const [rows] = await client.query({
      query: spec.sql,
      params: spec.params,
      ...(spec.types ? { types: spec.types } : {}),
      location: "EU",
      maximumBytesBilled: String(maxBytes),
    });
    return { ok: true, rows: rows.map((r) => toPlain(r) as T) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: isBytesCap(err) ? "bytes-cap" : "failed", message };
  }
}
