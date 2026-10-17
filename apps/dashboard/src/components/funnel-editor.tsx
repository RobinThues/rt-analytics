"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { encodeStep, MAX_STEPS, MIN_STEPS, type FunnelStep } from "@/funnels/steps";
import { usePendingNavigation } from "@/lib/navigation";

type Row = { event: string; key: string; value: string };

const selectClass =
  "h-7.5 min-w-0 rounded-md border border-input bg-transparent px-2 text-base md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const toRow = (s: FunnelStep): Row => ({ event: s.event, key: s.filter?.key ?? "", value: s.filter?.value ?? "" });
const blank: Row = { event: "", key: "", value: "" };

/** Funnel step editor (2 to 5 steps). "Show funnel" puts the steps into the URL; the page does the rest. */
export function FunnelEditor({
  events,
  keys,
  initial,
  baseQuery,
}: {
  events: readonly string[];
  /** Filter keys per event; event names come from the ingest, so lookups use Object.hasOwn. */
  keys: Readonly<Record<string, readonly string[]>>;
  initial: readonly FunnelStep[];
  /** from, to, compare */
  baseQuery: ReadonlyArray<readonly [string, string]>;
}) {
  const { pending, navigate } = usePendingNavigation();
  const [rows, setRows] = useState<Row[]>(() => {
    const start = initial.map(toRow);
    while (start.length < MIN_STEPS) start.push(blank);
    return start;
  });
  const keysOf = (event: string) => (Object.hasOwn(keys, event) ? (keys[event] ?? []) : []);
  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function show() {
    const p = new URLSearchParams(baseQuery.map(([k, v]) => [k, v]));
    for (const r of rows) {
      if (!r.event) continue;
      const filter = r.key && r.value ? { key: r.key, value: r.value } : null;
      p.append("steps", encodeStep({ event: r.event, filter }));
    }
    navigate(`?${p.toString()}`);
  }

  return (
    <form
      data-pending={pending ? "" : undefined}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        show();
      }}
    >
      <ol className="flex flex-col gap-2">
        {rows.map((r, i) => {
          const n = i + 1;
          const stepKeys = keysOf(r.event);
          return (
            <li
              key={i}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <span className="w-12 text-sm text-muted-foreground">Step {n}</span>
              <select
                aria-label={`Step ${n} event`}
                value={r.event}
                onChange={(e) => update(i, { event: e.target.value, key: "", value: "" })}
                className={selectClass}
              >
                <option value="">Choose an event</option>
                {events.map((ev) => (
                  <option key={ev} value={ev}>
                    {ev}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Step ${n} filter`}
                value={r.key}
                onChange={(e) => update(i, { key: e.target.value })}
                className={`${selectClass} col-start-2 sm:col-start-auto`}
              >
                <option value="">No filter</option>
                {stepKeys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <Input
                aria-label={`Step ${n} value`}
                value={r.value}
                disabled={!r.key}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder="value"
                className="col-start-2 sm:col-start-auto"
              />
              <Button
                type="button"
                variant="outline"
                aria-label={`Remove step ${n}`}
                disabled={rows.length <= MIN_STEPS}
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                className="col-start-2 justify-self-start sm:col-start-auto"
              >
                Remove
              </Button>
            </li>
          );
        })}
      </ol>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={rows.length >= MAX_STEPS}
          onClick={() => setRows((rs) => [...rs, blank])}
        >
          Add step
        </Button>
        <Button type="submit">Show funnel</Button>
      </div>
    </form>
  );
}
