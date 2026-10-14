// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readEnv } from "@/env";
import { DEFAULT_SETTINGS, parseSettings, readSettingsQuery, saveSettingsQuery } from "./settings";

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
