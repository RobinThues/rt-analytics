import Link from "next/link";
import { refreshApp, toggleLive } from "@/app/[appId]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAGE_PATHS, type AppPage } from "@/lib/pages";
import { viewQuery } from "@/lib/query-string";
import type { DateRange } from "@/time/range";

interface HeaderProps {
  appId: string;
  apps: readonly string[];
  page: AppPage;
  state: { range: DateRange; compare: boolean };
  live: boolean;
  /** Current view query string ("?from=…" plus page params), kept after Live and Refresh. */
  qs: string;
  /** Page params that must survive the date form (explorer selection, funnel steps). */
  hidden?: ReadonlyArray<readonly [string, string]>;
}

const PAGE_LABELS: Record<AppPage, string> = { overview: "Overview", events: "Events", funnels: "Funnels" };

// Plain forms: the header works without client JavaScript (spec section 3).
export function Header({ appId, apps, page, state, live, qs, hidden = [] }: HeaderProps) {
  const rangeQs = viewQuery(state);
  const here = `/${appId}${PAGE_PATHS[page]}`;
  return (
    <header className="mb-6 flex flex-col gap-3 border-b pb-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <nav className="flex flex-wrap gap-3" aria-label="Apps">
          {apps.map((a) => (
            <Link
              key={a}
              href={`/${a}${PAGE_PATHS[page]}${rangeQs}`}
              className={a === appId ? "font-semibold" : "underline"}
            >
              {a}
            </Link>
          ))}
        </nav>
        <nav className="flex flex-wrap gap-3 text-sm" aria-label="Pages">
          {(Object.keys(PAGE_PATHS) as AppPage[]).map((p) => (
            <Link
              key={p}
              href={`/${appId}${PAGE_PATHS[p]}${rangeQs}`}
              aria-current={p === page ? "page" : undefined}
              className={p === page ? "font-semibold" : "underline"}
            >
              {PAGE_LABELS[p]}
            </Link>
          ))}
          <Link href={`/${appId}/settings`} className="underline">
            Settings
          </Link>
        </nav>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form method="get" action={here} className="flex flex-wrap items-center gap-2">
          <Input type="date" name="from" defaultValue={state.range.from} aria-label="From" className="w-40" />
          <Input type="date" name="to" defaultValue={state.range.to} aria-label="To" className="w-40" />
          {/* Unchecked sends only compare=0; checked sends both values, which reads as "on". */}
          <input type="hidden" name="compare" value="0" />
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="compare" value="1" defaultChecked={state.compare} />
            Compare
          </label>
          {hidden.map(([k, v], i) => (
            <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
          ))}
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>
        <div className="ml-auto flex items-center gap-2">
          {live && <Badge>Live</Badge>}
          <form action={toggleLive.bind(null, appId, page, qs)}>
            <Button type="submit" variant="outline">
              {live ? "Turn Live off" : "Turn Live on"}
            </Button>
          </form>
          <form action={refreshApp.bind(null, appId, page, qs)}>
            <Button type="submit" variant="outline">
              Refresh
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
