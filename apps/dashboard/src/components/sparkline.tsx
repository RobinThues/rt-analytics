"use client";
import { Line, LineChart } from "recharts";

/** A tiny trend line for list rows; the numbers next to it carry the values. */
export function Sparkline({ values }: { values: readonly number[] }) {
  const data = values.map((n, i) => ({ i, n }));
  return (
    <LineChart width={80} height={24} data={data} aria-hidden>
      <Line
        dataKey="n"
        type="monotone"
        stroke="var(--chart-current)"
        strokeWidth={1.5}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}
