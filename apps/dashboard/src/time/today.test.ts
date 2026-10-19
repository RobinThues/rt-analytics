// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readEnv } from "@/env";
import { appToday, todayEnd } from "./today";

const fixed = readEnv({ GCP_PROJECT_ID: "robin-thues", DASHBOARD_FIXED_TODAY: "2026-10-13" });
const real = readEnv({ GCP_PROJECT_ID: "robin-thues" });

describe("appToday", () => {
  it("uses the fixed day when set", () => expect(appToday("Europe/Berlin", fixed)).toBe("2026-10-13"));
  it("reads the clock otherwise", () => expect(appToday("UTC", real)).toBe(new Date().toISOString().slice(0, 10)));
});

describe("todayEnd", () => {
  it("is the start of the next day in the app's timezone", () => {
    expect(todayEnd("Europe/Berlin", fixed)).toBe("2026-10-13T22:00:00.000Z");
    expect(todayEnd("UTC", fixed)).toBe("2026-10-14T00:00:00.000Z");
  });
});
