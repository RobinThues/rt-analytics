import { connection } from "next/server";
import { requireUser } from "@/auth/session";
import { checkCredentials } from "@/bq/credentials";
import { getBigQuery } from "@/bq/client";
import { readEnv } from "@/env";

/**
 * Request-time only: the token check reads the clock, which a prerender must not do. It renders outside
 * the pages' data parts, so it checks the user itself (signed-out requests learn nothing).
 */
export async function CredentialsBanner() {
  await connection();
  await requireUser();
  const env = readEnv();
  // e2e replay has no GCP credentials and needs none.
  if (env.fixtures === "replay") return null;
  const { ok } = await checkCredentials(getBigQuery(env).authClient);
  if (ok) return null;
  return (
    <p role="alert" className="mb-4 rounded-md border border-destructive p-3 text-sm text-destructive">
      The dashboard cannot reach BigQuery (credentials). Panels below will fail. Check the Vercel OIDC token and the
      workload identity setup.
    </p>
  );
}
