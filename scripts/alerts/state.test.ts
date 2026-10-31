import { describe, expect, it } from "vitest";
import { sameProblems, saveQuery } from "./state";

const a = { key: "a", since: "t1", cleanRuns: 0 };
const b = { key: "b", since: "t2", cleanRuns: 1 };

describe("sameProblems", () => {
  it("ignores the order, and sees any change", () => {
    expect(sameProblems([a, b], [b, a])).toBe(true);
    expect(sameProblems([], [])).toBe(true);
    expect(sameProblems([a], [{ ...a, cleanRuns: 1 }])).toBe(false);
    expect(sameProblems([a], [])).toBe(false);
  });
});

describe("saveQuery", () => {
  it("replaces only this app's rows, with values as parameters", () => {
    const q = saveQuery("app", [a]);
    expect(q.query).toContain("DELETE FROM");
    expect(q.query).toContain("WHERE app_id = @app_id");
    expect(q.params).toEqual({ app_id: "app", open: JSON.stringify([a]) });
    expect(q.query).not.toContain('"a"');
  });
});
