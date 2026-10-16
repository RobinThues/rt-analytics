// What every data part of the funnels page needs, loaded once per request (same rule as loadPage).
import { EVENTS } from "rt-analytics/schema";
import { getFunnels } from "@/config/data";
import { buildCatalog } from "@/discovery/catalog";
import { listEvents, listPropKeys } from "@/discovery/data";
import {
  allowedFor,
  encodeStep,
  parseStep,
  usableSteps,
  validateSteps,
  type AllowedSteps,
  type FunnelStep,
  type SavedFunnel,
} from "@/funnels/steps";
import { viewQuery } from "@/lib/query-string";
import { loadPage, type PageData, type PageInput } from "../page-data";

export interface FunnelPageData {
  page: PageData;
  events: Awaited<ReturnType<typeof listEvents>>;
  saved: Awaited<ReturnType<typeof getFunnels>>;
  allowed: AllowedSteps;
  funnelId: string | null;
  open: SavedFunnel | undefined;
  /** Valid steps to run, or null. */
  steps: FunnelStep[] | null;
  /** What the editor starts with: the valid steps, also of a stale URL. */
  editorSteps: FunnelStep[];
  leftOut: boolean;
  pageParams: Array<[string, string]>;
  /** Current view query (range plus pageParams) and the range alone. */
  qs: string;
  rangeQs: string;
  editorEvents: string[];
  editorKeys: Record<string, string[]>;
}

const many = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const loaded = new WeakMap<PageInput, Promise<FunnelPageData>>();

export function loadFunnelPage(input: PageInput): Promise<FunnelPageData> {
  let p = loaded.get(input);
  if (!p) {
    p = load(input);
    loaded.set(input, p);
  }
  return p;
}

async function load(input: PageInput): Promise<FunnelPageData> {
  const page = await loadPage(input);
  const { appId, sp, state } = page;
  const [events, keys, saved] = await Promise.all([listEvents(appId), listPropKeys(appId), getFunnels(appId)]);
  const catalog = buildCatalog(events.ok ? events.rows : [], keys.ok ? keys.rows : []);
  const allowed = allowedFor(catalog, saved.funnels);
  const funnelId = typeof sp.funnel === "string" ? sp.funnel : null;
  const open = funnelId ? saved.funnels.find((f) => f.id === funnelId) : undefined;
  const requested = open ? open.steps : many(sp.steps).map(parseStep);
  const steps = validateSteps(requested, allowed);
  const editorSteps = steps ?? usableSteps(requested, allowed);
  const pageParams: Array<[string, string]> = open
    ? [["funnel", open.id]]
    : (steps ?? []).map((s): [string, string] => ["steps", encodeStep(s)]);
  const editorEvents = [...allowed.events].sort((a, b) =>
    a === EVENTS.pageview ? -1 : b === EVENTS.pageview ? 1 : a.localeCompare(b),
  );
  return {
    page,
    events,
    saved,
    allowed,
    funnelId,
    open,
    steps,
    editorSteps,
    leftOut: editorSteps.length < requested.length,
    pageParams,
    qs: viewQuery(state, pageParams),
    rangeQs: viewQuery(state),
    editorEvents,
    editorKeys: Object.fromEntries(editorEvents.map((e) => [e, [...(allowed.keys[e] ?? [])]])),
  };
}
