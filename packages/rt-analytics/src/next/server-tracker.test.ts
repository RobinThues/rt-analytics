import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerTracker, pseudonymizeWith } from "./server-tracker.js";
import type { EventRow, RowWriter } from "./bigquery-writer.js";

const SALT = "salt-0123456789abcdef";
const NOW = new Date("2026-10-13T10:00:00.000Z");

describe("createServerTracker", () => {
  let rows: EventRow[];
  let writer: RowWriter;

  beforeEach(() => {
    rows = [];
    writer = { write: vi.fn(async (r: EventRow[]) => void rows.push(...r)) };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("writes one server row with only the expected columns set", async () => {
    const t = createServerTracker({ appId: "wetter", salt: SALT, writer, now: () => NOW });
    await t.track("calendar_poll", { kind: "token", client: "google" });
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({
      app_id: "wetter", event_name: "calendar_poll", timestamp: NOW,
      props: '{"kind":"token","client":"google"}', consent_state: "server",
      visitor_id: null, session_id: null, user_id: null, page_path: null, referrer: null,
      utm_source: null, utm_medium: null, utm_campaign: null, country: null,
      browser: null, os: null, device_type: null, viewport_w: null, viewport_h: null,
    });
    expect(row.event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.sdk_version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("stores null props when there are none", async () => {
    await createServerTracker({ appId: "wetter", salt: SALT, writer }).track("calendar_poll");
    expect(rows[0]!.props).toBeNull();
  });

  it("drops invalid names and oversized props", async () => {
    const t = createServerTracker({ appId: "wetter", salt: SALT, writer });
    await t.track("Bad Name!", {});
    await t.track("calendar_poll", { big: "x".repeat(5000) });
    expect(rows).toHaveLength(0);
  });

  it("never throws when the writer fails", async () => {
    const failing = createServerTracker({
      appId: "wetter",
      salt: SALT,
      writer: { write: vi.fn().mockRejectedValue(new Error("boom")) },
    });
    await expect(failing.track("calendar_poll", {})).resolves.toBeUndefined();
  });

  it("skips and logs on every call without credentials (no injected writer)", async () => {
    vi.stubEnv("ANALYTICS_GCP_CREDENTIALS", "");
    const t = createServerTracker({ appId: "wetter", salt: SALT });
    await t.track("calendar_poll", {});
    await t.track("calendar_poll", {});
    const lines = vi.mocked(console.error).mock.calls.filter((c) => String(c[0]).includes("ANALYTICS_GCP_CREDENTIALS"));
    expect(lines).toHaveLength(2);
  });

  it("skips and logs once with a short salt", async () => {
    const t = createServerTracker({ appId: "wetter", salt: "short", writer });
    await t.track("calendar_poll", {});
    await t.track("calendar_poll", {});
    expect(rows).toHaveLength(0);
    const lines = vi.mocked(console.error).mock.calls.filter((c) => String(c[0]).includes("16 characters"));
    expect(lines).toHaveLength(1);
  });

  it("reads the environment per call, not at creation", async () => {
    vi.stubEnv("ANALYTICS_DAILY_SALT", "");
    vi.stubEnv("ANALYTICS_PSEUDONYM_KEY", "");
    const t = createServerTracker({ appId: "wetter", writer });
    expect(t.pseudonymize("x")).toBeNull();
    vi.stubEnv("ANALYTICS_DAILY_SALT", SALT);
    expect(t.pseudonymize("x")).toMatch(/^[0-9a-f]{32}$/);
    await t.track("calendar_poll", {});
    expect(rows).toHaveLength(1);
  });
});

describe("pseudonymize", () => {
  beforeEach(() => vi.stubEnv("ANALYTICS_PSEUDONYM_KEY", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is stable, 32 hex characters, and depends on key and app", () => {
    const a = createServerTracker({ appId: "wetter", salt: SALT });
    expect(a.pseudonymize("s:0123456789abcdef")).toBe(a.pseudonymize("s:0123456789abcdef"));
    expect(a.pseudonymize("s:0123456789abcdef")).toMatch(/^[0-9a-f]{32}$/);
    expect(a.pseudonymize("s:0123456789abcdef")).not.toBe(a.pseudonymize("s:0123456789abcdee"));
    const otherApp = createServerTracker({ appId: "other", salt: SALT });
    expect(otherApp.pseudonymize("v")).not.toBe(a.pseudonymize("v"));
    const otherKey = createServerTracker({ appId: "wetter", salt: "salt-0123456789abcdeX" });
    expect(otherKey.pseudonymize("v")).not.toBe(a.pseudonymize("v"));
  });

  it("uses the pseudonym key when set, else the salt", () => {
    const viaSalt = createServerTracker({ appId: "wetter", salt: SALT });
    const viaKey = createServerTracker({ appId: "wetter", salt: SALT, pseudonymKey: "key-0123456789abcdef" });
    expect(viaKey.pseudonymize("v")).toBe(pseudonymizeWith("key-0123456789abcdef", "wetter", "v"));
    expect(viaSalt.pseudonymize("v")).toBe(pseudonymizeWith(SALT, "wetter", "v"));
    vi.stubEnv("ANALYTICS_PSEUDONYM_KEY", "env-key-0123456789ab");
    expect(viaSalt.pseudonymize("v")).toBe(pseudonymizeWith("env-key-0123456789ab", "wetter", "v"));
  });

  it("returns null for a missing or short key, without falling back from a short pseudonym key", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(createServerTracker({ appId: "wetter", salt: "short" }).pseudonymize("v")).toBeNull();
    expect(createServerTracker({ appId: "wetter", salt: SALT, pseudonymKey: "short" }).pseudonymize("v")).toBeNull();
  });
});
