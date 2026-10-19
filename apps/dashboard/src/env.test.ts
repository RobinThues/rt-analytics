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
    VERCEL_ENV: "production",
  };
  it("passes with a complete environment", () => expect(() => startupCheck(full)).not.toThrow());
  it("local runs (test login only) need no Google values, but still a valid GCP project", () => {
    const local = {
      GCP_PROJECT_ID: "robin-thues",
      DASHBOARD_ALLOWED_EMAILS: "a@b.de",
      BETTER_AUTH_SECRET: "x".repeat(32),
    };
    expect(() => startupCheck(local)).not.toThrow();
    expect(() => startupCheck({ ...local, GCP_PROJECT_ID: undefined })).toThrow(/GCP_PROJECT_ID/);
  });
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

describe("job source", () => {
  const base = { GCP_PROJECT_ID: "robin-thues" };
  it("is production in a production deployment", () =>
    expect(readEnv({ ...base, VERCEL_ENV: "production" }).jobSource).toBe("production"));
  it("is e2e when the Playwright config says so", () =>
    expect(readEnv({ ...base, DASHBOARD_JOB_SOURCE: "e2e" }).jobSource).toBe("e2e"));
  it("is development otherwise", () => expect(readEnv(base).jobSource).toBe("development"));
  it("rejects unknown values", () => expect(() => readEnv({ ...base, DASHBOARD_JOB_SOURCE: "x" })).toThrow());
  it("refuses DASHBOARD_JOB_SOURCE in a deployment", () => {
    expect(() =>
      startupCheck({ ...base, DASHBOARD_ALLOWED_EMAILS: "a@b.de", VERCEL_ENV: "preview", DASHBOARD_JOB_SOURCE: "e2e" }),
    ).toThrow(/DASHBOARD_JOB_SOURCE/);
  });
});

describe("fixed today", () => {
  const base = { GCP_PROJECT_ID: "robin-thues" };
  it("is null when unset", () => expect(readEnv(base).fixedToday).toBeNull());
  it("accepts a real day", () =>
    expect(readEnv({ ...base, DASHBOARD_FIXED_TODAY: "2026-10-13" }).fixedToday).toBe("2026-10-13"));
  it("rejects anything that is not a day", () => {
    expect(() => readEnv({ ...base, DASHBOARD_FIXED_TODAY: "2026-13-01" })).toThrow(/DASHBOARD_FIXED_TODAY/);
    expect(() => readEnv({ ...base, DASHBOARD_FIXED_TODAY: "today" })).toThrow(/DASHBOARD_FIXED_TODAY/);
  });
  it("refuses DASHBOARD_FIXED_TODAY in a deployment", () => {
    expect(() => startupCheck({ ...base, VERCEL_ENV: "preview", DASHBOARD_FIXED_TODAY: "2026-10-13" })).toThrow(
      /DASHBOARD_FIXED_TODAY/,
    );
  });
});

describe("fixtures switch", () => {
  const base = { GCP_PROJECT_ID: "robin-thues" };
  it("is off by default", () => expect(readEnv(base).fixtures).toBeNull());
  it("accepts replay and record", () => {
    expect(readEnv({ ...base, DASHBOARD_FIXTURES: "replay" }).fixtures).toBe("replay");
    expect(readEnv({ ...base, DASHBOARD_FIXTURES: "record" }).fixtures).toBe("record");
  });
  it("rejects other values", () =>
    expect(() => readEnv({ ...base, DASHBOARD_FIXTURES: "x" })).toThrow(/DASHBOARD_FIXTURES/));
  it("refuses DASHBOARD_FIXTURES in a deployment", () => {
    expect(() =>
      startupCheck({
        ...base,
        DASHBOARD_ALLOWED_EMAILS: "a@b.de",
        VERCEL_ENV: "production",
        DASHBOARD_FIXTURES: "replay",
      }),
    ).toThrow(/DASHBOARD_FIXTURES/);
  });
});
