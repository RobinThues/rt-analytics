import { describe, expect, it } from "vitest";
import { pickMessage } from "./messages";

describe("pickMessage", () => {
  const messages = { name: "Give it a name." };
  it("known codes, nothing, and unknown codes", () => {
    expect(pickMessage(messages, "name")).toBe("Give it a name.");
    expect(pickMessage(messages, undefined)).toBeNull();
    expect(pickMessage(messages, ["name", "x"])).toBeNull();
    expect(pickMessage(messages, "nope")).toBe("Something went wrong.");
  });
  it("prototype names from a hand-edited URL are unknown codes", () => {
    for (const code of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(pickMessage(messages, code)).toBe("Something went wrong.");
    }
  });
});
