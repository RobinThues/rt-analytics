import { BreakdownTable } from "@/components/breakdown-table";
import { QueryError } from "@/components/query-error";
import { toBreakdown } from "@/overview/model";
import { splitBreakdowns, type BreakdownDim } from "@/queries/overview";
import { loadBreakdowns } from "./shared";
import type { PanelProps } from "../page-data";

export const BREAKDOWNS: ReadonlyArray<{ dim: BreakdownDim; title: string; valueLabel: string }> = [
  { dim: "page", title: "Top pages", valueLabel: "Page" },
  { dim: "entry_page", title: "Entry pages", valueLabel: "Page" },
  { dim: "source", title: "Sources", valueLabel: "Referrer" },
  { dim: "utm", title: "Campaigns", valueLabel: "Campaign" },
  { dim: "country", title: "Countries", valueLabel: "Country" },
  { dim: "device", title: "Devices", valueLabel: "Device" },
  { dim: "browser", title: "Browsers", valueLabel: "Browser" },
  { dim: "os", title: "Operating systems", valueLabel: "OS" },
];

export async function BreakdownPanel({
  ctx,
  live,
  maxBytes,
  dim,
  valueLabel,
}: PanelProps & { dim: BreakdownDim; valueLabel: string }) {
  const res = await loadBreakdowns(ctx, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  return (
    <BreakdownTable
      rows={toBreakdown(splitBreakdowns(res.rows)[dim], ctx.days, ctx.compare)}
      valueLabel={valueLabel}
      compare={ctx.compare}
      testId={`breakdown-${dim}`}
    />
  );
}
