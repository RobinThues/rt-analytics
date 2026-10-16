import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/auth/session";
import { TAGS } from "@/bq/cache-rules";
import { isLive, query } from "@/bq/query";
import { Header } from "@/components/header";
import { QueryError } from "@/components/query-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSettings } from "@/config/data";
import { listApps } from "@/discovery/data";
import { APP_ID_RE } from "@/discovery/sql";
import { readEnv } from "@/env";
import { viewQuery } from "@/lib/query-string";
import { rangeBounds, todayIn } from "@/time/range";
import { parseViewState } from "@/view/state";
import { eventsInRangeQuery } from "./events-in-range";

async function AppView({ params, searchParams }: PageProps<"/[appId]">) {
  const { appId } = await params;
  if (!APP_ID_RE.test(appId)) notFound();
  await requireUser();
  const env = readEnv();
  const [settings, apps, live, sp] = await Promise.all([getSettings(appId), listApps(), isLive(), searchParams]);
  const state = parseViewState(sp, todayIn(settings.timezone, new Date()));
  const res = await query<{ events: number }>(
    eventsInRangeQuery(env, appId, rangeBounds(state.range, settings.timezone)),
    { tags: [TAGS.data(appId)], ttl: env.cacheTtlSeconds, live },
  );
  const appIds = apps.ok ? apps.rows.map((a) => a.app_id) : [appId];
  return (
    <>
      <Header appId={appId} apps={appIds} page="overview" state={state} live={live} qs={viewQuery(state)} />
      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>Events in range</CardTitle>
        </CardHeader>
        <CardContent>
          {res.ok ? (
            <p className="text-3xl font-semibold" data-testid="events-in-range">
              {(res.rows[0]?.events ?? 0).toLocaleString("en")}
            </p>
          ) : (
            <QueryError result={res} maxBytes={env.maxBytesPerQuery} />
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            {state.range.from} to {state.range.to} ({settings.timezone}). The overview follows in Phase C.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

export default function AppPage(props: PageProps<"/[appId]">) {
  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <Suspense fallback={<p>Loading…</p>}>
        <AppView {...props} />
      </Suspense>
    </main>
  );
}
