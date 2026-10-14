import Link from "next/link";
import { refreshApp, toggleLive } from "@/app/[appId]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DateRange } from "@/time/range";

interface HeaderProps {
  appId: string;
  apps: readonly string[];
  state: { range: DateRange; compare: boolean };
  live: boolean;
  /** Current view query string ("?from=…"), kept when switching apps or after actions. */
  qs: string;
}

// Plain forms: the header works without client JavaScript (spec section 3).
export function Header({ appId, apps, state, live, qs }: HeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-center gap-4 border-b pb-4">
      <nav className="flex flex-wrap gap-3" aria-label="Apps">
        {apps.map((a) => (
          <Link key={a} href={`/${a}${qs}`} className={a === appId ? "font-semibold" : "underline"}>
            {a}
          </Link>
        ))}
      </nav>
      <form method="get" action={`/${appId}`} className="flex flex-wrap items-center gap-2">
        <Input type="date" name="from" defaultValue={state.range.from} aria-label="From" className="w-40" />
        <Input type="date" name="to" defaultValue={state.range.to} aria-label="To" className="w-40" />
        {/* Unchecked sends only compare=0; checked sends both values, which reads as "on". */}
        <input type="hidden" name="compare" value="0" />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="compare" value="1" defaultChecked={state.compare} />
          Compare
        </label>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>
      <div className="ml-auto flex items-center gap-2">
        {live && <Badge>Live</Badge>}
        <form action={toggleLive.bind(null, appId, qs)}>
          <Button type="submit" variant="outline">
            {live ? "Turn Live off" : "Turn Live on"}
          </Button>
        </form>
        <form action={refreshApp.bind(null, appId, qs)}>
          <Button type="submit" variant="outline">
            Refresh
          </Button>
        </form>
        <Link href={`/${appId}/settings`} className="text-sm underline">
          Settings
        </Link>
      </div>
    </header>
  );
}
