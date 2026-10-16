// What discovery knows about an app's events: the only event names and prop keys that may reach SQL.

export interface Catalog {
  events: Array<{ name: string; withVisitor: boolean; withSession: boolean }>;
  keys: Record<string, string[]>;
}

export function buildCatalog(
  events: ReadonlyArray<{ event_name: string; with_visitor: number; with_session: number }>,
  keys: ReadonlyArray<{ event_name: string; prop_key: string }>,
): Catalog {
  const names = new Set(events.map((e) => e.event_name));
  const byEvent: Record<string, string[]> = {};
  for (const k of keys) {
    if (!names.has(k.event_name)) continue;
    (byEvent[k.event_name] ??= []).push(k.prop_key);
  }
  return {
    events: events.map((e) => ({
      name: e.event_name,
      withVisitor: e.with_visitor > 0,
      withSession: e.with_session > 0,
    })),
    keys: byEvent,
  };
}
