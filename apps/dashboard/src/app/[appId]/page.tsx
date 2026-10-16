import { PageBar } from "@/components/page-bar";
import { PageBody } from "@/components/page-body";
import { Panel } from "@/components/panel";
import { ChartSkeleton, KpiSkeleton, TableSkeleton } from "@/components/skeletons";
import type { PageInput } from "./page-data";
import { BREAKDOWNS, BreakdownPanel } from "./panels/breakdowns";
import { PeoplePanel } from "./panels/people";
import { ConsentPanel, SlowPagesPanel, TopErrorsPanel, WebVitalsPanel } from "./panels/quality";
import { ErrorChart, KpiPanel, TrafficCharts } from "./panels/traffic";
import { DataPart } from "./with-page";

// A synchronous page: the panel frames render at once (and are prefetched); every body is a data part
// with a skeleton of its size (layout spec, "Skeletons instead of Loading…").
export default function OverviewPage({ params, searchParams }: PageProps<"/[appId]">) {
  const input: PageInput = { params, searchParams };
  const table = <TableSkeleton rows={5} />;
  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
      <PageBar title="Overview" page="overview" input={input} />
      <PageBody>
        <div className="grid gap-4">
          <Panel title="Summary" fallback={<KpiSkeleton />}>
            <DataPart input={input} fallback={<KpiSkeleton />}>
              {(p) => <KpiPanel {...p} />}
            </DataPart>
          </Panel>
          <Panel title="Over time" fallback={<ChartSkeleton count={3} />}>
            <DataPart input={input} fallback={<ChartSkeleton count={3} />}>
              {(p) => <TrafficCharts {...p} />}
            </DataPart>
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            {BREAKDOWNS.map((b) => (
              <Panel key={b.dim} title={b.title} fallback={table}>
                <DataPart input={input} fallback={table}>
                  {(p) => <BreakdownPanel {...p} dim={b.dim} valueLabel={b.valueLabel} />}
                </DataPart>
              </Panel>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Web vitals" description="75th percentile; lower is better." fallback={table}>
              <DataPart input={input} fallback={table}>
                {(p) => <WebVitalsPanel {...p} />}
              </DataPart>
            </Panel>
            <Panel title="Slowest pages by LCP" fallback={table}>
              <DataPart input={input} fallback={table}>
                {(p) => <SlowPagesPanel {...p} />}
              </DataPart>
            </Panel>
            <Panel title="Errors over time" fallback={<ChartSkeleton />}>
              <DataPart input={input} fallback={<ChartSkeleton />}>
                {(p) => <ErrorChart {...p} />}
              </DataPart>
            </Panel>
            <Panel title="Top errors" fallback={table}>
              <DataPart input={input} fallback={table}>
                {(p) => <TopErrorsPanel {...p} />}
              </DataPart>
            </Panel>
            <Panel title="Consent" fallback={table}>
              <DataPart input={input} fallback={table}>
                {(p) => <ConsentPanel {...p} />}
              </DataPart>
            </Panel>
            <Panel title="Returning visitors and retention" fallback={table}>
              <DataPart input={input} fallback={table}>
                {(p) => <PeoplePanel {...p} />}
              </DataPart>
            </Panel>
          </div>
        </div>
      </PageBody>
    </main>
  );
}
