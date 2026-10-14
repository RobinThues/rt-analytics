// Pure cache rules (spec section 5). All tags start with rtd: because the Hobby runtime cache is shared by
// all projects of the team.
import type { QueryResult } from "./run-query";

export const TAGS = {
  data: (appId: string) => `rtd:bq:${appId}`,
  discovery: (appId: string) => `rtd:discovery:${appId}`,
  apps: "rtd:apps",
  config: "rtd:config",
} as const;

export const DAY_SECONDS = 86_400;

export function cacheProfile(ttl: number) {
  return { stale: Math.min(300, ttl), revalidate: ttl, expire: 2 * ttl };
}

export function usesCache(opts: { live: boolean; ttl: number }): boolean {
  return !opts.live && opts.ttl > 0;
}

const FAILURE_PREFIX = "rtd-query-failure:";

/**
 * Inside the cached function: failures throw, so they are never stored in the cache. The failure code goes
 * into `digest` too: in production React replaces the message across the 'use cache' boundary and keeps
 * only the digest.
 */
export function rowsOrThrow<T>(res: QueryResult<T>): T[] {
  if (res.ok) return res.rows;
  throw Object.assign(new Error(`${FAILURE_PREFIX}${res.error}:${res.message}`), {
    digest: `${FAILURE_PREFIX}${res.error}`,
  });
}

/** Outside the cached function: turns a thrown failure back into a result panels can render. */
export function failureFrom(err: unknown): QueryResult<never> {
  const message = err instanceof Error ? err.message : String(err);
  const digest = (err as { digest?: unknown } | null)?.digest;
  const tagged = message.startsWith(FAILURE_PREFIX) ? message : typeof digest === "string" ? digest : "";
  if (tagged.startsWith(FAILURE_PREFIX)) {
    const rest = tagged.slice(FAILURE_PREFIX.length);
    const i = rest.indexOf(":");
    const code = i === -1 ? rest : rest.slice(0, i);
    return {
      ok: false,
      error: code === "bytes-cap" ? "bytes-cap" : "failed",
      message: i === -1 ? message : rest.slice(i + 1),
    };
  }
  return { ok: false, error: "failed", message };
}
