import { afterEach, describe, expect, it, vi } from "vitest";
import { MIN_SECRET_LENGTH, validSecret, writerFromEnv } from "./config.js";

describe("validSecret", () => {
  it("accepts 16 or more characters only", () => {
    expect(MIN_SECRET_LENGTH).toBe(16);
    expect(validSecret("0123456789abcdef")).toBe("0123456789abcdef");
    expect(validSecret("0123456789abcde")).toBeNull();
    expect(validSecret("")).toBeNull();
    expect(validSecret(undefined)).toBeNull();
  });
});

describe("writerFromEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns null and logs on every call when credentials are missing", () => {
    vi.stubEnv("ANALYTICS_GCP_CREDENTIALS", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(writerFromEnv()).toBeNull();
    expect(writerFromEnv()).toBeNull();
    expect(error).toHaveBeenCalledTimes(2);
    expect(String(error.mock.calls[0]![0])).toContain("ANALYTICS_GCP_CREDENTIALS is not set");
  });

  it("returns a writer when credentials are set", () => {
    vi.stubEnv("ANALYTICS_GCP_CREDENTIALS", JSON.stringify({ project_id: "p", client_email: "e", private_key: "k" }));
    expect(writerFromEnv()).not.toBeNull();
  });

  it("throws on invalid credentials JSON", () => {
    vi.stubEnv("ANALYTICS_GCP_CREDENTIALS", "{not json");
    expect(() => writerFromEnv()).toThrow();
  });

  it("never puts any part of the credentials into the error", () => {
    const secret = "-----BEGIN PRIVATE KEY-----SECRETMATERIAL";
    vi.stubEnv("ANALYTICS_GCP_CREDENTIALS", `{"private_key": "${secret}" broken`);
    let message = "";
    try {
      writerFromEnv();
    } catch (err) {
      message = String(err);
    }
    expect(message).toContain("ANALYTICS_GCP_CREDENTIALS is not valid JSON");
    expect(message).not.toContain("SECRET");
    expect(message).not.toContain("private_key");
  });
});
