// Shared test fixture: a catalog like the demo app's discovery result.
import type { Catalog } from "@/discovery/catalog";

export const catalog: Catalog = {
  events: [
    { name: "calendar_poll", withVisitor: false, withSession: false },
    { name: "place_selected", withVisitor: true, withSession: true },
  ],
  keys: { calendar_poll: ["subscription", "kind", "client"], place_selected: ["source", "place"] },
};
