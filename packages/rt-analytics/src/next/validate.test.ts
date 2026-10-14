import { describe, expect, it } from "vitest";
import { validateBatch } from "./validate.js";

function validEvent(over: Record<string, unknown> = {}) {
  return {
    eventId: "e1", name: "$pageview", ts: "2026-07-11T10:00:00.000Z", sessionId: "s1",
    visitorId: null, userId: null, pagePath: "/x", referrer: null,
    utmSource: null, utmMedium: null, utmCampaign: null,
    viewportW: 800, viewportH: 600, props: {},
    ...over,
  };
}

function validBatch(over: Record<string, unknown> = {}) {
  return { appId: "wordle", sdkVersion: "0.1.0", consentState: "pending", events: [validEvent()], ...over };
}

describe("validateBatch", () => {
  it("accepts a valid batch", () => {
    const b = validateBatch(validBatch());
    expect(b).not.toBeNull();
    expect(b!.events[0]!.name).toBe("$pageview");
  });

  it("rejects non-objects, bad appId, bad consent, empty and oversized batches", () => {
    expect(validateBatch("nope")).toBeNull();
    expect(validateBatch(validBatch({ appId: "has spaces!" }))).toBeNull();
    expect(validateBatch(validBatch({ consentState: "maybe" }))).toBeNull();
    expect(validateBatch(validBatch({ events: [] }))).toBeNull();
    expect(validateBatch(validBatch({ events: Array(26).fill(validEvent()) }))).toBeNull();
  });

  it("rejects the whole batch when any event is invalid", () => {
    expect(validateBatch(validBatch({ events: [validEvent(), validEvent({ name: "has spaces" })] }))).toBeNull();
    expect(validateBatch(validBatch({ events: [validEvent({ ts: "not-a-date" })] }))).toBeNull();
    expect(validateBatch(validBatch({ events: [validEvent({ sessionId: 42 })] }))).toBeNull();
  });

  it("truncates long strings and drops oversized or non-object props", () => {
    const long = "p".repeat(3000);
    const b = validateBatch(validBatch({ events: [validEvent({ pagePath: long, props: { blob: "x".repeat(5000) } })] }));
    expect(b!.events[0]!.pagePath).toHaveLength(1024);
    expect(b!.events[0]!.props).toEqual({});
    const arr = validateBatch(validBatch({ events: [validEvent({ props: [1, 2] })] }));
    expect(arr!.events[0]!.props).toEqual({});
  });

  it("normalizes wrong-typed optional fields to null", () => {
    const b = validateBatch(validBatch({ events: [validEvent({ referrer: 7, viewportW: "wide" })] }));
    expect(b!.events[0]!.referrer).toBeNull();
    expect(b!.events[0]!.viewportW).toBeNull();
  });
});
