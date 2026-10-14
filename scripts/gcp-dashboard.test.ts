import { describe, expect, it } from "vitest";
import { CONFIG_SCHEMA, wifConfig } from "./gcp-dashboard.js";

describe("wifConfig", () => {
  const c = wifConfig("robinthues-projects", "rt-analytics-dashboard", "123456789");

  it("trusts only the Vercel team issuer and its default audience", () => {
    expect(c.issuer).toBe("https://oidc.vercel.com/robinthues-projects");
    expect(c.allowedAudience).toBe("https://vercel.com/robinthues-projects");
  });

  it("allows only production and development of the dashboard project", () => {
    expect(c.attributeCondition).toBe(
      'assertion.sub in ["owner:robinthues-projects:project:rt-analytics-dashboard:environment:production", ' +
        '"owner:robinthues-projects:project:rt-analytics-dashboard:environment:development"]',
    );
  });

  it("builds the STS audience and principal set from the project number", () => {
    expect(c.stsAudience).toBe(
      "//iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/vercel/providers/vercel",
    );
    expect(c.principalSet).toBe(
      "principalSet://iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/vercel/*",
    );
  });

  it("rejects slugs that could break the condition", () => {
    expect(() => wifConfig('a"b', "p", "1")).toThrow();
    expect(() => wifConfig("t", "p q", "1")).toThrow();
    expect(() => wifConfig("t", "p", "12x")).toThrow();
  });
});

describe("CONFIG_SCHEMA", () => {
  it("matches the spec's dashboard_config table", () => {
    expect(CONFIG_SCHEMA.map((f) => `${f.name}:${f.type}:${f.mode}`)).toEqual([
      "kind:STRING:REQUIRED",
      "id:STRING:REQUIRED",
      "app_id:STRING:REQUIRED",
      "name:STRING:NULLABLE",
      "value:JSON:REQUIRED",
      "updated_at:TIMESTAMP:REQUIRED",
      "updated_by:STRING:REQUIRED",
    ]);
  });
});
