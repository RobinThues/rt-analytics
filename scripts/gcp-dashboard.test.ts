import { describe, expect, it } from "vitest";
import { CONFIG_SCHEMA, DASHBOARD_DEV_SA, isMissingBindingError, wifConfig } from "./gcp-dashboard.js";

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

  it("binds one subject per environment", () => {
    expect(c.subjectPrincipal("production")).toBe(
      "principal://iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/vercel/subject/" +
        "owner:robinthues-projects:project:rt-analytics-dashboard:environment:production",
    );
    expect(c.subjectPrincipal("development")).toMatch(/:environment:development$/);
  });

  it("names the dev service account", () => expect(DASHBOARD_DEV_SA).toBe("rt-analytics-dashboard-dev"));

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

describe("isMissingBindingError", () => {
  it("treats only a missing binding as already removed", () => {
    expect(
      isMissingBindingError("ERROR: Policy binding with the specified principal, role, and condition not found!"),
    ).toBe(true);
  });
  it("does not hide permission or other failures", () => {
    expect(
      isMissingBindingError(
        "ERROR: (gcloud.iam.service-accounts.remove-iam-policy-binding) PERMISSION_DENIED: Permission 'iam.serviceAccounts.setIamPolicy' denied",
      ),
    ).toBe(false);
    expect(isMissingBindingError("")).toBe(false);
  });
});
