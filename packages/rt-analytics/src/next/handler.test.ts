import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnalyticsHandler } from "./handler.js";
import type { EventRow, RowWriter } from "./bigquery-writer.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const NOW = new Date("2026-07-11T12:00:00.000Z");
const SALT = "test-salt-0123456789";

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
    handler = createAnalyticsHandler({ writer, salt: SALT, now: () => NOW });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
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
    const write = vi.fn().mockRejectedValue(new Error("boom"));
    const failing = createAnalyticsHandler({ writer: { write }, salt: SALT, now: () => NOW });
    const res = await failing.POST(request(batchBody()));
    expect(res.status).toBe(202);
    expect(write).toHaveBeenCalledOnce();
  });

  it("drops events and logs once when the salt is shorter than 16 characters", async () => {
    const short = createAnalyticsHandler({ writer, salt: "short", now: () => NOW });
    await short.POST(request(batchBody()));
    const res = await short.POST(request(batchBody()));
    expect(res.status).toBe(202);
    expect(written).toHaveLength(0);
    const saltErrors = vi.mocked(console.error).mock.calls.filter((c) => String(c[0]).includes("ANALYTICS_DAILY_SALT"));
    expect(saltErrors).toHaveLength(1);
  });

  it("drops events when no salt is configured at all", async () => {
    vi.stubEnv("ANALYTICS_DAILY_SALT", "");
    const noSalt = createAnalyticsHandler({ writer, now: () => NOW });
    await noSalt.POST(request(batchBody()));
    expect(written).toHaveLength(0);
  });

  it("uses ANALYTICS_DAILY_SALT from the environment when long enough", async () => {
    vi.stubEnv("ANALYTICS_DAILY_SALT", SALT);
    const envSalt = createAnalyticsHandler({ writer, now: () => NOW });
    await envSalt.POST(request(batchBody()));
    expect(written).toHaveLength(1);
  });

  it("reports missing credentials before checking the salt", async () => {
    vi.stubEnv("ANALYTICS_GCP_CREDENTIALS", "");
    vi.stubEnv("ANALYTICS_DAILY_SALT", "");
    const bare = createAnalyticsHandler({ now: () => NOW });
    const res = await bare.POST(request(batchBody()));
    expect(res.status).toBe(202);
    const messages = vi.mocked(console.error).mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("ANALYTICS_GCP_CREDENTIALS is not set"))).toBe(true);
    expect(messages.some((m) => m.includes("ANALYTICS_DAILY_SALT"))).toBe(false);
  });

  describe("allowedAppIds", () => {
    const make = (allowedAppIds?: string[]) =>
      createAnalyticsHandler({ writer, salt: SALT, now: () => NOW, allowedAppIds });

    it("writes batches for an allowed appId", async () => {
      await make(["wordle"]).POST(request(batchBody()));
      expect(written).toHaveLength(1);
    });

    it("drops batches for any other appId", async () => {
      await make(["other-app"]).POST(request(batchBody()));
      expect(written).toHaveLength(0);
    });

    it("matches exactly, so a different case is dropped", async () => {
      await make(["Wordle"]).POST(request(batchBody()));
      expect(written).toHaveLength(0);
    });

    it("drops everything for an empty list", async () => {
      await make([]).POST(request(batchBody()));
      expect(written).toHaveLength(0);
    });

    it("accepts any appId when unset and warns once per instance", async () => {
      const open = make(undefined);
      await open.POST(request(batchBody()));
      await open.POST(request(batchBody()));
      expect(written).toHaveLength(2);
      const warnings = vi.mocked(console.warn).mock.calls.filter((c) => String(c[0]).includes("allowedAppIds"));
      expect(warnings).toHaveLength(1);
    });
  });
});

describe("ignore link", () => {
  const KEY = "ignore-key-0123456789";
  let written: EventRow[][];
  let writer: RowWriter;

  const get = (query: string, headers: Record<string, string> = {}) =>
    new Request(`https://wordle.example.com/api/a${query}`, { headers: { "user-agent": UA, ...headers } });

  const make = (ignoreKey?: string) => createAnalyticsHandler({ writer, salt: SALT, now: () => NOW, ignoreKey });

  beforeEach(() => {
    written = [];
    writer = { write: vi.fn(async (rows: EventRow[]) => void written.push(rows)) };
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("sets the cookie and shows the page for the right key", async () => {
    const res = await make(KEY).GET(get(`?ignore=${KEY}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBe(
      "rta_ignore=1; Path=/api/a; Max-Age=34560000; HttpOnly; Secure; SameSite=Lax",
    );
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(await res.text()).toContain("now excluded");
  });

  it("reads the key from ANALYTICS_IGNORE_KEY", async () => {
    vi.stubEnv("ANALYTICS_IGNORE_KEY", KEY);
    const res = await make().GET(get(`?ignore=${KEY}`));
    expect(res.status).toBe(200);
  });

  it("says already excluded when the cookie is present", async () => {
    const res = await make(KEY).GET(get(`?ignore=${KEY}`, { cookie: "rta_ignore=1" }));
    expect(await res.text()).toContain("already excluded");
  });

  it("clears the cookie on undo", async () => {
    const res = await make(KEY).GET(get(`?ignore=${KEY}&undo=1`, { cookie: "rta_ignore=1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await res.text()).toContain("counted in analytics again");
  });

  it("accepts a key with URL and HTML special characters", async () => {
    const special = 'a b&c"d<e+f-0123456789';
    const res = await make(special).GET(get(`?ignore=${encodeURIComponent(special)}`));
    expect(res.status).toBe(200);
  });

  it("answers 404 with an empty body for wrong, missing, empty, repeated or non-ASCII keys", async () => {
    const h = make(KEY);
    for (const query of ["", "?ignore=wrong", "?ignore=", `?ignore=wrong&ignore=${KEY}`, `?ignore=${encodeURIComponent("ä".repeat(KEY.length))}`]) {
      const res = await h.GET(get(query));
      expect(res.status, query).toBe(404);
      expect(res.headers.get("set-cookie")).toBeNull();
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.text()).toBe("");
    }
  });

  it("answers 404 when no key is configured", async () => {
    vi.stubEnv("ANALYTICS_IGNORE_KEY", "");
    const res = await make().GET(get("?ignore=anything-long-enough-123"));
    expect(res.status).toBe(404);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("answers 404 and logs once for a key shorter than 16 characters", async () => {
    const h = make("short");
    await h.GET(get("?ignore=short"));
    const res = await h.GET(get("?ignore=short"));
    expect(res.status).toBe(404);
    const keyErrors = vi.mocked(console.error).mock.calls.filter((c) => String(c[0]).includes("ANALYTICS_IGNORE_KEY"));
    expect(keyErrors).toHaveLength(1);
  });

  it("drops POSTs carrying the cookie, marks them and refreshes the cookie", async () => {
    const res = await make(KEY).POST(request(batchBody(), { cookie: "a=b; rta_ignore=1" }));
    expect(res.status).toBe(202);
    expect(res.headers.get("x-rta")).toBe("ignored");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=34560000");
    expect(written).toHaveLength(0);
  });

  it("drops ignored POSTs without reading the body", async () => {
    const req = request(batchBody(), { cookie: "rta_ignore=1" });
    const text = vi.spyOn(req, "text");
    const res = await make(KEY).POST(req);
    expect(res.headers.get("x-rta")).toBe("ignored");
    expect(text).not.toHaveBeenCalled();
  });

  it("drops POSTs carrying the cookie even when no key is configured", async () => {
    vi.stubEnv("ANALYTICS_IGNORE_KEY", "");
    await make().POST(request(batchBody(), { cookie: "rta_ignore=1" }));
    expect(written).toHaveLength(0);
  });

  it("writes POSTs with similar but different cookies, without the marker header", async () => {
    const res = await make(KEY).POST(request(batchBody(), { cookie: "xrta_ignore=1" }));
    expect(res.headers.get("x-rta")).toBeNull();
    expect(written).toHaveLength(1);
  });
});
