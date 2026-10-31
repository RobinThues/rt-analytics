// Where a session came from (spec 2026-10-31-launch-package, part 1). Fixed SQL with no input, so it is safe to
// inline. Referrer hosts and utm_source values share one name map, so both give the same answer.

const PLATFORM_NAMES: Readonly<Record<string, readonly string[]>> = {
  instagram: ["instagram.com", "www.instagram.com", "l.instagram.com", "com.instagram.android", "ig"],
  youtube: [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "com.google.android.youtube",
    "yt",
  ],
  tiktok: [
    "tiktok.com",
    "www.tiktok.com",
    "m.tiktok.com",
    "vm.tiktok.com",
    "vt.tiktok.com",
    "com.zhiliaoapp.musically",
  ],
  facebook: [
    "facebook.com",
    "www.facebook.com",
    "m.facebook.com",
    "l.facebook.com",
    "lm.facebook.com",
    "web.facebook.com",
    "com.facebook.katana",
    "fb",
  ],
  threads: ["threads.net", "www.threads.net", "l.threads.net", "threads.com", "www.threads.com", "l.threads.com"],
  linkedin: ["linkedin.com", "www.linkedin.com", "lnkd.in", "com.linkedin.android"],
  snapchat: ["snapchat.com", "www.snapchat.com"],
  pinterest: ["pinterest.com", "www.pinterest.com", "de.pinterest.com", "pin.it"],
  x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com", "t.co", "twitter"],
  reddit: ["reddit.com", "www.reddit.com", "old.reddit.com", "out.reddit.com", "com.reddit.frontpage"],
  telegram: ["t.me", "web.telegram.org", "org.telegram.messenger"],
};

const quoted = (names: readonly string[]) => names.map((n) => `'${n}'`).join(", ");

/** SQL: the platform name of a lowercase host or utm value, or the value itself. */
function platformOf(value: string): string {
  const whens = Object.entries(PLATFORM_NAMES).map(
    ([platform, names]) => `WHEN ${value} IN (${quoted(names)}) THEN '${platform}'`,
  );
  return `CASE ${whens.join(" ")} ELSE ${value} END`;
}

/**
 * SQL for a session's source, on the struct `pv` of its first pageview. Needs `referrer`, `utm_source` and `in_app`
 * in that struct, and the `@own_hosts` parameter. An external referrer wins, then utm_source, then the in-app
 * browser, else direct. A referrer from an own host says nothing about the source, so it counts as no referrer.
 */
export function sourceExpr(pv: string): string {
  const host = `LOWER(NET.HOST(${pv}.referrer))`;
  const utm = `LOWER(TRIM(${pv}.utm_source))`;
  return `CASE
      WHEN IFNULL(${host}, '') != '' AND ${host} NOT IN UNNEST(@own_hosts) THEN ${platformOf(host)}
      WHEN IFNULL(${utm}, '') != '' THEN ${platformOf(utm)}
      WHEN ${pv}.in_app IS NOT NULL THEN ${pv}.in_app
      ELSE 'direct'
    END`;
}
