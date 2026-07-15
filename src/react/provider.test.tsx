// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AnalyticsProvider, useAnalytics } from "./provider.js";

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
