import { createServerTracker } from "rt-analytics/next";

const tracker = createServerTracker({ appId: "demo" });

// Mimics dwd's calendar feed: /api/cal?s=<16 hex> records one calendar_poll per request.
export async function GET(req: Request): Promise<Response> {
  const s = new URL(req.url).searchParams.get("s") ?? "";
  if (/^[0-9a-f]{16}$/.test(s)) {
    const subscription = tracker.pseudonymize(`s:${s}`);
    if (subscription) await tracker.track("calendar_poll", { subscription, kind: "token", client: "browser" });
  }
  return new Response("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n", {
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" },
  });
}
