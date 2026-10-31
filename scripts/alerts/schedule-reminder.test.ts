import { describe, expect, it } from "vitest";
import { scheduleReminderDue } from "./schedule-reminder";

const commit = "2026-09-01T10:00:00+02:00";

describe("scheduleReminderDue", () => {
  it("is quiet before day 50", () => {
    expect(scheduleReminderDue(commit, new Date("2026-10-20T08:05:00Z"))).toBe(false);
  });

  it("fires in one slot per day from day 50 on", () => {
    expect(scheduleReminderDue(commit, new Date("2026-10-22T08:07:00Z"))).toBe(true);
    expect(scheduleReminderDue(commit, new Date("2026-10-22T08:22:00Z"))).toBe(false);
    expect(scheduleReminderDue(commit, new Date("2026-10-22T09:07:00Z"))).toBe(false);
    expect(scheduleReminderDue(commit, new Date("2026-10-23T08:07:00Z"))).toBe(true);
  });

  it("does nothing without a usable date", () => {
    expect(scheduleReminderDue(undefined, new Date("2026-10-22T08:07:00Z"))).toBe(false);
    expect(scheduleReminderDue("junk", new Date("2026-10-22T08:07:00Z"))).toBe(false);
  });
});
