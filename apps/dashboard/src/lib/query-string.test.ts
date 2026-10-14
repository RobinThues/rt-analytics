import { describe, expect, it } from "vitest";
import { viewQuery } from "./query-string";

describe("viewQuery", () => {
  it("keeps the range and drops compare when it is on (the default)", () => {
    expect(viewQuery({ range: { from: "2026-10-01", to: "2026-10-07" }, compare: true })).toBe(
      "?from=2026-10-01&to=2026-10-07",
    );
  });
  it("adds compare=0 when compare is off", () => {
    expect(viewQuery({ range: { from: "2026-10-01", to: "2026-10-07" }, compare: false })).toBe(
      "?from=2026-10-01&to=2026-10-07&compare=0",
    );
  });
});
