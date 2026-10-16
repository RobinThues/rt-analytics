type Params = Record<string, string | string[] | undefined>;

/** One-off messages that a reload must not show again. */
const DROPPED = new Set(["error", "saved"]);

/**
 * The request's query string for Live and Refresh, which go back to the same view: every parameter
 * except one-off messages. The actions check it again with safeQuery.
 */
export function rawViewQuery(sp: Params): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (DROPPED.has(k) || v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) p.append(k, one);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
