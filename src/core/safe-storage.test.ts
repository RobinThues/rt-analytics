import { describe, expect, it } from "vitest";
import { safeStorage } from "./safe-storage.js";
import { fakeStorage, quotaFullStorage, throwingStorage } from "../test-utils.js";

describe("safeStorage", () => {
  it("returns null when reading the storage itself throws", () => {
    expect(
      safeStorage(() => {
        throw new DOMException("blocked", "SecurityError");
      }),
    ).toBeNull();
  });

  it("returns null for missing storage", () => {
    expect(safeStorage(() => null)).toBeNull();
    expect(safeStorage(() => undefined)).toBeNull();
  });

  it("passes through to a working storage", () => {
    const base = fakeStorage();
    const s = safeStorage(() => base)!;
    s.setItem("k", "v");
    expect(base.getItem("k")).toBe("v");
    expect(s.getItem("k")).toBe("v");
    s.removeItem("k");
    expect(base.getItem("k")).toBeNull();
  });

  it("never throws when every method throws", () => {
    const s = safeStorage(() => throwingStorage())!;
    expect(s.getItem("k")).toBeNull();
    expect(() => s.setItem("k", "v")).not.toThrow();
    expect(() => s.removeItem("k")).not.toThrow();
    expect(() => s.clear()).not.toThrow();
    expect(s.key(0)).toBeNull();
    expect(s.length).toBe(0);
  });

  it("keeps a failed write in memory so it can be read back", () => {
    const s = safeStorage(() => quotaFullStorage())!;
    s.setItem("k", "v");
    expect(s.getItem("k")).toBe("v");
    s.removeItem("k");
    expect(s.getItem("k")).toBeNull();
  });
});
