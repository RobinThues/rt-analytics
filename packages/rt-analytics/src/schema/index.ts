import type { ConsentState } from "../core/types.js";

/** Prefix of every built-in event name. App events never start with it. */
export const BUILTIN_PREFIX = "$";

/** Event names the SDK emits by itself. */
export const BUILTIN_EVENTS = ["$pageview", "$session_start", "$web_vital", "$error", "$consent", "$identify"] as const;
export type BuiltinEvent = (typeof BUILTIN_EVENTS)[number];

export const EVENTS = {
  pageview: "$pageview",
  sessionStart: "$session_start",
  webVital: "$web_vital",
  error: "$error",
  consent: "$consent",
  identify: "$identify",
} as const satisfies Record<string, BuiltinEvent>;

/** consent_state as stored in BigQuery: the client states plus "server" for server-side events. */
export type RowConsentState = ConsentState | "server";
export const SERVER_CONSENT_STATE = "server" satisfies RowConsentState;

/** Prefix of the daily visitor ids the ingest assigns when the client sends none (cookieless). */
export const DAILY_VISITOR_PREFIX = "d_";

export type { EventRow } from "./event-row.js";
