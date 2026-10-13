import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { AnalyticsProvider } from "./provider.js";

describe("AnalyticsProvider on the server", () => {
  it("renders without an instance and without touching window", () => {
    const html = renderToString(
      <AnalyticsProvider appId="t">
        <span>ok</span>
      </AnalyticsProvider>,
    );
    expect(html).toContain("ok");
  });
});
