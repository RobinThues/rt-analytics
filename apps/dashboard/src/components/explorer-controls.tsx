import { FilterFields } from "@/components/filter-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Catalog } from "@/discovery/catalog";
import { encodeMetric } from "@/explorer/state";
import type { ExplorerSelection } from "@/queries/explorer";

const selectClass = "h-8 rounded-lg border bg-transparent px-2 text-sm";

/**
 * Plain GET form (works without JavaScript). The filter goes out as fk/fv; the page redirects to the
 * canonical filter=key:value URL.
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
  return (
    <form method="get" action={`/${appId}/events`} className="flex flex-wrap items-end gap-3">
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
