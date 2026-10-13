import { createHash, timingSafeEqual } from "node:crypto";

export const IGNORE_COOKIE = "rta_ignore";
/** 400 days, the maximum Chrome accepts. Refreshed on every ignored POST. */
const MAX_AGE_S = 34_560_000;

export type IgnoreState = "excluded" | "already" | "included";

export function hasIgnoreCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(";").some((part) => part.trim() === `${IGNORE_COOKIE}=1`);
}

export function ignoreCookie(path: string, clear = false): string {
  return `${IGNORE_COOKIE}=1; Path=${path}; Max-Age=${clear ? 0 : MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax`;
}

// Hashing first gives equal-length buffers (timingSafeEqual throws otherwise) and hides the key length.
export function keyMatches(given: string, key: string): boolean {
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(key, "utf8").digest();
  return timingSafeEqual(a, b);
}

const MESSAGES: Record<IgnoreState, string> = {
  excluded: "This browser is now excluded from analytics for this site.",
  already: "This browser was already excluded from analytics for this site.",
  included: "This browser is counted in analytics again.",
};

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

export function ignorePage(state: IgnoreState, key: string): string {
  const params = new URLSearchParams({ ignore: key });
  if (state !== "included") params.set("undo", "1");
  const label = state === "included" ? "Exclude this browser again" : "Undo";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>rt-analytics</title>
</head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 1rem">
<p>${MESSAGES[state]}</p>
<p><a href="${escapeHtml(`?${params.toString()}`)}">${label}</a></p>
</body>
</html>
`;
}
