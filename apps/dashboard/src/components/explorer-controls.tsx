"use client";
import type { FormEvent } from "react";
import { FilterFields } from "@/components/filter-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Catalog } from "@/discovery/catalog";
import { encodeMetric, explorerFormQuery } from "@/explorer/state";
import { usePendingNavigation } from "@/lib/navigation";
import type { ExplorerSelection } from "@/queries/explorer";

const selectClass =
  "h-7.5 rounded-md border border-input bg-transparent px-2 text-base md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The explorer controls. Apply builds the canonical URL in the browser and navigates in place, so the
 * old results stay on screen, dimmed, until the new ones arrive. `catalog` must be a plain object (it
 * crosses to the client); the page passes only the selected event.
 */
export function ExplorerControls({
  appId,
  qsBase,
  catalog,
  sel,
  values,
}: {
  appId: string;
  /** from, to, compare: kept as hidden inputs. */
  qsBase: ReadonlyArray<readonly [string, string]>;
  catalog: Catalog;
  sel: ExplorerSelection;
  /** Top values per prop key of the event, offered in the value field. */
  values: ReadonlyArray<readonly [string, readonly string[]]>;
}) {
  const event = catalog.events.find((e) => e.name === sel.event);
  const keys = catalog.keys[sel.event] ?? [];
  const { pending, navigate } = usePendingNavigation();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const field = (name: string) => {
      const el = e.currentTarget.elements.namedItem(name);
      return el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el.value : "";
    };
    const form = { event: field("event"), metric: field("metric"), fk: field("fk"), fv: field("fv"), by: field("by") };
    navigate(`/${appId}/events${explorerFormQuery(window.location.search, catalog, form)}`);
  }
  return (
    <form
      method="get"
      action={`/${appId}/events`}
      onSubmit={onSubmit}
      data-pending={pending ? "" : undefined}
      className="flex flex-wrap items-end gap-3"
    >
      {qsBase.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="event" value={sel.event} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="metric">Metric</Label>
        <select id="metric" name="metric" defaultValue={encodeMetric(sel.metric)} className={selectClass}>
          <option value="events">Events</option>
          {event?.withSession && <option value="sessions">Sessions</option>}
          {event?.withVisitor && <option value="visitors">Visitors</option>}
          {keys.map((k) => (
            <option key={k} value={`distinct:${k}`}>
              Distinct values of {k}
            </option>
          ))}
        </select>
      </div>
      <FilterFields keys={keys} initial={sel.filter} values={values} selectClass={selectClass} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="by">Break down by</Label>
        <select id="by" name="by" defaultValue={sel.by ?? ""} className={selectClass}>
          <option value="">No breakdown</option>
          {keys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="outline">
        Apply
      </Button>
    </form>
  );
}
