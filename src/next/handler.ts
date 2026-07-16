import { validateBatch } from "./validate.js";
import { dailyVisitorId, isBot, parseUserAgent } from "./enrich.js";
import { createBigQueryWriter, type EventRow, type RowWriter } from "./bigquery-writer.js";

export interface HandlerOptions {
  datasetId?: string;
  tableId?: string;
  maxBodyBytes?: number;
  salt?: string;
  writer?: RowWriter;
  now?: () => Date;
}

const MAX_SKEW_MS = 48 * 60 * 60 * 1000;

function accepted(): Response {
  return new Response(null, { status: 202 });
}

export function createAnalyticsHandler(opts: HandlerOptions = {}) {
  let writer: RowWriter | null = opts.writer ?? null;

  async function POST(req: Request): Promise<Response> {
    try {
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== new URL(req.url).host) return accepted();

      const ua = req.headers.get("user-agent");
      if (isBot(ua)) return accepted();

      const text = await req.text();
      if (text.length > (opts.maxBodyBytes ?? 50_000)) return accepted();

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return accepted();
      }
      const batch = validateBatch(parsed);
      if (!batch) return accepted();

      const now = opts.now ? opts.now() : new Date();
      const uaInfo = parseUserAgent(ua as string);
      const country = req.headers.get("x-vercel-ip-country");
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
      const salt = opts.salt ?? process.env.ANALYTICS_DAILY_SALT ?? "";

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

      if (!writer) {
        const raw = process.env.ANALYTICS_GCP_CREDENTIALS;
        if (!raw) {
          console.error("rt-analytics: ANALYTICS_GCP_CREDENTIALS is not set; dropping events");
          return accepted();
        }
        const creds = JSON.parse(raw) as { project_id: string; client_email: string; private_key: string };
        writer = createBigQueryWriter({
          projectId: creds.project_id,
          datasetId: opts.datasetId ?? "analytics",
          tableId: opts.tableId ?? "events",
          credentials: { client_email: creds.client_email, private_key: creds.private_key },
        });
      }
      await writer.write(rows);
      return accepted();
    } catch (err) {
      console.error("rt-analytics ingest error:", err);
      return accepted();
    }
  }

  return { POST };
}
