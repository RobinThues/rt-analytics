import Link from "next/link";
import { PAGE_PATHS, type AppPage } from "@/lib/pages";
import { viewQuery } from "@/lib/query-string";
import type { DateRange } from "@/time/range";

interface HeaderProps {
  appId: string;
  apps: readonly string[];
  page: AppPage;
  state: { range: DateRange; compare: boolean };
}

const PAGE_LABELS: Record<AppPage, string> = { overview: "Overview", events: "Events", funnels: "Funnels" };

// App and page links. The sidebar replaces this (layout plan, Task 6); the date controls, Live and
// Refresh moved to the page top bar.
export function Header({ appId, apps, page, state }: HeaderProps) {
  const rangeQs = viewQuery(state);
  return (
    <header className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-3">
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
    </header>
  );
}
