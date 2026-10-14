// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { cleanup, render } from "@testing-library/react";

let pathname = "/start";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { AnalyticsProvider } from "../../react/provider.js";
import { PageviewTracker } from "./pageview-tracker.js";
import { createAnalytics } from "../../core/analytics.js";
import { fakeStorage } from "../../test-utils.js";
import type { Batch } from "../../core/types.js";

describe("PageviewTracker", () => {
  afterEach(cleanup);

  it("tracks a pageview on mount and on pathname change", () => {
    const batches: Batch[] = [];
    const analytics = createAnalytics(
      { appId: "t" },
      {
        localStorage: fakeStorage(),
        sessionStorage: fakeStorage(),
        transport: { send: (_u, body) => void batches.push(JSON.parse(body)) },
      },
    );
    const ui = (
      <AnalyticsProvider appId="t" instance={analytics}>
        <PageviewTracker />
      </AnalyticsProvider>
    );
    const { rerender } = render(ui);
    pathname = "/next-page";
    rerender(
      <AnalyticsProvider appId="t" instance={analytics}>
        <PageviewTracker />
      </AnalyticsProvider>,
    );
    analytics.flush();
    const pageviews = batches.flatMap((b) => b.events).filter((e) => e.name === "$pageview");
    expect(pageviews).toHaveLength(2);
  });

  it("sends one pageview per path under StrictMode", () => {
    pathname = "/strict";
    const batches: Batch[] = [];
    const analytics = createAnalytics(
      { appId: "t" },
      {
        localStorage: fakeStorage(),
        sessionStorage: fakeStorage(),
        transport: { send: (_u, body) => void batches.push(JSON.parse(body)) },
      },
    );
    const ui = () => (
      <StrictMode>
        <AnalyticsProvider instance={analytics}>
          <PageviewTracker />
        </AnalyticsProvider>
      </StrictMode>
    );
    const count = () => {
      analytics.flush();
      return batches.flatMap((b) => b.events).filter((e) => e.name === "$pageview").length;
    };

    const { rerender } = render(ui());
    expect(count()).toBe(1);
    pathname = "/strict-next";
    rerender(ui());
    expect(count()).toBe(2);
  });
});
