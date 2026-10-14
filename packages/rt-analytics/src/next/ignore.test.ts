import { describe, expect, it } from "vitest";
import { hasIgnoreCookie, ignoreCookie, ignorePage, keyMatches } from "./ignore.js";

describe("hasIgnoreCookie", () => {
  it("matches the exact cookie among others", () => {
    expect(hasIgnoreCookie("rta_ignore=1")).toBe(true);
    expect(hasIgnoreCookie("a=b; rta_ignore=1; c=d")).toBe(true);
    expect(hasIgnoreCookie("a=b;rta_ignore=1")).toBe(true);
  });

  it("does not match similar names or values", () => {
    expect(hasIgnoreCookie("xrta_ignore=1")).toBe(false);
    expect(hasIgnoreCookie("rta_ignore=10")).toBe(false);
    expect(hasIgnoreCookie("rta_ignore=0")).toBe(false);
    expect(hasIgnoreCookie("")).toBe(false);
    expect(hasIgnoreCookie(null)).toBe(false);
  });
});

describe("ignoreCookie", () => {
  it("sets a long-lived, path-scoped, HttpOnly cookie", () => {
    expect(ignoreCookie("/api/a")).toBe("rta_ignore=1; Path=/api/a; Max-Age=34560000; HttpOnly; Secure; SameSite=Lax");
  });

  it("clears it with Max-Age=0", () => {
    expect(ignoreCookie("/api/a", true)).toBe("rta_ignore=1; Path=/api/a; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
  });
});

describe("keyMatches", () => {
  const key = "ignore-key-0123456789";

  it("accepts the exact key and rejects others", () => {
    expect(keyMatches(key, key)).toBe(true);
    expect(keyMatches("ignore-key-0123456780", key)).toBe(false);
    expect(keyMatches("", key)).toBe(false);
  });

  it("does not throw on non-ASCII input of the same string length", () => {
    const sameLength = "ä".repeat(key.length);
    expect(() => keyMatches(sameLength, key)).not.toThrow();
    expect(keyMatches(sameLength, key)).toBe(false);
  });
});

describe("ignorePage", () => {
  const special = 'a b&c"d<e+f-0123456789';

  function linkFrom(html: string): URLSearchParams {
    const href = /<a href="([^"]*)"/.exec(html)![1]!.replaceAll("&amp;", "&");
    return new URLSearchParams(href.slice(1));
  }

  it("says excluded and links to undo with the same key", () => {
    const html = ignorePage("excluded", special);
    expect(html).toContain("now excluded");
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    const params = linkFrom(html);
    expect(params.get("ignore")).toBe(special);
    expect(params.get("undo")).toBe("1");
  });

  it("is HTML-safe for any key", () => {
    const html = ignorePage("excluded", special);
    expect(html).not.toContain('c"d<e');
  });

  it("says already excluded", () => {
    expect(ignorePage("already", special)).toContain("already excluded");
  });

  it("after undo, links to exclude again without undo", () => {
    const html = ignorePage("included", special);
    expect(html).toContain("counted in analytics again");
    const params = linkFrom(html);
    expect(params.get("ignore")).toBe(special);
    expect(params.has("undo")).toBe(false);
  });
});
