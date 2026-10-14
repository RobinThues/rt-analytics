// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnalyticsProvider } from "./provider.js";
import { ConsentBanner } from "./consent-banner.js";
import { createAnalytics } from "../core/analytics.js";
import { fakeStorage } from "../test-utils.js";

function make() {
  return createAnalytics(
    { appId: "t" },
    { localStorage: fakeStorage(), sessionStorage: fakeStorage(), transport: { send: () => {} } },
  );
}

describe("ConsentBanner", () => {
  afterEach(cleanup);

  it("shows while pending and hides after accept", () => {
    render(
      <AnalyticsProvider appId="t" instance={make()}>
        <ConsentBanner />
      </AnalyticsProvider>,
    );
    fireEvent.click(screen.getByText("Accept"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hides after decline and stays hidden when consent was already given", () => {
    const analytics = make();
    analytics.declineConsent();
    render(
      <AnalyticsProvider appId="t" instance={analytics}>
        <ConsentBanner />
      </AnalyticsProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("supports custom labels and message", () => {
    render(
      <AnalyticsProvider appId="t" instance={make()}>
        <ConsentBanner message="Kekse?" acceptLabel="Ja" declineLabel="Nein" />
      </AnalyticsProvider>,
    );
    expect(screen.getByText("Kekse?")).toBeTruthy();
    fireEvent.click(screen.getByText("Nein"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
