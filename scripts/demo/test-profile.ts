import type { DemoProfile } from "./profile.js";

/** Small, predictable profile for tests. Override fields per test. */
export function testProfile(over: Partial<DemoProfile> = {}): DemoProfile {
  return {
    appId: "demo",
    origin: "http://localhost:3000",
    visitsPerDay: { start: 20, end: 20 },
    weekdayFactor: [1, 1, 1, 1, 1, 1, 1],
    hourWeights: Array.from({ length: 24 }, () => 1),
    consent: { pending: 0.8, accepted: 0.15, declined: 0.05 },
    returnChancePerDay: 0.3,
    pages: [
      { value: "/", weight: 3 },
      { value: "/faq", weight: 1 },
    ],
    pageviews: { mean: 2, max: 5 },
    fullLoadChance: 0.3,
    vitalsOnlySessionChance: 0.1,
    errorChancePerPageview: 0.05,
    sources: [{ value: { referrer: null }, weight: 1 }],
    countries: [{ value: "DE", weight: 1 }],
    devices: [
      { value: { browser: "Chrome", os: "Windows", deviceType: "desktop", viewport: [1920, 1080] }, weight: 1 },
    ],
    clientEvents: [
      {
        name: "place_selected",
        paths: ["/"],
        chance: 0.5,
        props: (rng, visit) => {
          visit.place = rng.pick(["Köln", "Berlin"]);
          return { source: "search", place: visit.place };
        },
      },
    ],
    serverEvents: [
      {
        name: "calendar_poll",
        pool: { start: 2, end: 4 },
        pollsPerDay: { min: 1, max: 2 },
        newSubscription: (_rng, i) => ({ key: `s${i}`, kind: i % 2 === 0 ? "token" : "legacy", client: "apple" }),
        props: (_rng, sub, day) => ({
          subscription: sub.kind === "token" ? `tok-${sub.key}` : `leg-${sub.key}-${day}`,
          kind: sub.kind,
          client: sub.client,
        }),
      },
    ],
    ...over,
  };
}
