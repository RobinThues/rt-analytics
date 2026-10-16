import { connection } from "next/server";
import { checkCredentials } from "@/bq/credentials";
import { getBigQuery } from "@/bq/client";
import { readEnv } from "@/env";

/** Request-time only: the token check reads the clock, which a prerender must not do. */
export async function CredentialsBanner() {
  await connection();
  const { ok } = await checkCredentials(getBigQuery(readEnv()).authClient);
  if (ok) return null;
  return (
    <p role="alert" className="mb-4 rounded-md border border-destructive p-3 text-sm text-destructive">
      The dashboard cannot reach BigQuery (credentials). Panels below will fail. Check the Vercel OIDC token and the
      workload identity setup.
    </p>
  );
}
