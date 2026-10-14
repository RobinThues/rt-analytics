// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cacheProfile, failureFrom, rowsOrThrow, TAGS, usesCache } from "./cache-rules";

describe("cache rules", () => {
  it("sets stale, revalidate and expire explicitly", () => {
    expect(cacheProfile(3600)).toEqual({ stale: 300, revalidate: 3600, expire: 7200 });
    expect(cacheProfile(60)).toEqual({ stale: 60, revalidate: 60, expire: 120 });
  });
  it("skips the cache for Live and for TTL 0", () => {
    expect(usesCache({ live: false, ttl: 3600 })).toBe(true);
    expect(usesCache({ live: true, ttl: 3600 })).toBe(false);
    expect(usesCache({ live: false, ttl: 0 })).toBe(false);
  });
  it("prefixes every tag with rtd:", () => {
    const tags = [TAGS.data("demo"), TAGS.discovery("demo"), TAGS.apps, TAGS.config];
    expect(tags.every((t) => t.startsWith("rtd:"))).toBe(true);
  });
});

describe("failures are thrown, never returned from the cached function", () => {
  it("returns rows for ok results", () => {
    expect(rowsOrThrow({ ok: true, rows: [{ n: 1 }] })).toEqual([{ n: 1 }]);
  });
  it("throws for failures and decodes them back", () => {
    let caught: unknown;
    try {
      rowsOrThrow({ ok: false, error: "bytes-cap", message: "Query exceeded limit | 1 GB" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(failureFrom(caught)).toEqual({ ok: false, error: "bytes-cap", message: "Query exceeded limit | 1 GB" });
    expect(failureFrom(new Error("network down"))).toEqual({ ok: false, error: "failed", message: "network down" });
  });
});
