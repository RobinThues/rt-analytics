import { Suspense } from "react";
import { CredentialsBanner } from "@/components/credentials-banner";
import { Header } from "@/components/header";
import { Panel } from "@/components/panel";
import { viewQuery } from "@/lib/query-string";
import { loadPage } from "./page-data";
import { BREAKDOWNS, BreakdownPanel } from "./panels/breakdowns";
import { PeoplePanel } from "./panels/people";
import { ConsentPanel, SlowPagesPanel, TopErrorsPanel, WebVitalsPanel } from "./panels/quality";
import { ErrorChart, KpiPanel, TrafficCharts } from "./panels/traffic";

async function Overview({ params, searchParams }: PageProps<"/[appId]">) {
  const data = await loadPage(params, searchParams);
  const { appId, apps, state, live, ctx, maxBytes, settings } = data;
  const p = { ctx, live, maxBytes };
  return (
    <>
      <Header appId={appId} apps={apps} page="overview" state={state} live={live} qs={viewQuery(state)} />
      <Suspense fallback={null}>
        <CredentialsBanner />
      </Suspense>
      <p className="mb-4 text-sm text-muted-foreground">
        {state.range.from} to {state.range.to} ({settings.timezone})
        {state.compare && `, compared with ${ctx.prev.from} to ${ctx.prev.to}`}
      </p>
      <div className="grid gap-4">
        <Panel title="Summary">
          <KpiPanel {...p} />
        </Panel>
        <Panel title="Over time">
          <TrafficCharts {...p} />
        </Panel>
        <div className="grid gap-4 lg:grid-cols-2">
          {BREAKDOWNS.map((b) => (
            <Panel key={b.dim} title={b.title}>
              <BreakdownPanel {...p} dim={b.dim} valueLabel={b.valueLabel} />
            </Panel>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Web vitals" description="75th percentile; lower is better.">
            <WebVitalsPanel {...p} />
          </Panel>
          <Panel title="Slowest pages by LCP">
            <SlowPagesPanel {...p} />
          </Panel>
          <Panel title="Errors over time">
            <ErrorChart {...p} />
          </Panel>
          <Panel title="Top errors">
            <TopErrorsPanel {...p} />
          </Panel>
          <Panel title="Consent">
            <ConsentPanel {...p} />
          </Panel>
          <Panel title="Returning visitors and retention">
            <PeoplePanel {...p} />
          </Panel>
        </div>
      </div>
    </>
  );
}

export default function OverviewPage(props: PageProps<"/[appId]">) {
  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
      <Suspense fallback={<p>Loading…</p>}>
        <Overview {...props} />
      </Suspense>
    </main>
  );
}
