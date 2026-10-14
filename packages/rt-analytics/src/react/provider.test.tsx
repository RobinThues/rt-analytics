// @vitest-environment happy-dom
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AnalyticsProvider, useAnalytics } from "./provider.js";
import type { Batch } from "../core/types.js";
import { createAnalytics } from "../core/analytics.js";

function Probe() {
  const analytics = useAnalytics();
  return <span>{analytics.getConsent()}</span>;
}

describe("AnalyticsProvider", () => {
  afterEach(cleanup);

  it("provides an analytics instance to children", () => {
    render(
      <AnalyticsProvider appId="test-app">
        <Probe />
      </AnalyticsProvider>,
    );
    expect(screen.getByText("pending")).toBeTruthy();
  });

  it("useAnalytics throws outside the provider", () => {
    expect(() => render(<Probe />)).toThrow(/AnalyticsProvider/);
  });

  it("keeps the first instance when the instance prop changes later (as in 0.1.0)", () => {
    const seen: unknown[] = [];
    function Capture() {
      seen.push(useAnalytics());
      return null;
    }
    const given = createAnalytics({ appId: "t" }, { transport: { send: () => {} } });
    const { rerender } = render(
      <AnalyticsProvider instance={given}>
        <Capture />
      </AnalyticsProvider>,
    );
    expect(() =>
      rerender(
        <AnalyticsProvider appId="t">
          <Capture />
        </AnalyticsProvider>,
      ),
    ).not.toThrow();
    expect(seen.at(-1)).toBe(given);

    const created = render(
      <AnalyticsProvider appId="t">
        <Capture />
      </AnalyticsProvider>,
    );
    const first = seen.at(-1);
    created.rerender(
      <AnalyticsProvider instance={given}>
        <Capture />
      </AnalyticsProvider>,
    );
    expect(seen.at(-1)).toBe(first);
  });
});

describe("AnalyticsProvider listeners", () => {
  let bodies: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    bodies = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(String(init.body));
        return new Response(null, { status: 202 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const tree = () => (
    <StrictMode>
      <AnalyticsProvider appId="t" captureWebVitals={false}>
        <span>child</span>
      </AnalyticsProvider>
    </StrictMode>
  );

  function errorsSent(): number {
    vi.advanceTimersByTime(6000);
    return bodies.flatMap((b) => (JSON.parse(b) as Batch).events).filter((e) => e.name === "$error").length;
  }

  it("sends one $error per error under StrictMode", () => {
    render(tree());
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    expect(errorsSent()).toBe(1);
  });

  it("does not stack listeners across unmount and remount", () => {
    const first = render(tree());
    first.unmount();
    render(tree());
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    expect(errorsSent()).toBe(1);
  });
});
