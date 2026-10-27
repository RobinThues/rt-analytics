"use client";
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatInt } from "@/lib/format";
import type { ChartPoint } from "@/queries/series";
import { chartTicks, oneDay, pointLabel, tickLabel } from "@/view/chart-axis";
import type { Interval } from "@/view/interval";

const config = {
  cur: { label: "This period", color: "var(--chart-current)" },
  prev: { label: "Previous period", color: "var(--chart-previous)" },
} satisfies ChartConfig;

/**
 * Current period as a solid line, the previous period as a dashed gray line aligned by day offset, or by
 * wall-clock hour on hourly charts (spec section 6; spec 2026-10-27-hourly-charts). One axis; the tooltip
 * names both points.
 */
export function TrendChart({
  title,
  data,
  compare,
  interval,
}: {
  title: string;
  data: readonly ChartPoint[];
  compare: boolean;
  interval: Interval;
}) {
  const ticks = chartTicks(data, interval);
  const isOneDay = oneDay(data);
  return (
    <ChartContainer config={config} className="aspect-auto h-40 w-full tabular-nums" aria-label={title}>
      <ComposedChart data={[...data]} margin={{ left: 4, right: 12, top: 8 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="var(--row-line)" />
        <XAxis
          dataKey="at"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          ticks={ticks}
          tickFormatter={(at: string) => tickLabel(at, interval, isOneDay)}
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => formatInt(v)}
        />
        <ChartTooltip
          content={({ active, payload }) => {
            const p = active ? (payload?.[0]?.payload as ChartPoint | undefined) : undefined;
            if (!p) return null;
            return (
              <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
                <p className="font-medium">{title}</p>
                <p>
                  {pointLabel(p.at)}: <span className="font-medium tabular-nums">{formatInt(p.cur)}</span>
                </p>
                {compare && p.prev !== null && p.prevAt !== null && (
                  <p className="text-muted-foreground">
                    {pointLabel(p.prevAt)}: <span className="tabular-nums">{formatInt(p.prev)}</span>
                  </p>
                )}
              </div>
            );
          }}
        />
        <Area
          dataKey="cur"
          type="monotone"
          fill="var(--chart-area)"
          fillOpacity={1}
          stroke="none"
          activeDot={false}
          isAnimationActive={false}
        />
        {compare && (
          <Line
            dataKey="prev"
            type="monotone"
            stroke="var(--color-prev)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
        )}
        <Line
          dataKey="cur"
          type="monotone"
          stroke="var(--color-cur)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
