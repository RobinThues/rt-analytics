import { describe, expect, it } from "vitest";
import { buildCatalog } from "@/discovery/catalog";
import { catalog } from "./fixtures";
import { explorerFormQuery, explorerParams, needsCanonicalRedirect, parseExplorer } from "./state";

describe("parseExplorer", () => {
  it("parses a full selection; the filter value may contain colons", () => {
    expect(
      parseExplorer(
        { event: "calendar_poll", metric: "distinct:subscription", filter: "kind:a:b", by: "client" },
        catalog,
      ),
    ).toEqual({
      event: "calendar_poll",
      metric: { kind: "distinct", key: "subscription" },
      filter: { key: "kind", value: "a:b" },
      by: "client",
    });
  });
  it("unknown event: no selection", () => {
    expect(parseExplorer({ event: "gone_event" }, catalog)).toBeNull();
    expect(parseExplorer({}, catalog)).toBeNull();
    expect(parseExplorer({ event: ["place_selected", "x"] }, catalog)).toBeNull();
  });
  it("drops pieces discovery does not know, keeps the rest", () => {
    expect(
      parseExplorer({ event: "place_selected", metric: "distinct:nope", filter: "nope:x", by: "nope" }, catalog),
    ).toEqual({ event: "place_selected", metric: { kind: "events" }, filter: null, by: null });
  });
  it("visitor and session metrics need those ids", () => {
    expect(parseExplorer({ event: "calendar_poll", metric: "visitors" }, catalog)?.metric).toEqual({ kind: "events" });
    expect(parseExplorer({ event: "place_selected", metric: "sessions" }, catalog)?.metric).toEqual({
      kind: "sessions",
    });
  });
  it("filter values: empty or longer than 200 characters are dropped; unicode and % survive the round trip", () => {
    expect(parseExplorer({ event: "place_selected", filter: "place:" }, catalog)?.filter).toBeNull();
    expect(parseExplorer({ event: "place_selected", filter: `place:${"x".repeat(201)}` }, catalog)?.filter).toBeNull();
    const sel = parseExplorer({ event: "place_selected", filter: "place:Köln 100% | Süd" }, catalog)!;
    const qs = new URLSearchParams(explorerParams(sel).map(([k, v]) => [k, v]));
    expect(parseExplorer(Object.fromEntries(qs), catalog)).toEqual(sel);
  });
  it("form fields fk and fv (plain GET form) mean the same as filter=key:value", () => {
    expect(parseExplorer({ event: "place_selected", fk: "source", fv: "a:b" }, catalog)?.filter).toEqual({
      key: "source",
      value: "a:b",
    });
    expect(parseExplorer({ event: "place_selected", fk: "", fv: "x" }, catalog)?.filter).toBeNull();
    expect(needsCanonicalRedirect({ fk: "source" })).toBe(true);
    expect(needsCanonicalRedirect({ filter: "source:x" })).toBe(false);
  });
  it("explorerParams: only what differs from the defaults", () => {
    expect(explorerParams(null)).toEqual([]);
    expect(explorerParams({ event: "place_selected", metric: { kind: "events" }, filter: null, by: null })).toEqual([
      ["event", "place_selected"],
    ]);
  });
});

describe("prototype-named events", () => {
  it("an event called constructor without discovered keys has no keys", () => {
    const c = buildCatalog([{ event_name: "constructor", with_visitor: 1, with_session: 1 }], []);
    expect(parseExplorer({ event: "constructor", by: "k", filter: "k:v" }, c)).toEqual({
      event: "constructor",
      metric: { kind: "events" },
      filter: null,
      by: null,
    });
  });
});

describe("explorerFormQuery", () => {
  const form = { event: "place_selected", metric: "events", fk: "source", fv: "map", by: "" };

  it("builds the canonical URL from the form (no fk/fv), keeping the range of the base", () => {
    const q = explorerFormQuery("?from=2026-10-01&to=2026-10-16&event=old", catalog, form);
    const expected = new URLSearchParams(
      explorerParams(
        parseExplorer({ event: "place_selected", metric: "events", fk: "source", fv: "map", by: "" }, catalog),
      ),
    ).toString();
    expect(q).toBe(`?from=2026-10-01&to=2026-10-16&${expected}`);
    expect(q).toContain("filter=source%3Amap");
    expect(q).not.toContain("fk=");
  });

  it("copies only the range parameters that exist", () => {
    expect(explorerFormQuery("?event=x", catalog, form)).toBe(
      `?${new URLSearchParams(explorerParams(parseExplorer({ ...form }, catalog))).toString()}`,
    );
    expect(explorerFormQuery("?from=a&to=b&compare=0", catalog, form)).toMatch(/^\?from=a&to=b&compare=0&event=/);
    expect(explorerFormQuery("?from=a&to=b&interval=hour&event=old", catalog, form)).toMatch(
      /^\?from=a&to=b&interval=hour&event=place_selected/,
    );
  });
});
