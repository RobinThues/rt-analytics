// Queries that more than one overview panel uses run once per request (React cache keys on the ctx object).
import { cache } from "react";
import { dataQuery } from "@/bq/query";
import type { QueryContext } from "@/queries/context";
import { kpisQuery, trafficQuery, type KpiRow, type TrafficRow } from "@/queries/overview";

export const loadKpis = cache((ctx: QueryContext, live: boolean) => dataQuery<KpiRow>(kpisQuery(ctx), ctx.appId, live));

export const loadTraffic = cache((ctx: QueryContext, live: boolean) =>
  dataQuery<TrafficRow>(trafficQuery(ctx), ctx.appId, live),
);
