import { EVENTS } from "rt-analytics/schema";
import Link from "next/link";
import { Suspense } from "react";
import { dataQuery } from "@/bq/query";
import { CredentialsBanner } from "@/components/credentials-banner";
import { FunnelEditor } from "@/components/funnel-editor";
import { FunnelResult } from "@/components/funnel-result";
import { Header } from "@/components/header";
import { Panel } from "@/components/panel";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFunnels } from "@/config/data";
import { buildCatalog } from "@/discovery/catalog";
import { listEvents, listPropKeys } from "@/discovery/data";
import {
  allowedFor,
  encodeStep,
  parseStep,
  toFunnelView,
  validateSteps,
  type FunnelRow,
  type FunnelStep,
} from "@/funnels/steps";
import { viewQuery } from "@/lib/query-string";
import { funnelQuery } from "@/queries/funnel";
import { loadPage, type PanelProps } from "../page-data";
import { deleteFunnel, saveFunnel } from "./actions";

const ERRORS: Record<string, string> = {
  name: "Give the funnel a name (up to 80 characters).",
  steps: "These steps are not valid any more.",
  save: "Could not save the funnel. Try again.",
  delete: "Could not delete the funnel. Try again.",
};

const many = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

async function ResultPanel({ ctx, live, maxBytes, steps }: PanelProps & { steps: FunnelStep[] }) {
  const res = await dataQuery<FunnelRow>(funnelQuery(ctx, steps), ctx.appId, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  return <FunnelResult steps={steps} view={toFunnelView(res.rows, steps.length, ctx.compare)} compare={ctx.compare} />;
}

async function Funnels({ params, searchParams }: PageProps<"/[appId]/funnels">) {
  const data = await loadPage(params, searchParams);
  const { appId, apps, state, live, ctx, maxBytes, sp } = data;
  const [events, keys, saved] = await Promise.all([listEvents(appId), listPropKeys(appId), getFunnels(appId)]);
  const catalog = buildCatalog(events.ok ? events.rows : [], keys.ok ? keys.rows : []);
  const allowed = allowedFor(catalog, saved.funnels);
  const funnelId = typeof sp.funnel === "string" ? sp.funnel : null;
  const open = funnelId ? saved.funnels.find((f) => f.id === funnelId) : undefined;
  const steps = validateSteps(open ? open.steps : many(sp.steps).map(parseStep), allowed);
  const pageParams: Array<[string, string]> = open
    ? [["funnel", open.id]]
    : (steps ?? []).map((s): [string, string] => ["steps", encodeStep(s)]);
  const qs = viewQuery(state, pageParams);
  const rangeQs = viewQuery(state);
  const baseQuery = [...new URLSearchParams(rangeQs.slice(1))] as Array<[string, string]>;
  const editorEvents = [...allowed.events].sort((a, b) =>
    a === EVENTS.pageview ? -1 : b === EVENTS.pageview ? 1 : a.localeCompare(b),
  );
  const editorKeys = Object.fromEntries(editorEvents.map((e) => [e, [...(allowed.keys[e] ?? [])]]));
  const error = typeof sp.error === "string" ? (ERRORS[sp.error] ?? "Something went wrong.") : null;
  const p = { ctx, live, maxBytes };
  return (
    <>
      <Header appId={appId} apps={apps} page="funnels" state={state} live={live} qs={qs} hidden={pageParams} />
      <Suspense fallback={null}>
        <CredentialsBanner />
      </Suspense>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {funnelId && !open && !saved.failed && (
        <p className="mb-4 text-sm text-destructive">This saved funnel does not exist any more.</p>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <Panel title="Saved funnels">
          {saved.failed ? (
            <p className="text-sm text-muted-foreground">Could not load the saved funnels.</p>
          ) : saved.funnels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved funnels yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {saved.funnels.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2">
                  <Link
                    href={`/${appId}/funnels${viewQuery(state, [["funnel", f.id]])}`}
                    className={f.id === open?.id ? "truncate font-semibold" : "truncate underline"}
                  >
                    {f.name}
                  </Link>
                  <form action={deleteFunnel.bind(null, appId, f.id, rangeQs)}>
                    <Button type="submit" variant="outline" size="sm" aria-label={`Delete ${f.name}`}>
                      Delete
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title={open ? open.name : "Funnel"} description="Counts sessions that do the steps in this order.">
            {!events.ok && <QueryError result={events} maxBytes={maxBytes} />}
            <FunnelEditor
              key={qs}
              events={editorEvents}
              keys={editorKeys}
              initial={steps ?? []}
              baseQuery={baseQuery}
            />
          </Panel>
          {steps ? (
            <Panel title="Result">
              <div className="flex flex-col gap-4">
                <ResultPanel {...p} steps={steps} />
                <p className="text-sm text-muted-foreground">
                  Counts sessions. Cookieless sessions end at a full page load and when cookies are accepted, so funnels
                  across those lose sessions.
                </p>
                {!open && (
                  <form
                    action={saveFunnel.bind(null, appId, steps.map(encodeStep), qs)}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="funnel-name">Funnel name</Label>
                      <Input id="funnel-name" name="name" maxLength={80} required className="w-60" />
                    </div>
                    <Button type="submit">Save funnel</Button>
                  </form>
                )}
              </div>
            </Panel>
          ) : (
            <p className="text-sm text-muted-foreground">Choose 2 to 5 steps and press Show funnel.</p>
          )}
        </div>
      </div>
    </>
  );
}

export default function FunnelsPage(props: PageProps<"/[appId]/funnels">) {
  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
      <Suspense fallback={<p>Loading…</p>}>
        <Funnels {...props} />
      </Suspense>
    </main>
  );
}
