import { describe, expect, it } from "vitest";
import { formatBytes } from "./format";

describe("formatBytes", () => {
  it("uses decimal units", () => {
    expect(formatBytes(1_000_000_000)).toBe("1 GB");
    expect(formatBytes(500_000_000)).toBe("500 MB");
    expect(formatBytes(2_500_000_000)).toBe("2.5 GB");
    expect(formatBytes(999)).toBe("999 B");
  });
});
