import { Suspense } from "react";
import { refreshApp, toggleLive } from "@/app/[appId]/actions";
import { loadPage, type PageInput } from "@/app/[appId]/page-data";
import { CompareToggle } from "@/components/compare-toggle";
import { CredentialsBanner } from "@/components/credentials-banner";
import { IntervalToggle } from "@/components/interval-toggle";
import { MobileNavTrigger } from "@/components/mobile-nav";
import { RangeLine } from "@/components/range-line";
import { RangePicker } from "@/components/range-picker";
import { Mark } from "@/components/mark";
import { LineSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppPage } from "@/lib/pages";
import { hourlyAllowed } from "@/view/interval";
import { formatRangeLabel } from "@/view/range-ui";
import { rawViewQuery } from "@/view/raw-query";

async function BarControls({ input, page }: { input: PageInput; page: AppPage }) {
  const d = await loadPage(input);
  const qs = rawViewQuery(d.sp);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <RangePicker range={d.state.range} today={d.today} label={formatRangeLabel(d.state.range)} />
      <CompareToggle compare={d.state.compare} />
      {hasCharts(page) && <IntervalToggle interval={d.ctx.interval} hourlyAllowed={hourlyAllowed(d.state.range)} />}
      {d.live && <Badge className="bg-sidebar-accent text-sidebar-accent-foreground">Live</Badge>}
      <form action={toggleLive.bind(null, d.appId, page, qs)}>
        <Button type="submit" variant="outline">
          {d.live ? "Turn Live off" : "Turn Live on"}
        </Button>
      </form>
      <form action={refreshApp.bind(null, d.appId, page, qs)}>
        <Button type="submit" variant="outline">
          Refresh
        </Button>
      </form>
    </div>
  );
}

async function RangeLinePart({ input }: { input: PageInput }) {
  const d = await loadPage(input);
  return <RangeLine range={d.state.range} timezone={d.settings.timezone} prev={d.state.compare ? d.ctx.prev : null} />;
}

/** Pages with over-time charts get the Daily | Hourly switch (funnels have none). */
const hasCharts = (page: AppPage) => page === "overview" || page === "events";

const controlsSkeleton = (page: AppPage) => (
  <div data-testid="skeleton" className="flex flex-wrap items-center gap-2">
    <Skeleton className="h-7.5 w-52" />
    <Skeleton className="h-7.5 w-24" />
    {hasCharts(page) && <Skeleton className="h-7.5 w-28" />}
    <Skeleton className="h-7.5 w-28" />
    <Skeleton className="h-7.5 w-20" />
  </div>
);

/**
 * The page top bar (layout spec, option A): the title at once; with `input`, the range picker, Compare,
 * Daily | Hourly (pages with charts), Live and Refresh, the range line and the credentials banner as data parts. Settings passes no input.
 */
export function PageBar({ title, page, input }: { title: string; page?: AppPage; input?: PageInput }) {
  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <MobileNavTrigger />
          <Mark className="size-4 md:hidden" />
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>
        {input && page && (
          <Suspense fallback={controlsSkeleton(page)}>
            <BarControls input={input} page={page} />
          </Suspense>
        )}
      </div>
      {input && (
        <Suspense fallback={<LineSkeleton />}>
          <RangeLinePart input={input} />
        </Suspense>
      )}
      {input && (
        <Suspense fallback={null}>
          <CredentialsBanner />
        </Suspense>
      )}
    </div>
  );
}
