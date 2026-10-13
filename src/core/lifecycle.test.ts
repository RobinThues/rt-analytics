// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

type VitalHandler = (m: { name: string; value: number; rating: string }) => void;
const vitalHandlers: VitalHandler[] = [];
vi.mock("web-vitals", () => ({
  onCLS: (h: VitalHandler) => void vitalHandlers.push(h),
  onINP: (h: VitalHandler) => void vitalHandlers.push(h),
  onLCP: (h: VitalHandler) => void vitalHandlers.push(h),
}));

import { createAnalytics, createAnalyticsUnstarted } from "./analytics.js";
import { fakeStorage } from "../test-utils.js";
import type { Batch } from "./types.js";

// Each instance gets its own array: listeners of earlier instances may still be attached.
function depsFor(sent: Batch[]) {
  return {
    localStorage: fakeStorage(),
    sessionStorage: fakeStorage(),
    transport: { send: (_u: string, body: string) => void sent.push(JSON.parse(body)) },
  };
}
const count = (sent: Batch[], name: string) => sent.flatMap((b) => b.events).filter((e) => e.name === name).length;
const fireError = () => window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));

describe("listener lifecycle", () => {
  beforeEach(() => {
    vitalHandlers.length = 0;
  });

  it("createAnalytics captures errors right away (unchanged for direct users)", () => {
    const sent: Batch[] = [];
    const a = createAnalytics({ appId: "t" }, depsFor(sent));
    fireError();
    a.flush();
    expect(count(sent, "$error")).toBe(1);
  });

  it("an unstarted instance tracks, but captures errors only between start() and stop()", () => {
    const sent: Batch[] = [];
    const { analytics, start } = createAnalyticsUnstarted({ appId: "t" }, depsFor(sent));
    analytics.page();
    fireError();
    analytics.flush();
    expect(count(sent, "$pageview")).toBe(1);
    expect(count(sent, "$error")).toBe(0);

    const stop = start();
    fireError();
    analytics.flush();
    expect(count(sent, "$error")).toBe(1);

    stop();
    fireError();
    analytics.flush();
    expect(count(sent, "$error")).toBe(1);
  });

  it("start() is idempotent while active", () => {
    const sent: Batch[] = [];
    const { analytics, start } = createAnalyticsUnstarted({ appId: "t" }, depsFor(sent));
    start();
    const stop = start();
    fireError();
    analytics.flush();
    expect(count(sent, "$error")).toBe(1);
    stop();
  });

  it("registers Web Vitals once per instance and reports them only while active", () => {
    const sent: Batch[] = [];
    const { analytics, start } = createAnalyticsUnstarted({ appId: "t" }, depsFor(sent));
    start()();
    const stop = start();
    expect(vitalHandlers).toHaveLength(3);

    stop();
    vitalHandlers[0]!({ name: "CLS", value: 0.1, rating: "good" });
    analytics.flush();
    expect(count(sent, "$web_vital")).toBe(0);

    start();
    vitalHandlers[0]!({ name: "CLS", value: 0.1, rating: "good" });
    analytics.flush();
    expect(count(sent, "$web_vital")).toBe(1);
  });
});
