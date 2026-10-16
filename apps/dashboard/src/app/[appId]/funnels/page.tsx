import { PendingLink } from "@/components/pending-link";
import { Suspense, type ReactNode } from "react";
import { dataQuery } from "@/bq/query";
import { PageBar } from "@/components/page-bar";
import { FunnelChart } from "@/components/funnel-chart";
import { FunnelEditor } from "@/components/funnel-editor";
import { FunnelResult } from "@/components/funnel-result";
import { PageBody } from "@/components/page-body";
import { Panel } from "@/components/panel";
import { QueryError } from "@/components/query-error";
import { BlockSkeleton, TableSkeleton } from "@/components/skeletons";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { encodeStep, toFunnelView, type FunnelRow, type FunnelStep } from "@/funnels/steps";
import { pickMessage } from "@/lib/messages";
import { viewQuery } from "@/lib/query-string";
import { funnelQuery } from "@/queries/funnel";
import type { PageInput, PanelProps } from "../page-data";
import { deleteFunnel, saveFunnel } from "./actions";
import { loadFunnelPage, type FunnelPageData } from "./funnel-data";

const ERRORS: Record<string, string> = {
  name: "Give the funnel a name (up to 80 characters).",
  steps: "These steps are not valid any more.",
  save: "Could not save the funnel. Try again.",
  delete: "Could not delete the funnel. Try again.",
};

async function ResultPanel({ ctx, live, maxBytes, steps }: PanelProps & { steps: FunnelStep[] }) {
  const res = await dataQuery<FunnelRow>(funnelQuery(ctx, steps), ctx.appId, live);
  if (!res.ok) return <QueryError result={res} maxBytes={maxBytes} />;
  const view = toFunnelView(res.rows, steps.length, ctx.compare);
  return (
    <div className="flex flex-col gap-4">
      <FunnelChart steps={steps} view={view} compare={ctx.compare} />
      <FunnelResult steps={steps} view={view} compare={ctx.compare} />
    </div>
  );
}

/** A data part of the funnels page: the funnel data, inside a Suspense keyed by the app. */
async function FunnelPart({
  input,
  fallback,
  children,
}: {
  input: PageInput;
  fallback: ReactNode;
  children: (f: FunnelPageData, p: PanelProps) => ReactNode;
}) {
  const f = await loadFunnelPage(input);
  const p = { ctx: f.page.ctx, live: f.page.live, maxBytes: f.page.maxBytes };
  return (
    <Suspense key={f.page.appId} fallback={fallback}>
      {children(f, p)}
    </Suspense>
  );
}

function SavedList({ f }: { f: FunnelPageData }) {
  const { saved, open, page, rangeQs } = f;
  if (saved.failed) return <p className="text-sm text-muted-foreground">Could not load the saved funnels.</p>;
  if (saved.funnels.length === 0) return <p className="text-sm text-muted-foreground">No saved funnels yet.</p>;
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {saved.funnels.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-2">
          <PendingLink
            href={`/${page.appId}/funnels${viewQuery(page.state, [["funnel", s.id]])}`}
            className={s.id === open?.id ? "truncate font-semibold" : "truncate underline"}
          >
            {s.name}
          </PendingLink>
          <form action={deleteFunnel.bind(null, page.appId, s.id, rangeQs)}>
            <SubmitButton variant="outline" size="sm" aria-label={`Delete ${s.name}`} pendingLabel="Deleting…">
              Delete
            </SubmitButton>
          </form>
        </li>
      ))}
    </ul>
  );
}

/** The editor with the messages about the URL above it (they appear with the data, inside the column). */
function EditorBody({ f, maxBytes }: { f: FunnelPageData; maxBytes: number }) {
  const error = pickMessage(ERRORS, f.page.sp.error);
  const messages = [
    error,
    f.leftOut ? "Some steps are not available any more and were left out." : null,
    f.funnelId && !f.open && !f.saved.failed ? "This saved funnel does not exist any more." : null,
  ].filter((m): m is string => m !== null);
  return (
    <div className="flex flex-col gap-3">
      {messages.map((m) => (
        <p key={m} className="text-sm text-destructive">
          {m}
        </p>
      ))}
      {!f.events.ok && <QueryError result={f.events} maxBytes={maxBytes} />}
      <FunnelEditor
        key={f.qs}
        events={f.editorEvents}
        keys={f.editorKeys}
        initial={f.editorSteps}
        baseQuery={[...new URLSearchParams(f.rangeQs.slice(1))] as Array<[string, string]>}
      />
    </div>
  );
}

function ResultArea({ f, p }: { f: FunnelPageData; p: PanelProps }) {
  const { steps, open, page, qs } = f;
  if (!steps) return <p className="text-sm text-muted-foreground">Choose 2 to 5 steps and press Show funnel.</p>;
  return (
    <Panel title="Result">
      <div className="flex flex-col gap-4">
        <ResultPanel {...p} steps={steps} />
        <p className="text-sm text-muted-foreground">
          Counts sessions. Cookieless sessions end at a full page load and when cookies are accepted, so funnels across
          those lose sessions.
        </p>
        {!open && (
          <form
            action={saveFunnel.bind(null, page.appId, steps.map(encodeStep), qs)}
            className="flex flex-wrap items-end gap-2"
          >
            <div className="flex flex-col gap-1">
              <Label htmlFor="funnel-name">Funnel name</Label>
              <Input id="funnel-name" name="name" maxLength={80} required className="w-60" />
            </div>
            <SubmitButton pendingLabel="Saving…">Save funnel</SubmitButton>
          </form>
        )}
      </div>
    </Panel>
  );
}

// A synchronous page: "Saved funnels" and the "Funnel" editor frame render at once; the saved funnel's
// name, the messages and the result area come with the data (layout spec).
export default function FunnelsPage({ params, searchParams }: PageProps<"/[appId]/funnels">) {
  const input: PageInput = { params, searchParams };
  const savedSkeleton = <TableSkeleton rows={3} />;
  const editorSkeleton = <BlockSkeleton className="h-40" />;
  const resultSkeleton = <BlockSkeleton className="h-64" />;
  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
      <PageBar title="Funnels" page="funnels" input={input} />
      <PageBody>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
          <Panel title="Saved funnels" fallback={savedSkeleton}>
            <FunnelPart input={input} fallback={savedSkeleton}>
              {(f) => <SavedList f={f} />}
            </FunnelPart>
          </Panel>
          <div className="flex min-w-0 flex-col gap-4">
            <Panel
              title={
                <Suspense fallback="Funnel">
                  <FunnelPart input={input} fallback="Funnel">
                    {(f) => (f.open ? f.open.name : "Funnel")}
                  </FunnelPart>
                </Suspense>
              }
              description="Counts sessions that do the steps in this order."
              fallback={editorSkeleton}
            >
              <FunnelPart input={input} fallback={editorSkeleton}>
                {(f, p) => <EditorBody f={f} maxBytes={p.maxBytes} />}
              </FunnelPart>
            </Panel>
            <Suspense fallback={resultSkeleton}>
              <FunnelPart input={input} fallback={resultSkeleton}>
                {(f, p) => <ResultArea f={f} p={p} />}
              </FunnelPart>
            </Suspense>
          </div>
        </div>
      </PageBody>
    </main>
  );
}
