import { describe, expect, it } from "vitest";
import { SessionManager } from "./session.js";
import { fakeStorage } from "../test-utils.js";

const MIN = 60_000;

describe("SessionManager", () => {
  it("starts a new session on first touch, reuses it within 30 min", () => {
    let t = 0;
    const s = new SessionManager(null, () => t);
    const first = s.touch("pending");
    expect(first.isNew).toBe(true);
    t += 29 * MIN;
    const second = s.touch("pending");
    expect(second).toEqual({ id: first.id, isNew: false });
  });

  it("rotates the session after 30 min of inactivity", () => {
    let t = 0;
    const s = new SessionManager(null, () => t);
    const first = s.touch("pending");
    t += 31 * MIN;
    const second = s.touch("pending");
    expect(second.isNew).toBe(true);
    expect(second.id).not.toBe(first.id);
  });

  it("persists the session in storage when consent is accepted", () => {
    const t = 0;
    const storage = fakeStorage();
    const a = new SessionManager(storage, () => t);
    const first = a.touch("accepted");
    // Simulates a reload: a fresh manager over the same sessionStorage.
    const b = new SessionManager(storage, () => t);
    expect(b.touch("accepted")).toEqual({ id: first.id, isNew: false });
  });

  it("keeps the memory session when consent is accepted mid-session", () => {
    let t = 0;
    const storage = fakeStorage();
    const s = new SessionManager(storage, () => t);
    const before = s.touch("pending");
    t += 5 * MIN;
    expect(s.touch("accepted")).toEqual({ id: before.id, isNew: false });
    expect(storage.getItem("rta_sid")).toBe(before.id);
  });

  it("does not revive an expired memory session on accept", () => {
    let t = 0;
    const s = new SessionManager(fakeStorage(), () => t);
    const before = s.touch("pending");
    t += 31 * MIN;
    const after = s.touch("accepted");
    expect(after.isNew).toBe(true);
    expect(after.id).not.toBe(before.id);
  });

  it("does not write storage without accepted consent", () => {
    const storage = fakeStorage();
    new SessionManager(storage, () => 0).touch("declined");
    expect(storage.length).toBe(0);
  });

  it("reset() forgets the current session", () => {
    const t = 0;
    const storage = fakeStorage();
    const s = new SessionManager(storage, () => t);
    const first = s.touch("accepted");
    s.reset();
    const second = s.touch("accepted");
    expect(second.isNew).toBe(true);
    expect(second.id).not.toBe(first.id);
  });
});
