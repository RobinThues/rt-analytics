"use client";
import { Line, LineChart, Tooltip } from "recharts";
import { formatInt, formatShortDay } from "@/lib/format";

export type SparkPoint = { day: string; n: number };

const WIDTH = 80;
const HEIGHT = 24;

/**
 * A tiny trend line for list rows. Hover shows the day and its count just above the line (over the row
 * above, or the empty header cell for the first row). The numbers in the row carry the values for
 * screen readers, so the chart itself is hidden from them.
 */
export function Sparkline({ points }: { points: readonly SparkPoint[] }) {
  return (
    <div data-testid="sparkline" className="relative" style={{ width: WIDTH, height: HEIGHT }}>
      <LineChart width={WIDTH} height={HEIGHT} data={[...points]} aria-hidden>
        <Tooltip
          cursor={false}
          isAnimationActive={false}
          position={{ x: -12, y: -26 }}
          wrapperStyle={{ zIndex: 10 }}
          allowEscapeViewBox={{ x: true, y: true }}
          content={({ active, payload }) => {
            const p = active ? (payload?.[0]?.payload as SparkPoint | undefined) : undefined;
            if (!p) return null;
            return (
              <div
                role="tooltip"
                className="rounded-md border bg-background px-2 py-0.5 text-xs whitespace-nowrap shadow-sm tabular-nums"
              >
                {formatShortDay(p.day)}: {formatInt(p.n)}
              </div>
            );
          }}
        />
        <Line
          dataKey="n"
          type="monotone"
          stroke="var(--chart-current)"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 2.5, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}
