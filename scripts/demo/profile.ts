import type { Rng } from "./rng.js";

export interface Weighted<T> {
  value: T;
  weight: number;
}

export interface Device {
  browser: string;
  os: string;
  deviceType: "desktop" | "mobile" | "tablet";
  viewport: readonly [number, number];
}

export interface Source {
  referrer: string | null;
  utm?: { source: string; medium: string; campaign: string };
}

/** State shared by the events of one visit (e.g. the place a dwd visitor picked). */
export interface VisitState {
  place: string | null;
}

export interface ClientEventDef {
  name: string;
  /** Paths where the event can happen. */
  paths: readonly string[];
  /** Chance per pageview on one of those paths. */
  chance: number;
  /** Only possible after this event happened earlier in the same visit. */
  after?: string;
  props(rng: Rng, visit: VisitState): Record<string, unknown>;
}

export interface Subscription {
  key: string;
  kind: "token" | "legacy";
  client: string;
}

export interface ServerEventDef {
  name: string;
  /** Number of active subscriptions on the first and the last day (linear growth). */
  pool: { start: number; end: number };
  pollsPerDay: { min: number; max: number };
  newSubscription(rng: Rng, index: number): Subscription;
  props(rng: Rng, sub: Subscription, utcDay: string): Record<string, unknown>;
}

export interface DemoProfile {
  appId: string;
  /** Origin of the demo site, used for self-referrals after full page loads. */
  origin: string;
  visitsPerDay: { start: number; end: number };
  /** Index = Date.getUTCDay() (Sunday first). */
  weekdayFactor: readonly number[];
  /** 24 weights for UTC hours. */
  hourWeights: readonly number[];
  consent: { pending: number; accepted: number; declined: number };
  /** Chance that a known (consented) visitor comes back on a given day. */
  returnChancePerDay: number;
  pages: readonly Weighted<string>[];
  pageviews: { mean: number; max: number };
  /** Chance that a navigation is a full page load instead of a client-side navigation. */
  fullLoadChance: number;
  /** Chance that a cookieless visit ends with a late $web_vital in a new session without pageview. */
  vitalsOnlySessionChance: number;
  errorChancePerPageview: number;
  sources: readonly Weighted<Source>[];
  countries: readonly Weighted<string>[];
  devices: readonly Weighted<Device>[];
  clientEvents: readonly ClientEventDef[];
  serverEvents: readonly ServerEventDef[];
}
