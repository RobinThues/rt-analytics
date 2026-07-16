import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAnalyticsHandler } from "./handler.js";
import type { EventRow, RowWriter } from "./bigquery-writer.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const NOW = new Date("2026-07-11T12:00:00.000Z");

function batchBody(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    appId: "wordle",
    sdkVersion: "0.1.0",
    consentState: "pending",
    events: [
      {
        eventId: "e1", name: "$pageview", ts: "2026-07-11T11:59:00.000Z", sessionId: "s1",
        visitorId: null, userId: null, pagePath: "/play", referrer: null,
        utmSource: null, utmMedium: null, utmCampaign: null,
        viewportW: 800, viewportH: 600, props: { a: 1 },
      },
    ],
    ...over,
  });
}

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://wordle.example.com/api/a", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "user-agent": UA,
      origin: "https://wordle.example.com",
      "x-forwarded-for": "1.2.3.4, 10.0.0.1",
      "x-vercel-ip-country": "DE",
      ...headers,
    },
  });
}

describe("createAnalyticsHandler", () => {
  let written: EventRow[][];
  let writer: RowWriter;
  let handler: { POST(req: Request): Promise<Response> };

  beforeEach(() => {
    written = [];
    writer = { write: vi.fn(async (rows: EventRow[]) => void written.push(rows)) };
    handler = createAnalyticsHandler({ writer, salt: "test-salt", now: () => NOW });
  });

  it("writes enriched rows and returns 202", async () => {
    const res = await handler.POST(request(batchBody()));
    expect(res.status).toBe(202);
    const row = written[0]![0]!;
    expect(row).toMatchObject({
      app_id: "wordle", event_name: "$pageview", country: "DE",
      browser: "Chrome", os: "macOS", device_type: "desktop",
      page_path: "/play", consent_state: "pending", props: '{"a":1}',
    });
    expect(row.timestamp).toEqual(new Date("2026-07-11T11:59:00.000Z"));
    expect(row.visitor_id).toMatch(/^d_[0-9a-f]{32}$/); // cookieless daily hash fallback
  });

  it("keeps a client-provided visitorId (consented mode)", async () => {
    const body = JSON.parse(batchBody({ consentState: "accepted" }));
    body.events[0].visitorId = "v-persistent";
    await handler.POST(request(JSON.stringify(body)));
    expect(written[0]![0]!.visitor_id).toBe("v-persistent");
  });

  it("clamps timestamps more than 48h from server time", async () => {
    const body = JSON.parse(batchBody());
    body.events[0].ts = "1999-01-01T00:00:00.000Z";
    await handler.POST(request(JSON.stringify(body)));
    expect(written[0]![0]!.timestamp).toEqual(NOW);
  });

  it("silently drops: cross-origin, bots, oversized bodies, invalid JSON, invalid batches", async () => {
    const cases = [
      request(batchBody(), { origin: "https://evil.example.net" }),
      request(batchBody(), { "user-agent": "Googlebot/2.1" }),
      request("x".repeat(50_001)),
      request("{not json"),
      request(JSON.stringify({ appId: "wordle" })),
    ];
    for (const req of cases) {
      const res = await handler.POST(req);
      expect(res.status).toBe(202);
    }
    expect(written).toHaveLength(0);
  });

  it("returns 202 even when the writer throws", async () => {
    const failing = createAnalyticsHandler({
      writer: { write: vi.fn().mockRejectedValue(new Error("boom")) },
      salt: "s", now: () => NOW,
    });
    const res = await failing.POST(request(batchBody()));
    expect(res.status).toBe(202);
  });
});
