// Keyless BigQuery access (spec section 2): Vercel OIDC token -> GCP STS -> short-lived token of the
// rt-analytics-dashboard service account. Without the GCP_* identity variables (local runs before
// `vercel env pull`), the client falls back to Application Default Credentials (your gcloud login).
import { BigQuery } from "@google-cloud/bigquery";
import { getVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient } from "google-auth-library";
import { join } from "node:path";
import type { DashboardEnv } from "@/env";
import { createRecordClient, createReplayClient } from "./fixtures";
import type { QueryClient } from "./run-query";

export function createBigQuery(env: DashboardEnv): BigQuery {
  const { projectId, projectNumber, serviceAccountEmail, poolId, providerId } = env.gcp;
  if (!projectNumber || !serviceAccountEmail || !poolId || !providerId) {
    return new BigQuery({ projectId, location: "EU" });
  }
  const authClient = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
  });
  if (!authClient) throw new Error("Could not build the GCP external account client");
  return new BigQuery({ projectId, location: "EU", authClient });
}

let replayClient: QueryClient | null = null;

/**
 * The client queries run on: recorded files in e2e replay, the real client that also records in e2e record,
 * else BigQuery. `next start` runs in apps/dashboard, so the fixtures live in apps/dashboard/e2e/fixtures.
 */
export function getQueryClient(env: DashboardEnv): QueryClient {
  const dir = join(process.cwd(), "e2e", "fixtures");
  if (env.fixtures === "replay") return (replayClient ??= createReplayClient(dir));
  if (env.fixtures === "record") return createRecordClient(getBigQuery(env), dir);
  return getBigQuery(env);
}

const clients = new Map<string, BigQuery>();

/**
 * One client per GCP configuration and process: the auth client caches its access token, so only the
 * first query (and token expiry) pays for the STS exchange and the impersonation call.
 */
export function getBigQuery(env: DashboardEnv): BigQuery {
  const key = JSON.stringify(env.gcp);
  let client = clients.get(key);
  if (!client) {
    client = createBigQuery(env);
    clients.set(key, client);
  }
  return client;
}
