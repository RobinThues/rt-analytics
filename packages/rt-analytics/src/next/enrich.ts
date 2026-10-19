import { createHash } from "node:crypto";
import { isbot } from "isbot";
import { DAILY_VISITOR_PREFIX } from "../schema/index.js";

export interface UAInfo {
  browser: string;
  os: string;
  deviceType: string;
}

// isbot treats a missing UA as human, we count it as a bot.
export function isBot(ua: string | null): boolean {
  return !ua || isbot(ua);
}

export function parseUserAgent(ua: string): UAInfo {
  const browser = /edg\//i.test(ua)
    ? "Edge"
    : /opr\//i.test(ua)
      ? "Opera"
      : /chrome|crios/i.test(ua)
        ? "Chrome"
        : /firefox|fxios/i.test(ua)
          ? "Firefox"
          : /safari/i.test(ua)
            ? "Safari"
            : "Other";
  const os = /windows/i.test(ua)
    ? "Windows"
    : /android/i.test(ua)
      ? "Android"
      : /iphone|ipad|ipod/i.test(ua)
        ? "iOS"
        : /mac os/i.test(ua)
          ? "macOS"
          : /linux/i.test(ua)
            ? "Linux"
            : "Other";
  const deviceType = /ipad|tablet/i.test(ua) ? "tablet" : /mobile|iphone|android/i.test(ua) ? "mobile" : "desktop";
  return { browser, os, deviceType };
}

export function dailyVisitorId(salt: string, ip: string, ua: string, appId: string, date: Date): string {
  const day = date.toISOString().slice(0, 10);
  const hash = createHash("sha256").update(`${salt}:${day}:${ip}:${ua}:${appId}`).digest("hex");
  return `${DAILY_VISITOR_PREFIX}${hash.slice(0, 32)}`;
}
