// query(): the uncached path (Live, TTL 0) or the shared 'use cache: remote' path (spec section 5).
import { cacheLife, cacheTag } from "next/cache";
import { cookies } from "next/headers";
import { readEnv } from "@/env";
import { cacheProfile, failureFrom, rowsOrThrow, TAGS, usesCache } from "./cache-rules";
import { getQueryClient } from "./client";
import { runQuery, type QueryResult, type QuerySpec } from "./run-query";

export const LIVE_COOKIE = "rtd_live";

export async function isLive(): Promise<boolean> {
  return (await cookies()).get(LIVE_COOKIE)?.value === "1";
}

/** Runs now, without the cache. Also used for DML writes (config). */
export function execute<T>(spec: QuerySpec): Promise<QueryResult<T>> {
  const env = readEnv();
  return runQuery<T>(getQueryClient(env), spec, env.maxBytesPerQuery, env.jobSource);
}

async function runCached(spec: QuerySpec, tags: string[], ttl: number): Promise<unknown[]> {
  "use cache: remote";
  cacheTag(...tags);
  cacheLife(cacheProfile(ttl));
  return rowsOrThrow(await execute<unknown>(spec));
}

export async function query<T>(
  spec: QuerySpec,
  opts: { tags: string[]; ttl: number; live: boolean },
): Promise<QueryResult<T>> {
  if (!usesCache(opts)) return execute<T>(spec);
  try {
    return { ok: true, rows: (await runCached(spec, opts.tags, opts.ttl)) as T[] };
  } catch (err) {
    return failureFrom(err);
  }
}

/** Data panels: tag rtd:bq:<appId>, the configured TTL, and Live skips the cache. */
export function dataQuery<T>(spec: QuerySpec, appId: string, live: boolean): Promise<QueryResult<T>> {
  return query<T>(spec, { tags: [TAGS.data(appId)], ttl: readEnv().cacheTtlSeconds, live });
}
