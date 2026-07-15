import { describe, expect, it } from "vitest";
import { SDK_VERSION } from "./index.js";

describe("toolchain", () => {
  it("resolves the core entry", () => {
    expect(SDK_VERSION).toBe("0.1.0");
  });
});
