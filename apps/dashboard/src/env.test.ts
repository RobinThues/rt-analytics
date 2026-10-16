// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assertSafeTestLogin,
  parseAllowedEmails,
  parseCacheTtl,
  parseMaxBytes,
  readEnv,
  startupCheck,
  testLoginState,
} from "./env";

const secret = "s".repeat(32);

describe("parseCacheTtl", () => {
  it("defaults to 3600", () => expect(parseCacheTtl(undefined)).toBe(3600));
  it("accepts 0 and whole numbers", () => {
    expect(parseCacheTtl("0")).toBe(0);
    expect(parseCacheTtl("120")).toBe(120);
  });
  it("rejects junk", () => {
    for (const bad of ["-1", "1.5", "abc", "Infinity", ""]) expect(() => parseCacheTtl(bad)).toThrow();
  });
});

describe("parseMaxBytes", () => {
  it("defaults to 1 GB", () => expect(parseMaxBytes(undefined)).toBe(1_000_000_000));
  it("rejects 0 and junk", () => {
    for (const bad of ["0", "-5", "x"]) expect(() => parseMaxBytes(bad)).toThrow();
  });
});

describe("parseAllowedEmails", () => {
  it("lowercases, trims and drops empties", () => {
    expect(parseAllowedEmails(" A@B.de, ,c@d.com ")).toEqual(["a@b.de", "c@d.com"]);
  });
  it("is empty when unset", () => expect(parseAllowedEmails(undefined)).toEqual([]));
});

describe("test login guard", () => {
  it("is enabled only with flag, long secret and outside deployments", () => {
    expect(testLoginState({ DASHBOARD_TEST_LOGIN: "1", DASHBOARD_TEST_LOGIN_SECRET: secret })).toEqual({
      enabled: true,
      secret,
    });
    const dev = { DASHBOARD_TEST_LOGIN: "1", DASHBOARD_TEST_LOGIN_SECRET: secret, VERCEL_ENV: "development" };
    expect(testLoginState(dev).enabled).toBe(true);
    expect(testLoginState({ DASHBOARD_TEST_LOGIN: "1", DASHBOARD_TEST_LOGIN_SECRET: "short" }).enabled).toBe(false);
    expect(testLoginState({ DASHBOARD_TEST_LOGIN_SECRET: secret }).enabled).toBe(false);
    const preview = { DASHBOARD_TEST_LOGIN: "1", DASHBOARD_TEST_LOGIN_SECRET: secret, VERCEL_ENV: "preview" };
    expect(testLoginState(preview).enabled).toBe(false);
  });

  it("refuses to start a deployment with the test login flag", () => {
    expect(() => assertSafeTestLogin({ DASHBOARD_TEST_LOGIN: "1", VERCEL_ENV: "production" })).toThrow();
    expect(() => assertSafeTestLogin({ DASHBOARD_TEST_LOGIN: "1", VERCEL_ENV: "preview" })).toThrow();
    expect(() => assertSafeTestLogin({ DASHBOARD_TEST_LOGIN: "1" })).not.toThrow();
    expect(() => assertSafeTestLogin({ VERCEL_ENV: "production" })).not.toThrow();
  });
});

describe("readEnv", () => {
  it("builds validated table names", () => {
    const env = readEnv({ GCP_PROJECT_ID: "robin-thues" });
    expect(env.analyticsTable).toBe("`robin-thues.analytics.events`");
    expect(env.configTable).toBe("`robin-thues.analytics_dashboard.dashboard_config`");
  });
  it("rejects unsafe dataset or project names", () => {
    expect(() => readEnv({ GCP_PROJECT_ID: "x`; DROP" })).toThrow();
    expect(() => readEnv({ GCP_PROJECT_ID: "robin-thues", ANALYTICS_DATASET: "a.b" })).toThrow();
  });
  it("needs a project id", () => expect(() => readEnv({})).toThrow());
});

describe("startupCheck", () => {
  const full = {
    GCP_PROJECT_ID: "robin-thues",
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "s",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "https://example.vercel.app",
    DASHBOARD_ALLOWED_EMAILS: "a@b.de",
  };
  it("passes with a complete environment", () => expect(() => startupCheck(full)).not.toThrow());
  it("names the missing variable", () => {
    expect(() => startupCheck({ ...full, GOOGLE_CLIENT_SECRET: undefined })).toThrow(/GOOGLE_CLIENT_SECRET/);
    expect(() => startupCheck({ ...full, DASHBOARD_ALLOWED_EMAILS: " , " })).toThrow(/DASHBOARD_ALLOWED_EMAILS/);
    expect(() => startupCheck({ ...full, GCP_PROJECT_ID: undefined })).toThrow(/GCP_PROJECT_ID/);
  });
  it("skips the variable check on previews (no GCP or Google values there)", () => {
    expect(() => startupCheck({ VERCEL_ENV: "preview" })).not.toThrow();
  });
  it("still refuses the test login in a deployment", () => {
    expect(() => startupCheck({ ...full, VERCEL_ENV: "production", DASHBOARD_TEST_LOGIN: "1" })).toThrow();
  });
});
