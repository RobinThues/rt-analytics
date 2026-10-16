import { Suspense, type ReactNode } from "react";
import { loadPage, type PageData, type PageInput, type PanelProps } from "./page-data";

/**
 * A data part of a page: waits for the request (params, search params, settings) and renders with it.
 * Place it inside a Suspense boundary; the page around it stays a static frame.
 */
export async function WithPage({ input, children }: { input: PageInput; children: (data: PageData) => ReactNode }) {
  return children(await loadPage(input));
}

/**
 * The usual data part of a panel: the request's panel props, inside a Suspense keyed by the app. Search
 * param changes keep the key, so a same-page change keeps the old content (dimmed); an app switch
 * changes the key, so the panel shows its skeleton (Next leaves the app id out of its segment keys).
 */
export function DataPart({
  input,
  fallback,
  children,
}: {
  input: PageInput;
  fallback: ReactNode;
  children: (props: PanelProps, data: PageData) => ReactNode;
}) {
  return (
    <WithPage input={input}>
      {(d) => (
        <Suspense key={d.appId} fallback={fallback}>
          {children({ ctx: d.ctx, live: d.live, maxBytes: d.maxBytes }, d)}
        </Suspense>
      )}
    </WithPage>
  );
}
