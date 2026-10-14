// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readEnv } from "@/env";
import { getBigQuery } from "./client";

const wif = {
  GCP_PROJECT_ID: "robin-thues",
  GCP_PROJECT_NUMBER: "517859709622",
  GCP_SERVICE_ACCOUNT_EMAIL: "rt-analytics-dashboard@robin-thues.iam.gserviceaccount.com",
  GCP_WORKLOAD_IDENTITY_POOL_ID: "vercel",
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: "vercel",
};

describe("getBigQuery", () => {
  it("reuses one client per GCP configuration, so tokens are not exchanged on every query", () => {
    const a = getBigQuery(readEnv(wif));
    expect(getBigQuery(readEnv(wif))).toBe(a);
    expect(getBigQuery(readEnv({ GCP_PROJECT_ID: "robin-thues" }))).not.toBe(a);
  });
});
