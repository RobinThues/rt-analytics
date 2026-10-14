// Demo profile modeled on wetter-in-kalender.de (dwd): place search, subscribe buttons and calendar polls.
// Paths match apps/demo, so live demo events join the generated history.
import { createHash } from "node:crypto";
import type { DemoProfile } from "./profile.js";

const PLACES = ["Düsseldorf", "Köln", "Berlin", "Hamburg", "München", "Leipzig", "Wien", "Zürich"];
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

export const dwdProfile: DemoProfile = {
  appId: "demo",
  origin: "http://localhost:3000",
  visitsPerDay: { start: 40, end: 120 },
  weekdayFactor: [0.8, 1.1, 1.05, 1, 1, 0.95, 0.75],
  // UTC hours: morning and evening peaks in Berlin time (UTC+1/+2).
  hourWeights: [1, 0.5, 0.3, 0.3, 1, 3, 5, 5, 4, 3, 3, 3, 3, 3, 3, 3, 4, 5, 5, 4, 3, 2, 1.5, 1],
  consent: { pending: 0.8, accepted: 0.15, declined: 0.05 },
  returnChancePerDay: 0.12,
  pages: [
    { value: "/", weight: 70 },
    { value: "/faq", weight: 12 },
    { value: "/about", weight: 10 },
    { value: "/privacy", weight: 8 },
  ],
  pageviews: { mean: 2.2, max: 8 },
  fullLoadChance: 0.3,
  vitalsOnlySessionChance: 0.03,
  errorChancePerPageview: 0.01,
  sources: [
    { value: { referrer: null }, weight: 45 },
    { value: { referrer: "https://www.google.com/" }, weight: 30 },
    { value: { referrer: "https://duckduckgo.com/" }, weight: 5 },
    { value: { referrer: "https://www.reddit.com/" }, weight: 5 },
    { value: { referrer: "https://mastodon.social/" }, weight: 7 },
    { value: { referrer: null, utm: { source: "newsletter", medium: "email", campaign: "autumn" } }, weight: 8 },
  ],
  countries: [
    { value: "DE", weight: 85 },
    { value: "AT", weight: 6 },
    { value: "CH", weight: 5 },
    { value: "NL", weight: 2 },
    { value: "US", weight: 2 },
  ],
  devices: [
    { value: { browser: "Chrome", os: "Windows", deviceType: "desktop", viewport: [1920, 1080] }, weight: 25 },
    { value: { browser: "Safari", os: "iOS", deviceType: "mobile", viewport: [390, 844] }, weight: 30 },
    { value: { browser: "Chrome", os: "Android", deviceType: "mobile", viewport: [412, 915] }, weight: 20 },
    { value: { browser: "Safari", os: "macOS", deviceType: "desktop", viewport: [1512, 982] }, weight: 12 },
    { value: { browser: "Firefox", os: "Linux", deviceType: "desktop", viewport: [1366, 768] }, weight: 5 },
    { value: { browser: "Edge", os: "Windows", deviceType: "desktop", viewport: [1536, 864] }, weight: 5 },
    { value: { browser: "Safari", os: "iOS", deviceType: "tablet", viewport: [820, 1180] }, weight: 3 },
  ],
  clientEvents: [
    {
      name: "place_selected",
      paths: ["/"],
      chance: 0.55,
      props: (rng, visit) => {
        visit.place = rng.pick(PLACES);
        const source = rng.weighted([
          { value: "search", weight: 60 },
          { value: "suggestion", weight: 25 },
          { value: "ip", weight: 15 },
        ]).value;
        return { source, place: visit.place };
      },
    },
    {
      name: "subscribe_click",
      paths: ["/"],
      chance: 0.3,
      after: "place_selected",
      props: (rng, visit) => ({
        target: rng.weighted([
          { value: "apple", weight: 35 },
          { value: "google", weight: 30 },
          { value: "outlook", weight: 15 },
          { value: "copy", weight: 20 },
        ]).value,
        place: visit.place,
        fields: rng.pick(["temp,rain", "temp,rain,wind", "temp", "temp,rain,uv"]),
      }),
    },
  ],
  serverEvents: [
    {
      name: "calendar_poll",
      pool: { start: 15, end: 140 },
      pollsPerDay: { min: 2, max: 6 },
      newSubscription: (rng, i) => ({
        key: `sub${i}`,
        kind: rng.chance(0.85) ? "token" : "legacy",
        client: rng.weighted([
          { value: "apple", weight: 40 },
          { value: "google", weight: 35 },
          { value: "outlook", weight: 15 },
          { value: "browser", weight: 5 },
          { value: "other", weight: 5 },
        ]).value,
      }),
      props: (_rng, sub, day) => ({
        subscription: hash(sub.kind === "token" ? `demo-token:${sub.key}` : `demo-legacy:${sub.key}:${day}`),
        kind: sub.kind,
        client: sub.client,
      }),
    },
  ],
};
