import type { RowConsentState } from "./index.js";

/** One row of the BigQuery `events` table, as written by the ingest handler and the server tracker. */
export interface EventRow {
  event_id: string;
  app_id: string;
  event_name: string;
  timestamp: Date;
  visitor_id: string | null;
  session_id: string | null;
  user_id: string | null;
  page_path: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  country: string | null;
  browser: string | null;
  os: string | null;
  device_type: string | null;
  viewport_w: number | null;
  viewport_h: number | null;
  /** JSON-serialized custom props */
  props: string | null;
  consent_state: RowConsentState;
  sdk_version: string;
}
