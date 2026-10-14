import { describe, expect, it } from "vitest";
import { planLoad } from "./load-plan.js";

describe("planLoad", () => {
  it("loads into an empty table", () => expect(planLoad(0, false)).toBe("load"));
  it("refuses to duplicate existing demo rows", () => expect(planLoad(5, false)).toBe("refuse"));
  it("replaces when asked", () => expect(planLoad(5, true)).toBe("replace-then-load"));
  it("replace on an empty table just loads", () => expect(planLoad(0, true)).toBe("load"));
});
