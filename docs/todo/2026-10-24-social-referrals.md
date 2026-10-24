# To do: tell social and in-app visits apart

Status: open, for a separate session. Noted 2026-10-24 while planning Shorts for wetter-in-kalender.de
(YouTube Shorts, TikTok, Instagram Reels). Wanted before the first public Short on 2026-11-09, so the
numbers are clean from the start.

## Problem

Visits from TikTok and Instagram mostly show as "direct", YouTube often too.

- The client sends the raw `document.referrer` (`packages/rt-analytics/src/core/analytics.ts:98`), stored in
  the `referrer` column (`next/handler.ts:160`). The dashboard reduces it with
  `LOWER(NET.HOST(first_pv.referrer))`; empty or own host becomes "direct"
  (`apps/dashboard/src/queries/overview.ts:158,168`).
- utm values are stored in their own columns (`analytics.ts:99-101`, `handler.ts:161-163`) but only feed the
  separate utm panel (`overview.ts:170`), not "source". Example: 8 sessions with `utm_source=chatgpt.com`
  show as "direct".
- `parseUserAgent` (`next/enrich.ts:16-40`) has no in-app detection: Instagram and TikTok on Android become
  "Chrome", on iOS "Other". The raw user agent is not stored, so old rows can't be classified again.
- What the platforms send: TikTok in-app browser mostly no referrer (UA contains `BytedanceWebview`,
  `musical_ly` or `TikTok`); Instagram `https://l.instagram.com/` or nothing (UA contains `Instagram`);
  YouTube desktop `https://www.youtube.com/` or nothing; YouTube Android app often
  `android-app://com.google.android.youtube/`; YouTube iOS opens Safari View Controller, plain Safari UA.

## Fixes (smallest first)

1. Source falls back to `utm_source` when the referrer is empty. (The site will put utm tags on every bio
   and description link, e.g. `?utm_source=tiktok&utm_medium=social`.)
2. In-app detection in `parseUserAgent`: `/Instagram/` → instagram, `/musical_ly|BytedanceWebview|TikTok/`
   → tiktok, `/FBAN|FBAV|FB_IAB/` → facebook. Store as an `in_app` column or prop, and use it as source when
   the referrer is empty.
3. Host-to-platform map in the source expression: `l.instagram.com`, `instagram.com` → instagram;
   `youtube.com`, `m.youtube.com`, `youtu.be`, `com.google.android.youtube` → youtube; `l.facebook.com` →
   facebook; `tiktok.com` → tiktok.
4. Optional: store a trimmed user agent so new rules can be applied to old rows (check the privacy text of
   each app first; wetter-in-kalender lists exactly what it stores).

People who type the domain after a video stay "direct". That's accepted.

## Sources

- Wikimedia TikTok ticket: https://phabricator.wikimedia.org/T340677
- Matomo forum, TikTok browser: https://forum.matomo.org/t/tiktok-browser/53178
- TikTok in-app browser: https://link.boo/guides/tiktok-in-app-browser
- Instagram in-app browser: https://link.boo/guides/instagram-in-app-browser
