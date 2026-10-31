// Open problems per app, in their own small table. Reads use tabledata.list, which costs no query bytes. A write
// replaces the app's rows, and it only happens when something changed.
import type { BigQuery } from "@google-cloud/bigquery";
import { ALERTS_DATASET, BQ_LOCATION, MAX_BYTES_PER_RUN, PROJECT_ID, STATE_TABLE } from "./config";
import type { OpenProblem } from "./rules";

const TABLE = `\`${PROJECT_ID}.${ALERTS_DATASET}.${STATE_TABLE}\``;

export const STATE_SCHEMA = [
  { name: "app_id", type: "STRING", mode: "REQUIRED" },
  { name: "problem", type: "STRING", mode: "REQUIRED" },
  { name: "since", type: "STRING", mode: "REQUIRED" },
  { name: "clean_runs", type: "INT64", mode: "REQUIRED" },
] as const;

interface StateRow {
  app_id: string;
  problem: string;
  since: string;
  clean_runs: number | string;
}

export async function readOpenProblems(bq: BigQuery): Promise<Map<string, OpenProblem[]>> {
  const [rows] = await bq.dataset(ALERTS_DATASET).table(STATE_TABLE).getRows();
  const out = new Map<string, OpenProblem[]>();
  for (const r of rows as StateRow[]) {
    const list = out.get(r.app_id) ?? [];
    list.push({ key: r.problem, since: r.since, cleanRuns: Number(r.clean_runs) });
    out.set(r.app_id, list);
  }
  return out;
}

/** True when the stored rows would stay the same, so the run can skip the write. */
export function sameProblems(a: readonly OpenProblem[], b: readonly OpenProblem[]): boolean {
  const text = (list: readonly OpenProblem[]) =>
    JSON.stringify([...list].sort((x, y) => x.key.localeCompare(y.key)).map((p) => [p.key, p.since, p.cleanRuns]));
  return text(a) === text(b);
}

export function saveQuery(appId: string, open: readonly OpenProblem[]) {
  return {
    query: `BEGIN TRANSACTION;
DELETE FROM ${TABLE} WHERE app_id = @app_id;
INSERT INTO ${TABLE} (app_id, problem, since, clean_runs)
SELECT @app_id, p.problem, p.since, p.clean_runs
FROM UNNEST(JSON_QUERY_ARRAY(@open)) AS item,
  UNNEST([STRUCT(JSON_VALUE(item, '$.key') AS problem, JSON_VALUE(item, '$.since') AS since,
    CAST(JSON_VALUE(item, '$.cleanRuns') AS INT64) AS clean_runs)]) AS p;
COMMIT TRANSACTION;`,
    params: { app_id: appId, open: JSON.stringify(open) },
    location: BQ_LOCATION,
    maximumBytesBilled: String(MAX_BYTES_PER_RUN),
  };
}

export async function saveOpenProblems(bq: BigQuery, appId: string, open: readonly OpenProblem[]): Promise<void> {
  await bq.query(saveQuery(appId, open));
}
