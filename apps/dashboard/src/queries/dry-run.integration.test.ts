// @vitest-environment node
// Opt-in: RTD_DRY_RUN=1 GCP_PROJECT_ID=robin-thues npx vitest run src/queries/dry-run.integration.test.ts
// Runs every query builder as a free BigQuery dry run against the demo app (90 days ending yesterday,
// compare on) with your gcloud application default credentials, and fails when the bytes estimate is
// over the cap (spec section 9).
import { BigQuery } from "@google-cloud/bigquery";
import { describe, expect, it } from "vitest";
import type { QuerySpec } from "@/bq/run-query";
import { readEnv } from "@/env";
import { addDays, todayIn } from "@/time/range";
import { listFunnelsQuery } from "@/config/funnels";
import { buildContext, eventsCte, SESSION_COLUMNS, sessionsCte, toSpec } from "./context";
import { funnelQuery } from "./funnel";
import {
  breakdownQuery,
  consentQuery,
  DIMS,
  kpisQuery,
  retentionQuery,
  slowPagesQuery,
  topErrorsQuery,
  trafficQuery,
  webVitalsQuery,
} from "./overview";
import {
  eventBreakdownQuery,
  eventListQuery,
  eventSeriesQuery,
  propValuesQuery,
  type ExplorerSelection,
} from "./explorer";

const enabled = process.env.RTD_DRY_RUN === "1";
const env = readEnv({ ...process.env, GCP_PROJECT_ID: process.env.GCP_PROJECT_ID ?? "robin-thues" });
const today = todayIn("Europe/Berlin", new Date());
const ctx = buildContext({
  table: env.analyticsTable,
  appId: "demo",
  settings: { timezone: "Europe/Berlin", hosts: ["demo.localhost"] },
  range: { from: addDays(today, -90), to: addDays(today, -1) },
  compare: true,
  today,
});

const poll: ExplorerSelection = {
  event: "calendar_poll",
  metric: { kind: "distinct", key: "subscription" },
  filter: { key: "kind", value: "token" },
  by: null,
};
const place: ExplorerSelection = {
  event: "place_selected",
  metric: { kind: "events" },
  filter: { key: "source", value: "search" },
  by: null,
};

const CASES: Array<[string, QuerySpec]> = [
  [
    "periodOf + sessionsCte",
    toSpec(
      `WITH ${eventsCte(ctx.table, SESSION_COLUMNS)}, ${sessionsCte()}
SELECT period, COUNT(*) AS n FROM sessions GROUP BY period`,
      ctx.params,
    ),
  ],
  ["overview kpis", kpisQuery(ctx)],
  ["overview traffic", trafficQuery(ctx)],
  ...DIMS.map((d): [string, QuerySpec] => [`overview breakdown ${d}`, breakdownQuery(ctx, d)]),
  ["overview web vitals", webVitalsQuery(ctx)],
  ["overview slow pages", slowPagesQuery(ctx)],
  ["overview top errors", topErrorsQuery(ctx)],
  ["overview consent", consentQuery(ctx)],
  ["overview retention", retentionQuery(ctx)],
  ["explorer list", eventListQuery(ctx)],
  ...(["events", "sessions", "visitors"] as const).map((kind): [string, QuerySpec] => [
    `explorer series ${kind}`,
    eventSeriesQuery(ctx, { ...poll, metric: { kind }, filter: null }),
  ]),
  ["explorer series distinct + filter", eventSeriesQuery(ctx, poll)],
  ["explorer series sessions + filter", eventSeriesQuery(ctx, { ...place, metric: { kind: "sessions" } })],
  ["explorer breakdown distinct + filter", eventBreakdownQuery(ctx, { ...poll, by: "client" })],
  [
    "explorer breakdown visitors",
    eventBreakdownQuery(ctx, { ...place, metric: { kind: "visitors" }, filter: null, by: "source" }),
  ],
  ["explorer prop values", propValuesQuery(ctx, "calendar_poll", "kind")],
  [
    "funnel 2 steps",
    funnelQuery(ctx, [
      { event: "place_selected", filter: null },
      { event: "subscribe_click", filter: null },
    ]),
  ],
  [
    "funnel 5 steps with filters",
    funnelQuery(ctx, [
      { event: "$pageview", filter: { key: "path", value: "/" } },
      { event: "place_selected", filter: { key: "source", value: "search" } },
      { event: "subscribe_click", filter: null },
      { event: "$pageview", filter: null },
      { event: "subscribe_click", filter: { key: "target", value: "google" } },
    ]),
  ],
  ["saved funnels list", listFunnelsQuery(env, "demo")],
];

describe.skipIf(!enabled)("dry runs against demo (90 days, compare on)", () => {
  const bq = new BigQuery({ projectId: env.gcp.projectId, location: "EU" });
  it.each(CASES)("%s", async (_name, spec) => {
    const [job] = await bq.createQueryJob({
      query: spec.sql,
      params: spec.params,
      ...(spec.types ? { types: spec.types } : {}),
      location: "EU",
      dryRun: true,
    });
    const bytes = Number(job.metadata.statistics.totalBytesProcessed);
    console.log(`${_name}: ${bytes} bytes`);
    expect(bytes).toBeLessThanOrEqual(env.maxBytesPerQuery);
  });
});
