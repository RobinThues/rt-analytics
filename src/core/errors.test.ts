// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { setupErrorCapture } from "./errors.js";

describe("setupErrorCapture", () => {
  it("reports window error events truncated to 500 chars", () => {
    const report = vi.fn();
    const teardown = setupErrorCapture(report);
    window.dispatchEvent(new ErrorEvent("error", { message: "x".repeat(600), filename: "app.js", lineno: 7 }));
    expect(report).toHaveBeenCalledWith("$error", {
      message: "x".repeat(500),
      source: "app.js",
      line: 7,
    });
    teardown();
    window.dispatchEvent(new ErrorEvent("error", { message: "after" }));
    expect(report).toHaveBeenCalledTimes(1);
  });
});
