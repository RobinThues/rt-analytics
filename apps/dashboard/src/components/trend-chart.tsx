"use client";
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatInt, formatShortDay } from "@/lib/format";
import { addDays } from "@/time/range";

const config = {
  cur: { label: "This period", color: "var(--chart-current)" },
  prev: { label: "Previous period", color: "var(--chart-previous)" },
} satisfies ChartConfig;

type Point = { day: string; cur: number; prev: number | null };

/**
 * Current period as a solid line, the previous period as a dashed gray line aligned by day offset
 * (spec section 6). One axis; the tooltip names both days.
 */
export function TrendChart({
  title,
  data,
  compare,
  prevFrom,
}: {
  title: string;
  data: readonly Point[];
  compare: boolean;
  /** First day of the previous period, for the tooltip. */
  prevFrom: string;
}) {
  return (
    <ChartContainer config={config} className="aspect-auto h-40 w-full tabular-nums" aria-label={title}>
      <ComposedChart data={[...data]} margin={{ left: 4, right: 12, top: 8 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="var(--row-line)" />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          tickFormatter={formatShortDay}
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
            const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
            if (!p) return null;
            const i = data.findIndex((d) => d.day === p.day);
            return (
              <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
                <p className="font-medium">{title}</p>
                <p>
                  {formatShortDay(p.day)}: <span className="font-medium tabular-nums">{formatInt(p.cur)}</span>
                </p>
                {compare && p.prev !== null && (
                  <p className="text-muted-foreground">
                    {formatShortDay(addDays(prevFrom, i))}: <span className="tabular-nums">{formatInt(p.prev)}</span>
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
