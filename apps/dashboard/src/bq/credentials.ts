// Page-level credentials check (spec section 5, "Errors"): one banner instead of every panel failing
// alone. Fetching an access token costs nothing in BigQuery; the auth client caches it.

/** Logs a short reason (error name and the start of the message), never token contents. */
export async function checkCredentials(client: { getAccessToken(): Promise<unknown> }): Promise<{ ok: boolean }> {
  try {
    await client.getAccessToken();
    return { ok: true };
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("[rtd] GCP credentials failed:", `${e.name}: ${e.message.slice(0, 200)}`);
    return { ok: false };
  }
}
