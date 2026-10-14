import { describe, expect, it } from "vitest";
import { dailyVisitorId, isBot, parseUserAgent } from "./enrich.js";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const FIREFOX_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0";

describe("parseUserAgent", () => {
  it("identifies common browsers, OS and device type", () => {
    expect(parseUserAgent(CHROME_MAC)).toEqual({ browser: "Chrome", os: "macOS", deviceType: "desktop" });
    expect(parseUserAgent(SAFARI_IPHONE)).toEqual({ browser: "Safari", os: "iOS", deviceType: "mobile" });
    expect(parseUserAgent(FIREFOX_WIN)).toEqual({ browser: "Firefox", os: "Windows", deviceType: "desktop" });
  });
});

describe("isBot", () => {
  it("flags bots, headless browsers, curl and missing UA", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("Mozilla/5.0 HeadlessChrome/126.0")).toBe(true);
    expect(isBot("curl/8.6.0")).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(isBot(CHROME_MAC)).toBe(false);
  });
});

describe("dailyVisitorId", () => {
  it("is deterministic within a day, differs across days/ips/apps", () => {
    const d1 = new Date("2026-07-11T08:00:00Z");
    const d1later = new Date("2026-07-11T22:00:00Z");
    const d2 = new Date("2026-07-12T08:00:00Z");
    const id = dailyVisitorId("salt", "1.2.3.4", CHROME_MAC, "wordle", d1);
    expect(id).toMatch(/^d_[0-9a-f]{32}$/);
    expect(dailyVisitorId("salt", "1.2.3.4", CHROME_MAC, "wordle", d1later)).toBe(id);
    expect(dailyVisitorId("salt", "1.2.3.4", CHROME_MAC, "wordle", d2)).not.toBe(id);
    expect(dailyVisitorId("salt", "5.6.7.8", CHROME_MAC, "wordle", d1)).not.toBe(id);
    expect(dailyVisitorId("salt", "1.2.3.4", CHROME_MAC, "phase10", d1)).not.toBe(id);
  });
});
