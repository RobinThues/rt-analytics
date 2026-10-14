import { createHmac, randomUUID } from "node:crypto";
import { SDK_VERSION } from "../core/version.js";
import type { EventRow, RowWriter } from "./bigquery-writer.js";
import { MIN_SECRET_LENGTH, validSecret, writerFromEnv } from "./config.js";
import { MAX_PROPS_BYTES, NAME_RE } from "./validate.js";

export interface ServerTrackerOptions {
  appId: string;
  /** At least 16 characters. Default process.env.ANALYTICS_DAILY_SALT, read per call. */
  salt?: string;
  /**
   * Key for pseudonymize, at least 16 characters. Default process.env.ANALYTICS_PSEUDONYM_KEY, falling back
   * to the salt. Never rotate it: pseudonyms depend on it.
   */
  pseudonymKey?: string;
  writer?: RowWriter;
  now?: () => Date;
}

export interface ServerTracker {
  /** Writes one event. Never throws; failures are logged. Resolves when the write is done or skipped. */
  track(name: string, props?: Record<string, unknown>): Promise<void>;
  /** Stable keyed hash (32 hex characters), or null when no valid key is configured. */
  pseudonymize(value: string): string | null;
}

/** HMAC-SHA-256 with a key derived per app, so apps sharing a key cannot link ids. */
export function pseudonymizeWith(key: string, appId: string, value: string): string {
  const derived = createHmac("sha256", key).update(`rt-analytics:pseudonymize:${appId}`).digest();
  return createHmac("sha256", derived).update(value, "utf8").digest("hex").slice(0, 32);
}

export function createServerTracker(opts: ServerTrackerOptions): ServerTracker {
  let warned = false;
  function warnOnce(message: string): void {
    if (warned) return;
    warned = true;
    console.error(message);
  }

  const salt = () => validSecret(opts.salt ?? process.env.ANALYTICS_DAILY_SALT);

  function pseudonymKey(): string | null {
    const explicit = opts.pseudonymKey ?? process.env.ANALYTICS_PSEUDONYM_KEY;
    return explicit ? validSecret(explicit) : salt();
  }

  return {
    pseudonymize(value) {
      const key = pseudonymKey();
      if (!key) {
        warnOnce(
          `rt-analytics: pseudonym key or salt missing or shorter than ${MIN_SECRET_LENGTH} characters; skipping server events`,
        );
        return null;
      }
      return pseudonymizeWith(key, opts.appId, value);
    },

    async track(name, props = {}) {
      try {
        if (!NAME_RE.test(name)) {
          console.error(`rt-analytics: invalid server event name "${name}"; dropped`);
          return;
        }
        const json = Object.keys(props).length > 0 ? JSON.stringify(props) : null;
        if (json && Buffer.byteLength(json, "utf8") > MAX_PROPS_BYTES) {
          console.error(`rt-analytics: server event props over ${MAX_PROPS_BYTES} bytes; dropped`);
          return;
        }
        // Credentials before salt, like the ingest handler.
        const writer = opts.writer ?? writerFromEnv();
        if (!writer) return;
        if (!salt()) {
          warnOnce(
            `rt-analytics: ANALYTICS_DAILY_SALT is missing or shorter than ${MIN_SECRET_LENGTH} characters; skipping server events`,
          );
          return;
        }
        const row: EventRow = {
          event_id: randomUUID(),
          app_id: opts.appId,
          event_name: name,
          timestamp: opts.now ? opts.now() : new Date(),
          visitor_id: null,
          session_id: null,
          user_id: null,
          page_path: null,
          referrer: null,
          utm_source: null,
          utm_medium: null,
          utm_campaign: null,
          country: null,
          browser: null,
          os: null,
          device_type: null,
          viewport_w: null,
          viewport_h: null,
          props: json,
          consent_state: "server",
          sdk_version: SDK_VERSION,
        };
        await writer.write([row]);
      } catch (err) {
        console.error("rt-analytics server event error:", err);
      }
    },
  };
}
