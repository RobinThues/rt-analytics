import { describe, expect, it } from "vitest";
import { appSwitchHref, pageHref } from "./app-switch";

describe("appSwitchHref", () => {
  it("keeps the page and the range, drops the old app's selection", () => {
    expect(appSwitchHref("/demo/events", "wik", "?from=a&to=b&compare=0&event=x&metric=events")).toBe(
      "/wik/events?from=a&to=b&compare=0",
    );
    expect(appSwitchHref("/demo/funnels", "wik", "?from=a&to=b&steps=s1&funnel=f")).toBe("/wik/funnels?from=a&to=b");
    expect(appSwitchHref("/demo", "wik", "?from=a&to=b")).toBe("/wik?from=a&to=b");
    expect(appSwitchHref("/demo/settings", "wik", "")).toBe("/wik/settings");
  });

  it("an unknown path segment falls back to the overview", () => {
    expect(appSwitchHref("/demo/whatever", "wik", "?from=a&to=b")).toBe("/wik?from=a&to=b");
  });
});

describe("pageHref", () => {
  it("keeps only the range", () => {
    expect(pageHref("demo", "funnels", "?from=a&to=b&event=x")).toBe("/demo/funnels?from=a&to=b");
    expect(pageHref("demo", "overview", "?compare=0")).toBe("/demo?compare=0");
    expect(pageHref("demo", "settings", "?from=a")).toBe("/demo/settings?from=a");
  });
});
