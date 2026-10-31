import { describe, expect, it } from "vitest";
import { githubWifConfig } from "./gcp-alerts";

describe("githubWifConfig", () => {
  const wif = githubWifConfig("Owner/repo", "123");

  it("accepts only main of the one repo", () => {
    expect(wif.attributeCondition).toBe('assertion.sub == "repo:Owner/repo:ref:refs/heads/main"');
    expect(wif.subjectPrincipal).toBe(
      "principal://iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/github/subject/repo:Owner/repo:ref:refs/heads/main",
    );
  });

  it("gives the provider name the workflow needs", () => {
    expect(wif.providerName).toBe("projects/123/locations/global/workloadIdentityPools/github/providers/github");
  });

  it("refuses values that could change the condition", () => {
    expect(() => githubWifConfig('a/b" || true || "', "123")).toThrow();
    expect(() => githubWifConfig("nope", "123")).toThrow();
    expect(() => githubWifConfig("a/b", "12x")).toThrow();
  });
});
