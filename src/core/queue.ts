import type { AnalyticsEvent, Batch, ConsentState } from "./types.js";

export interface BatchMeta {
  appId: string;
  sdkVersion: string;
  consentState: ConsentState;
}

export interface Transport {
  send(url: string, body: string, useBeacon: boolean): void;
}

export const fetchTransport: Transport = {
  send(url, body, useBeacon) {
    if (useBeacon && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  },
};

export class EventQueue {
  private buffer: AnalyticsEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private opts: {
      endpoint: string;
      flushIntervalMs: number;
      maxBatchSize: number;
      transport: Transport;
      getMeta: () => BatchMeta;
    },
  ) {}

  enqueue(event: AnalyticsEvent): void {
    this.buffer.push(event);
    if (this.buffer.length >= this.opts.maxBatchSize) {
      this.flush();
      return;
    }
    if (!this.timer) {
      this.timer = setInterval(() => this.flush(), this.opts.flushIntervalMs);
    }
  }

  flush(useBeacon = false): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.buffer.length === 0) return;
    const batch: Batch = { ...this.opts.getMeta(), events: this.buffer };
    this.buffer = [];
    this.opts.transport.send(this.opts.endpoint, JSON.stringify(batch), useBeacon);
  }
}
