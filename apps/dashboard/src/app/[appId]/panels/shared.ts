// Queries that more than one overview panel uses run once per request (React cache keys on the ctx object).
// The eight breakdown panels share one merged query (one BigQuery job), so they fill in together and a
// failure shows in all of them.
import { cache } from "react";
import { dataQuery } from "@/bq/query";
import type { QueryContext } from "@/queries/context";
import {
  breakdownsQuery,
  kpisQuery,
  trafficQuery,
  type BreakdownsRow,
  type KpiRow,
  type TrafficRow,
} from "@/queries/overview";

export const loadKpis = cache((ctx: QueryContext, live: boolean) => dataQuery<KpiRow>(kpisQuery(ctx), ctx.appId, live));

export const loadTraffic = cache((ctx: QueryContext, live: boolean) =>
  dataQuery<TrafficRow>(trafficQuery(ctx), ctx.appId, live),
);

export const loadBreakdowns = cache((ctx: QueryContext, live: boolean) =>
  dataQuery<BreakdownsRow>(breakdownsQuery(ctx), ctx.appId, live),
);
