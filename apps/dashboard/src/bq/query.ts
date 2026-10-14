// query(): the uncached path (Live, TTL 0) or the shared 'use cache: remote' path (spec section 5).
import { cacheLife, cacheTag } from "next/cache";
import { cookies } from "next/headers";
import { readEnv } from "@/env";
import { cacheProfile, failureFrom, rowsOrThrow, usesCache } from "./cache-rules";
import { createBigQuery } from "./client";
import { runQuery, type QueryResult, type QuerySpec } from "./run-query";

export const LIVE_COOKIE = "rtd_live";

export async function isLive(): Promise<boolean> {
  return (await cookies()).get(LIVE_COOKIE)?.value === "1";
}

/** Runs now, without the cache. Also used for DML writes (config). */
export function execute<T>(spec: QuerySpec): Promise<QueryResult<T>> {
  const env = readEnv();
  return runQuery<T>(createBigQuery(env), spec, env.maxBytesPerQuery);
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
