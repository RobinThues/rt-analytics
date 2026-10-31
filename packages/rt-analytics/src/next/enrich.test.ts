import { describe, expect, it } from "vitest";
import { dailyVisitorId, detectInApp, isBot, parseUserAgent } from "./enrich.js";

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

const IN_APP_AGENTS: ReadonlyArray<[string, string]> = [
  [
    "instagram",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.21.97 (iPhone15,2; iOS 18_0; de_DE; de; scale=3.00; 1179x2556; 648054026)",
  ],
  [
    "instagram",
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 Instagram 349.0.0.40.100 Android (34/14; 480dpi; 1080x2115; samsung; SM-S918B; dm3q; qcom; de_DE; 640000000)",
  ],
  [
    "tiktok",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_36.5.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/de Region/DE",
  ],
  [
    "tiktok",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 trill_360505 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/trill app_version/36.5.5 ByteLocale/de ByteFullLocale/de Region/DE BytedanceWebview/d8a21c6",
  ],
  [
    "facebook",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.40.100;FBBV/640000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.0;FBSS/3;FBCR/;FBID/phone;FBLC/de_DE;FBOP/80]",
  ],
  [
    "facebook",
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.40.100;]",
  ],
  [
    "threads",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 350.0.0.21.97 (iPhone15,2; iOS 18_0; de_DE; de; scale=3.00; 1179x2556; 648054026)",
  ],
  [
    "linkedin",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.1000",
  ],
  [
    "snapchat",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Snapchat/13.10.0.45 (like Safari/8619.1.26, panda)",
  ],
  [
    "pinterest",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [Pinterest/iOS]",
  ],
];

describe("detectInApp", () => {
  it.each(IN_APP_AGENTS)("names %s", (app, ua) => {
    expect(detectInApp(ua)).toBe(app);
  });

  // isbot runs first in the ingest, so an in-app agent it flagged would lose the whole visit.
  it.each(IN_APP_AGENTS)("keeps a %s visit (not a bot)", (_app, ua) => {
    expect(isBot(ua)).toBe(false);
  });

  it("returns null for normal browsers", () => {
    for (const ua of [CHROME_MAC, SAFARI_IPHONE, FIREFOX_WIN]) expect(detectInApp(ua)).toBeNull();
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

  it("flags an empty UA", () => {
    expect(isBot("")).toBe(true);
  });

  it("flags crawlers and test tools that run JavaScript without 'bot' in the UA", () => {
    const chromeMobile =
      "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
    expect(isBot(`${chromeMobile} (compatible; Google-InspectionTool/1.0;)`)).toBe(true);
    expect(
      isBot(`${chromeMobile} (compatible; Google-Read-Aloud; +https://support.google.com/webmasters/answer/1061943)`),
    ).toBe(true);
    expect(isBot(`${CHROME_MAC} PTST/250101.123456`)).toBe(true);
    expect(isBot(`${CHROME_MAC} Cypress/14.0.0 Electron/33.0.0`)).toBe(true);
  });

  it("flags link previews and HTTP clients", () => {
    expect(isBot("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")).toBe(true);
    expect(isBot("WhatsApp/2.23.20.0")).toBe(true);
    expect(isBot("Go-http-client/1.1")).toBe(true);
    expect(isBot("python-httpx/0.27.0")).toBe(true);
    expect(isBot("node")).toBe(true);
  });

  it("does not flag real browsers whose UA contains 'bot'", () => {
    const cubot =
      "Mozilla/5.0 (Linux; Android 13; CUBOT KINGKONG 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
    expect(isBot(cubot)).toBe(false);
  });

  it("does not flag in-app browsers", () => {
    const facebookApp =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 [FBAN/FBIOS;FBAV/520.0.0.38.101;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.5;FBLC/de_DE]";
    const googleApp =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/380.0.0 Mobile/15E148 Safari/604.1";
    expect(isBot(facebookApp)).toBe(false);
    expect(isBot(googleApp)).toBe(false);
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
