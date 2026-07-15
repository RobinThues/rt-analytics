import { describe, expect, it, vi } from "vitest";
import { ConsentManager } from "./consent.js";
import { fakeStorage } from "../test-utils.js";

describe("ConsentManager", () => {
  it("defaults to pending and stores nothing until a choice is made", () => {
    const storage = fakeStorage();
    const c = new ConsentManager(storage);
    expect(c.get()).toBe("pending");
    expect(storage.length).toBe(0);
  });

  it("persists accept and decline", () => {
    const storage = fakeStorage();
    new ConsentManager(storage).accept();
    expect(new ConsentManager(storage).get()).toBe("accepted");
    new ConsentManager(storage).decline();
    expect(new ConsentManager(storage).get()).toBe("declined");
  });

  it("treats garbage stored values as pending", () => {
    const storage = fakeStorage();
    storage.setItem("rta_consent", "banana");
    expect(new ConsentManager(storage).get()).toBe("pending");
  });

  it("notifies listeners and supports unsubscribe", () => {
    const c = new ConsentManager(fakeStorage());
    const fn = vi.fn();
    const off = c.onChange(fn);
    c.accept();
    expect(fn).toHaveBeenCalledWith("accepted");
    off();
    c.decline();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("works with null storage (SSR)", () => {
    const c = new ConsentManager(null);
    expect(c.get()).toBe("pending");
    expect(() => c.accept()).not.toThrow();
  });
});
