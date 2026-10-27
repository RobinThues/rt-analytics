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

describe("viewQuery with an interval", () => {
  it("keeps the interval choice after compare, before page params", () => {
    expect(
      viewQuery({ range: { from: "2026-10-01", to: "2026-10-07" }, compare: false, interval: "hour" }, [
        ["event", "x"],
      ]),
    ).toBe("?from=2026-10-01&to=2026-10-07&compare=0&interval=hour&event=x");
    expect(viewQuery({ range: { from: "2026-10-01", to: "2026-10-07" }, compare: true, interval: null })).toBe(
      "?from=2026-10-01&to=2026-10-07",
    );
  });
});

describe("viewQuery with page params", () => {
  it("appends extra params in order, encoded", () => {
    expect(
      viewQuery({ range: { from: "2026-10-01", to: "2026-10-07" }, compare: true }, [
        ["event", "a b"],
        ["filter", "kind:a:b"],
      ]),
    ).toBe("?from=2026-10-01&to=2026-10-07&event=a+b&filter=kind%3Aa%3Ab");
  });
});
