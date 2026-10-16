import { describe, expect, it } from "vitest";
import { rawViewQuery } from "./raw-query";

describe("rawViewQuery", () => {
  it("keeps the view and page parameters, drops one-off messages", () => {
    expect(rawViewQuery({ from: "a", to: "b", event: "x", steps: ["s1", "s2"], error: "save", saved: "1" })).toBe(
      "?from=a&to=b&event=x&steps=s1&steps=s2",
    );
    expect(rawViewQuery({})).toBe("");
  });
});
