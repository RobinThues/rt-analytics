// @vitest-environment happy-dom
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AnalyticsProvider, useAnalytics } from "./provider.js";
import type { Batch } from "../core/types.js";

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
    return bodies
      .flatMap((b) => (JSON.parse(b) as Batch).events)
      .filter((e) => e.name === "$error").length;
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
