import { describe, expect, it } from "vitest";
import { buildCatalog } from "./catalog";

describe("buildCatalog", () => {
  it("maps id counts to flags and groups keys per event in order", () => {
    expect(
      buildCatalog(
        [
          { event_name: "calendar_poll", with_visitor: 0, with_session: 0 },
          { event_name: "place_selected", with_visitor: 5, with_session: 4 },
        ],
        [
          { event_name: "place_selected", prop_key: "source" },
          { event_name: "calendar_poll", prop_key: "subscription" },
          { event_name: "place_selected", prop_key: "place" },
        ],
      ),
    ).toEqual({
      events: [
        { name: "calendar_poll", withVisitor: false, withSession: false },
        { name: "place_selected", withVisitor: true, withSession: true },
      ],
      keys: { calendar_poll: ["subscription"], place_selected: ["source", "place"] },
    });
  });
  it("keys of events not in the event list are dropped", () => {
    expect(buildCatalog([], [{ event_name: "x", prop_key: "k" }]).keys).toEqual({});
  });
});

describe("event names that are Object.prototype keys (the public ingest accepts them)", () => {
  const evil = ["__proto__", "constructor", "hasOwnProperty"];
  const c = buildCatalog(
    evil.map((name) => ({ event_name: name, with_visitor: 1, with_session: 1 })),
    evil.map((name) => ({ event_name: name, prop_key: "k" })),
  );
  it("build a normal catalog without touching prototypes", () => {
    expect(c.events.map((e) => e.name)).toEqual(evil);
    for (const name of evil) expect(c.keys[name]).toEqual(["k"]);
    expect(({} as Record<string, unknown>).k).toBeUndefined();
  });
  it("unknown names never resolve to inherited members", () => {
    const empty = buildCatalog([], []);
    expect(empty.keys["constructor"]).toBeUndefined();
    expect(empty.keys["__proto__"]).toBeUndefined();
  });
});
