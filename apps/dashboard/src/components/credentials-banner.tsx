import { checkCredentials } from "@/bq/credentials";
import { getBigQuery } from "@/bq/client";
import { readEnv } from "@/env";

export async function CredentialsBanner() {
  const { ok } = await checkCredentials(getBigQuery(readEnv()).authClient);
  if (ok) return null;
  return (
    <p role="alert" className="mb-4 rounded-md border border-destructive p-3 text-sm text-destructive">
      The dashboard cannot reach BigQuery (credentials). Panels below will fail. Check the Vercel OIDC token and the
      workload identity setup.
    </p>
  );
}
