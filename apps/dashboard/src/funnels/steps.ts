// Funnel steps in the URL and in saved funnels (spec section 7, "Funnel builder"): `event` or
// `event:key:value`. For $pageview the only filter key is `path` (the page_path column).
import { EVENTS } from "rt-analytics/schema";
import type { Catalog } from "@/discovery/catalog";
import { isUsablePropKey } from "@/discovery/sql";
import type { Period } from "@/queries/context";

export interface FunnelStep {
  event: string;
  filter: { key: string; value: string } | null;
}

export interface SavedFunnel {
  id: string;
  name: string;
  steps: FunnelStep[];
}

/** Same rule as the ingest's event name validation (packages/rt-analytics/src/next/validate.ts NAME_RE). */
export const EVENT_NAME_RE = /^\$?[a-z0-9_]{1,64}$/i;
export const PATH_KEY = "path";
export const MIN_STEPS = 2;
export const MAX_STEPS = 5;
const MAX_VALUE = 200;

/** Shape check shared by URL parsing and saved funnels. */
export function isStep(s: unknown): s is FunnelStep {
  if (!s || typeof s !== "object") return false;
  const { event, filter } = s as { event?: unknown; filter?: unknown };
  if (typeof event !== "string" || !EVENT_NAME_RE.test(event)) return false;
  if (filter === null) return true;
  if (!filter || typeof filter !== "object") return false;
  const { key, value } = filter as { key?: unknown; value?: unknown };
  return (
    typeof key === "string" &&
    isUsablePropKey(key) &&
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_VALUE
  );
}

export function parseStep(raw: string): FunnelStep | null {
  const i = raw.indexOf(":");
  if (i === -1) return isStep({ event: raw, filter: null }) ? { event: raw, filter: null } : null;
  const rest = raw.slice(i + 1);
  const j = rest.indexOf(":");
  if (j === -1) return null;
  const step = { event: raw.slice(0, i), filter: { key: rest.slice(0, j), value: rest.slice(j + 1) } };
  return isStep(step) ? step : null;
}

export const encodeStep = (s: FunnelStep) => (s.filter ? `${s.event}:${s.filter.key}:${s.filter.value}` : s.event);

export interface AllowedSteps {
  events: Set<string>;
  keys: Record<string, Set<string>>;
}

/**
 * Events with sessions from discovery, $pageview with `path`, plus everything saved funnels of this app
 * use (spec section 5: a key used in a saved funnel stays valid when discovery no longer sees it).
 */
export function allowedFor(catalog: Catalog, saved: readonly SavedFunnel[]): AllowedSteps {
  const events = new Set<string>([EVENTS.pageview]);
  // Keyed by event names from the public ingest ("__proto__" is a valid name): no prototype.
  const keys: Record<string, Set<string>> = Object.create(null);
  keys[EVENTS.pageview] = new Set([PATH_KEY]);
  for (const e of catalog.events) {
    if (!e.withSession) continue;
    events.add(e.name);
    keys[e.name] = new Set(catalog.keys[e.name] ?? []);
  }
  for (const f of saved) {
    for (const s of f.steps) {
      events.add(s.event);
      if (s.filter && s.event !== EVENTS.pageview) (keys[s.event] ??= new Set()).add(s.filter.key);
    }
  }
  return { events, keys };
}

const isAllowed = (s: FunnelStep | null, allowed: AllowedSteps): s is FunnelStep =>
  s !== null && allowed.events.has(s.event) && (s.filter === null || allowed.keys[s.event]?.has(s.filter.key) === true);

export function validateSteps(steps: ReadonlyArray<FunnelStep | null>, allowed: AllowedSteps): FunnelStep[] | null {
  if (steps.length < MIN_STEPS || steps.length > MAX_STEPS) return null;
  return steps.every((s) => isAllowed(s, allowed)) ? (steps as FunnelStep[]) : null;
}

/** The valid steps of a URL that failed validation, so the editor keeps them instead of starting empty. */
export function usableSteps(steps: ReadonlyArray<FunnelStep | null>, allowed: AllowedSteps): FunnelStep[] {
  return steps.filter((s) => isAllowed(s, allowed)).slice(0, MAX_STEPS);
}

export interface FunnelRow {
  period: Period;
  step: number;
  sessions: number;
}

export interface FunnelStepView {
  step: number;
  cur: number;
  prev: number | null;
  /** Shares 0..1; null when the base is 0. */
  fromFirst: number | null;
  fromPrev: number | null;
  prevFromFirst: number | null;
}

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);

export function toFunnelView(rows: readonly FunnelRow[], stepCount: number, compare: boolean): FunnelStepView[] {
  const get = (period: Period, step: number) => rows.find((r) => r.period === period && r.step === step)?.sessions ?? 0;
  return Array.from({ length: stepCount }, (_, i) => {
    const step = i + 1;
    const cur = get("cur", step);
    const prev = compare ? get("prev", step) : null;
    return {
      step,
      cur,
      prev,
      fromFirst: ratio(cur, get("cur", 1)),
      fromPrev: step === 1 ? null : ratio(cur, get("cur", step - 1)),
      prevFromFirst: prev === null ? null : ratio(prev, get("prev", 1)),
    };
  });
}
