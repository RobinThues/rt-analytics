import type { EventRow } from "rt-analytics/schema";

/** One NDJSON line for a BigQuery load job: ISO timestamp, props as a JSON object (JSON column). */
export function toNdjsonLine(row: EventRow): string {
  return JSON.stringify({
    ...row,
    timestamp: row.timestamp.toISOString(),
    props: row.props === null ? null : (JSON.parse(row.props) as unknown),
  });
}
