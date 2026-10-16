// Explorer view state in the URL (spec section 3): event, metric, filter (key:value), by. Anything
// discovery does not know is dropped, so only discovered names and keys reach SQL.
import type { Catalog } from "@/discovery/catalog";
import type { ExplorerSelection, Metric } from "@/queries/explorer";

type Params = Record<string, string | string[] | undefined>;

const MAX_VALUE = 200;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

function splitAtColon(raw: string | undefined): [string, string] | null {
  if (raw === undefined) return null;
  const i = raw.indexOf(":");
  return i === -1 ? null : [raw.slice(0, i), raw.slice(i + 1)];
}

export function encodeMetric(m: Metric): string {
  return m.kind === "distinct" ? `distinct:${m.key}` : m.kind;
}

export function parseExplorer(sp: Params, catalog: Catalog): ExplorerSelection | null {
  const event = catalog.events.find((e) => e.name === one(sp.event));
  if (!event) return null;
  const keys = catalog.keys[event.name] ?? [];
  const known = (k: string | undefined): k is string => k !== undefined && keys.includes(k);

  const rawMetric = one(sp.metric);
  const distinct = splitAtColon(rawMetric);
  let metric: Metric = { kind: "events" };
  if (rawMetric === "sessions" && event.withSession) metric = { kind: "sessions" };
  else if (rawMetric === "visitors" && event.withVisitor) metric = { kind: "visitors" };
  else if (distinct?.[0] === "distinct" && known(distinct[1])) metric = { kind: "distinct", key: distinct[1] };

  const fromForm = one(sp.fk) !== undefined ? ([one(sp.fk) ?? "", one(sp.fv) ?? ""] as [string, string]) : null;
  const f = fromForm ?? splitAtColon(one(sp.filter));
  const filter = f && known(f[0]) && f[1].length > 0 && f[1].length <= MAX_VALUE ? { key: f[0], value: f[1] } : null;

  const by = one(sp.by);
  return { event: event.name, metric, filter, by: known(by) ? by : null };
}

/** URL params for a selection; defaults (events metric, no filter, no breakdown) are left out. */
export function explorerParams(sel: ExplorerSelection | null): Array<[string, string]> {
  if (!sel) return [];
  const out: Array<[string, string]> = [["event", sel.event]];
  if (sel.metric.kind !== "events") out.push(["metric", encodeMetric(sel.metric)]);
  if (sel.filter) out.push(["filter", `${sel.filter.key}:${sel.filter.value}`]);
  if (sel.by) out.push(["by", sel.by]);
  return out;
}

/** The controls form sends fk/fv; the page redirects to the canonical filter=key:value URL. */
export const needsCanonicalRedirect = (sp: Params) => sp.fk !== undefined || sp.fv !== undefined;

/**
 * The canonical explorer URL for the controls form (layout spec, "Changes on the same page"): the range
 * parameters that exist in `base`, then the parsed selection. Built in the browser, so the form never
 * goes through the server's fk/fv redirect.
 */
export function explorerFormQuery(
  base: string,
  catalog: Catalog,
  form: { event: string; metric: string; fk: string; fv: string; by: string },
): string {
  const current = new URLSearchParams(base.startsWith("?") ? base.slice(1) : base);
  const out = new URLSearchParams();
  for (const k of ["from", "to", "compare"]) {
    const v = current.get(k);
    if (v !== null) out.set(k, v);
  }
  for (const [k, v] of explorerParams(parseExplorer(form, catalog))) out.append(k, v);
  return `?${out.toString()}`;
}
