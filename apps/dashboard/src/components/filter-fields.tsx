"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * "Filter by" and "Value" of the explorer form. The value suggestions follow the key chosen in the form,
 * so they show before Apply. Without JavaScript the form still works; suggestions then match the applied key.
 */
export function FilterFields({
  keys,
  initial,
  values,
  selectClass,
}: {
  keys: readonly string[];
  initial: { key: string; value: string } | null;
  /** Top values per key. Pairs, not a record: prop keys come from the ingest ("__proto__" is possible). */
  values: ReadonlyArray<readonly [string, readonly string[]]>;
  selectClass: string;
}) {
  const [key, setKey] = useState(initial?.key ?? "");
  const suggestions = values.find(([k]) => k === key)?.[1] ?? [];
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="fk">Filter by</Label>
        <select id="fk" name="fk" value={key} onChange={(e) => setKey(e.target.value)} className={selectClass}>
          <option value="">No filter</option>
          {keys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="fv">Value</Label>
        <Input id="fv" name="fv" list="filter-values" defaultValue={initial?.value ?? ""} className="w-40" />
        <datalist id="filter-values">
          {suggestions.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </div>
    </>
  );
}
