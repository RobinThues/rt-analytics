import { validateBatch } from "./validate.js";
import { dailyVisitorId, isBot, parseUserAgent } from "./enrich.js";
import { createBigQueryWriter, type EventRow, type RowWriter } from "./bigquery-writer.js";

export interface HandlerOptions {
  datasetId?: string;
  tableId?: string;
  maxBodyBytes?: number;
  /** At least 16 characters. Default process.env.ANALYTICS_DAILY_SALT */
  salt?: string;
  writer?: RowWriter;
  now?: () => Date;
}

const MAX_SKEW_MS = 48 * 60 * 60 * 1000;
/** Minimum length for the salt and the ignore key. */
const MIN_SECRET_LENGTH = 16;

function accepted(): Response {
  return new Response(null, { status: 202 });
}

export function createAnalyticsHandler(opts: HandlerOptions = {}) {
  let writer: RowWriter | null = opts.writer ?? null;
  let saltErrorLogged = false;

  function resolveWriter(): RowWriter | null {
    if (writer) return writer;
    const raw = process.env.ANALYTICS_GCP_CREDENTIALS;
    if (!raw) {
      console.error("rt-analytics: ANALYTICS_GCP_CREDENTIALS is not set; dropping events");
      return null;
    }
    const creds = JSON.parse(raw) as { project_id: string; client_email: string; private_key: string };
    writer = createBigQueryWriter({
      projectId: creds.project_id,
      datasetId: opts.datasetId ?? "analytics",
      tableId: opts.tableId ?? "events",
      credentials: { client_email: creds.client_email, private_key: creds.private_key },
    });
    return writer;
  }

  // Without a salt the daily visitor id is a plain hash of IP + user agent, which can be brute-forced back to the IP.
  function resolveSalt(): string | null {
    const salt = opts.salt ?? process.env.ANALYTICS_DAILY_SALT ?? "";
    if (salt.length >= MIN_SECRET_LENGTH) return salt;
    if (!saltErrorLogged) {
      saltErrorLogged = true;
      console.error(
        `rt-analytics: ANALYTICS_DAILY_SALT is missing or shorter than ${MIN_SECRET_LENGTH} characters; dropping events`,
      );
    }
    return null;
  }

  async function POST(req: Request): Promise<Response> {
    try {
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== new URL(req.url).host) return accepted();

      const ua = req.headers.get("user-agent");
      if (isBot(ua)) return accepted();

      const text = await req.text();
      if (Buffer.byteLength(text, "utf8") > (opts.maxBodyBytes ?? 50_000)) return accepted();

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return accepted();
      }
      const batch = validateBatch(parsed);
      if (!batch) return accepted();

      // Credentials before salt, so local and Preview logs keep naming the real reason.
      const target = resolveWriter();
      if (!target) return accepted();
      const salt = resolveSalt();
      if (!salt) return accepted();

      const now = opts.now ? opts.now() : new Date();
      const uaInfo = parseUserAgent(ua as string);
      const country = req.headers.get("x-vercel-ip-country");
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";

      const rows: EventRow[] = batch.events.map((e) => {
        const ts = new Date(e.ts);
        const skewed = Math.abs(ts.getTime() - now.getTime()) > MAX_SKEW_MS;
        return {
          event_id: e.eventId,
          app_id: batch.appId,
          event_name: e.name,
          timestamp: skewed ? now : ts,
          visitor_id: e.visitorId ?? dailyVisitorId(salt, ip, ua as string, batch.appId, now),
          session_id: e.sessionId,
          user_id: e.userId,
          page_path: e.pagePath || null,
          referrer: e.referrer,
          utm_source: e.utmSource,
          utm_medium: e.utmMedium,
          utm_campaign: e.utmCampaign,
          country,
          browser: uaInfo.browser,
          os: uaInfo.os,
          device_type: uaInfo.deviceType,
          viewport_w: e.viewportW,
          viewport_h: e.viewportH,
          props: Object.keys(e.props).length > 0 ? JSON.stringify(e.props) : null,
          consent_state: batch.consentState,
          sdk_version: batch.sdkVersion,
        };
      });

      await target.write(rows);
      return accepted();
    } catch (err) {
      console.error("rt-analytics ingest error:", err);
      return accepted();
    }
  }

  return { POST };
}
