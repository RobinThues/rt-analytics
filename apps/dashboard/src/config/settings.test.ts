// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readEnv } from "@/env";
import { DEFAULT_SETTINGS, isTimezone, parseHostList, parseSettings, readSettingsQuery, saveSettingsQuery } from "./settings";

const env = readEnv({ GCP_PROJECT_ID: "robin-thues" });

describe("parseSettings", () => {
  it("defaults when missing or broken, never throws", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("junk")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ timezone: "Mars/Base", hosts: "x" })).toEqual(DEFAULT_SETTINGS);
  });
  it("keeps a valid timezone and clean hostnames", () => {
    expect(
      parseSettings({ timezone: "Europe/Vienna", hosts: ["Wetter-in-Kalender.de", "bad host", "x".repeat(300)] }),
    ).toEqual({ timezone: "Europe/Vienna", hosts: ["wetter-in-kalender.de"] });
  });
});

describe("settings SQL", () => {
  it("reads and merges by kind and id with parameters only", () => {
    const r = readSettingsQuery(env, "demo");
    expect(r.params).toEqual({ app_id: "demo" });
    expect(r.sql).toContain("kind = 'app_settings'");
    const w = saveSettingsQuery(env, "demo", { timezone: "UTC", hosts: [] }, "robin@example.com");
    expect(w.sql).toContain("MERGE `robin-thues.analytics_dashboard.dashboard_config`");
    expect(w.params).toEqual({ app_id: "demo", value: '{"timezone":"UTC","hosts":[]}', email: "robin@example.com" });
  });
});

describe("settings input", () => {
  it("timezones: only IANA names Intl lists, plus UTC, case-sensitive", () => {
    expect(isTimezone("Europe/Berlin")).toBe(true);
    expect(isTimezone("UTC")).toBe(true);
    expect(isTimezone("europe/berlin")).toBe(false);
    expect(isTimezone("Not/AZone")).toBe(false);
  });
  it("host list: splits on whitespace and commas, reports invalid entries", () => {
    expect(parseHostList("Example.com\n www.example.com, ")).toEqual({
      hosts: ["example.com", "www.example.com"],
      invalid: [],
    });
    expect(parseHostList("example.com https://x.de a_b")).toEqual({
      hosts: ["example.com"],
      invalid: ["https://x.de", "a_b"],
    });
  });
});
