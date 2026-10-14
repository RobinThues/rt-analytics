import type { QueryResult } from "@/bq/run-query";
import { formatBytes } from "@/lib/format";
import { RetryButton } from "./retry-button";

/** Panel-level message for a failed query (spec section 5, "Errors" and "Byte cap"). */
export function QueryError({ result, maxBytes }: { result: QueryResult<unknown>; maxBytes: number }) {
  if (result.ok) return null;
  if (result.error === "bytes-cap") {
    return (
      <p className="text-sm text-muted-foreground">
        This query would scan more than {formatBytes(maxBytes)}. Choose a shorter date range.
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      Could not load this panel. <RetryButton />
    </p>
  );
}
