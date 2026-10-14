import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventQueue, type Transport } from "./queue.js";
import type { AnalyticsEvent, Batch } from "./types.js";

function ev(name: string): AnalyticsEvent {
  return {
    eventId: crypto.randomUUID(), name, ts: new Date().toISOString(),
    sessionId: "s1", visitorId: null, userId: null, pagePath: "/", referrer: null,
    utmSource: null, utmMedium: null, utmCampaign: null, viewportW: null, viewportH: null, props: {},
  };
}

describe("EventQueue", () => {
  const sent: { url: string; batch: Batch; beacon: boolean }[] = [];
  const transport: Transport = {
    send: (url, body, beacon) => void sent.push({ url, batch: JSON.parse(body), beacon }),
  };
  const makeQueue = () =>
    new EventQueue({
      endpoint: "/api/a", flushIntervalMs: 5000, maxBatchSize: 3, transport,
      getMeta: () => ({ appId: "test", sdkVersion: "0.1.0", consentState: "pending" }),
    });

  beforeEach(() => {
    sent.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("flushes when maxBatchSize is reached", () => {
    const q = makeQueue();
    q.enqueue(ev("a")); q.enqueue(ev("b"));
    expect(sent).toHaveLength(0);
    q.enqueue(ev("c"));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.batch.events.map((e) => e.name)).toEqual(["a", "b", "c"]);
    expect(sent[0]!.batch.appId).toBe("test");
  });

  it("flushes on the interval timer", () => {
    const q = makeQueue();
    q.enqueue(ev("a"));
    vi.advanceTimersByTime(5000);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.batch.events).toHaveLength(1);
  });

  it("manual flush(true) uses the beacon path and empties the buffer", () => {
    const q = makeQueue();
    q.enqueue(ev("a"));
    q.flush(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.beacon).toBe(true);
    q.flush();
    expect(sent).toHaveLength(1); // nothing left to send
  });
});
