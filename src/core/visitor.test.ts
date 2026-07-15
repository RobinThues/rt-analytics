import { describe, expect, it } from "vitest";
import { VisitorManager } from "./visitor.js";
import { fakeStorage } from "../test-utils.js";

describe("VisitorManager", () => {
  it("returns null and stores nothing without accepted consent", () => {
    const storage = fakeStorage();
    const v = new VisitorManager(storage);
    expect(v.getId("pending")).toBeNull();
    expect(v.getId("declined")).toBeNull();
    expect(storage.length).toBe(0);
  });

  it("creates a stable persistent id once accepted", () => {
    const storage = fakeStorage();
    const v = new VisitorManager(storage);
    const id = v.getId("accepted");
    expect(id).toBeTruthy();
    expect(v.getId("accepted")).toBe(id);
    expect(new VisitorManager(storage).getId("accepted")).toBe(id);
  });

  it("clear() removes the stored id so a new one is generated", () => {
    const storage = fakeStorage();
    const v = new VisitorManager(storage);
    const first = v.getId("accepted");
    v.clear();
    expect(v.getId("accepted")).not.toBe(first);
  });

  it("handles null storage", () => {
    const v = new VisitorManager(null);
    expect(v.getId("accepted")).toBeNull();
    expect(() => v.clear()).not.toThrow();
  });
});
