import { createBigQueryWriter, type RowWriter } from "./bigquery-writer.js";

/** Minimum length for the salt, the ignore key and the pseudonym key. */
export const MIN_SECRET_LENGTH = 16;

export function validSecret(value: string | undefined): string | null {
  return value && value.length >= MIN_SECRET_LENGTH ? value : null;
}

/** BigQuery writer from ANALYTICS_GCP_CREDENTIALS, read on every call. Null (and a log line) when unset. */
export function writerFromEnv(dest: { datasetId?: string; tableId?: string } = {}): RowWriter | null {
  const raw = process.env.ANALYTICS_GCP_CREDENTIALS;
  if (!raw) {
    console.error("rt-analytics: ANALYTICS_GCP_CREDENTIALS is not set; dropping events");
    return null;
  }
  const creds = JSON.parse(raw) as { project_id: string; client_email: string; private_key: string };
  return createBigQueryWriter({
    projectId: creds.project_id,
    datasetId: dest.datasetId ?? "analytics",
    tableId: dest.tableId ?? "events",
    credentials: { client_email: creds.client_email, private_key: creds.private_key },
  });
}
