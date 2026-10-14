// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isAllowedEmail, userFromSession, validateUser } from "./validate-user";

const allowed = ["robin@example.com"];
const google = (email: string, emailVerified: boolean) => ({
  user: { email, emailVerified },
  source: { method: "oauth", action: "create-user", oauth: { providerId: "google" } },
});

describe("isAllowedEmail", () => {
  it("compares lowercase and rejects non-strings", () => {
    expect(isAllowedEmail("Robin@Example.com", allowed)).toBe(true);
    expect(isAllowedEmail("x@example.com", allowed)).toBe(false);
    expect(isAllowedEmail(undefined, allowed)).toBe(false);
    expect(isAllowedEmail("robin@example.com", [])).toBe(false);
  });
});

describe("validateUser", () => {
  it("accepts a verified, allowlisted Google user", () => {
    expect(validateUser(google("robin@example.com", true), { allowed, testLogin: false })).toBeUndefined();
  });
  it("rejects unverified or unknown Google users", () => {
    expect(validateUser(google("robin@example.com", false), { allowed, testLogin: false })).toMatchObject({
      error: "email_not_verified",
    });
    expect(validateUser(google("other@example.com", true), { allowed, testLogin: false })).toMatchObject({
      error: "not_allowed",
    });
  });
  it("rejects other providers and methods", () => {
    const github = {
      user: { email: "robin@example.com", emailVerified: true },
      source: { method: "oauth", action: "sign-in", oauth: { providerId: "github" } },
    };
    expect(validateUser(github, { allowed, testLogin: false })).toMatchObject({ error: "method_not_allowed" });
    const pw = { user: { email: "robin@example.com" }, source: { method: "email-password", action: "create-user" } };
    expect(validateUser(pw, { allowed, testLogin: false })).toMatchObject({ error: "method_not_allowed" });
  });
  it("accepts the test method only while the test login is enabled", () => {
    const test = {
      user: { email: "robin@example.com", emailVerified: true },
      source: { method: "test", action: "create-user" },
    };
    expect(validateUser(test, { allowed, testLogin: true })).toBeUndefined();
    expect(validateUser(test, { allowed, testLogin: false })).toMatchObject({ error: "method_not_allowed" });
  });
});

describe("userFromSession", () => {
  it("drops a valid session whose email left the allowlist", () => {
    const s = { user: { email: "robin@example.com", name: "R" } };
    expect(userFromSession(s, ["robin@example.com"])).toEqual({ email: "robin@example.com", name: "R" });
    expect(userFromSession(s, ["someone@else.com"])).toBeNull();
    expect(userFromSession(null, ["robin@example.com"])).toBeNull();
  });
});
