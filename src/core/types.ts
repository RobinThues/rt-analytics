export type ConsentState = "pending" | "accepted" | "declined";

export interface AnalyticsEvent {
  eventId: string;
  name: string;
  ts: string; // ISO 8601
  sessionId: string;
  visitorId: string | null;
  userId: string | null;
  pagePath: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  viewportW: number | null;
  viewportH: number | null;
  props: Record<string, unknown>;
}

export interface Batch {
  appId: string;
  sdkVersion: string;
  consentState: ConsentState;
  events: AnalyticsEvent[];
}

export interface AnalyticsConfig {
  appId: string;
  /** Ingestion endpoint, default "/api/a" */
  endpoint?: string;
  /** Default 5000 */
  flushIntervalMs?: number;
  /** Default 10 */
  maxBatchSize?: number;
  /** Default true */
  captureWebVitals?: boolean;
  /** Default true */
  captureErrors?: boolean;
}

export type EventMap = Record<string, Record<string, unknown>>;
