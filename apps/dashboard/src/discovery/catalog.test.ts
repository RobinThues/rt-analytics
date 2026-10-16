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
