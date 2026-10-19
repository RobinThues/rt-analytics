// Queries that more than one overview panel uses run once per request (React cache keys on the ctx object).
// The eight breakdown panels share one merged query (one BigQuery job), and so do the four quality panels, so
// each group fills in together and a failure shows in all panels of the group.
import { cache } from "react";
import { dataQuery } from "@/bq/query";
import type { QueryContext } from "@/queries/context";
import {
  breakdownsQuery,
  qualityQuery,
  kpisQuery,
  trafficQuery,
  type BreakdownsRow,
  type KpiRow,
  type QualityRow,
  type TrafficRow,
} from "@/queries/overview";

export const loadKpis = cache((ctx: QueryContext, live: boolean) => dataQuery<KpiRow>(kpisQuery(ctx), ctx.appId, live));

export const loadTraffic = cache((ctx: QueryContext, live: boolean) =>
  dataQuery<TrafficRow>(trafficQuery(ctx), ctx.appId, live),
);

export const loadBreakdowns = cache((ctx: QueryContext, live: boolean) =>
  dataQuery<BreakdownsRow>(breakdownsQuery(ctx), ctx.appId, live),
);

export const loadQuality = cache((ctx: QueryContext, live: boolean) =>
  dataQuery<QualityRow>(qualityQuery(ctx), ctx.appId, live),
);
