import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/auth/session";
import { PageBar } from "@/components/page-bar";
import { Panel } from "@/components/panel";
import { BlockSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { readSettings } from "@/config/data";
import { goalEventOptions } from "@/config/settings";
import { listEvents } from "@/discovery/data";
import { APP_ID_RE } from "@/discovery/sql";
import { pickMessage } from "@/lib/messages";
import { saveSettings } from "../actions";

const ERRORS: Record<string, string> = {
  timezone: "Unknown timezone.",
  hosts: "Some hostnames are not valid. Use plain hostnames like example.com, one per line.",
  goal: "That goal event is not valid.",
  save: "Could not save the settings. Try again.",
};

async function SettingsView({ params, searchParams }: Pick<PageProps<"/[appId]/settings">, "params" | "searchParams">) {
  const { appId } = await params;
  if (!APP_ID_RE.test(appId)) notFound();
  await requireUser();
  const [{ settings, failed }, sp] = await Promise.all([readSettings(appId), searchParams]);
  // Saving the defaults a failed read gives would wipe the stored hosts and goal.
  if (failed) return <p className="text-sm text-destructive">Could not load the settings. Reload to try again.</p>;
  const events = await listEvents(appId, settings.timezone);
  const goalEvents = goalEventOptions(events.ok ? events.rows : [], settings.goal?.event);
  const zones = Intl.supportedValuesOf("timeZone");
  if (!zones.includes("UTC")) zones.push("UTC");
  if (!zones.includes(settings.timezone)) zones.unshift(settings.timezone);
  const error = pickMessage(ERRORS, sp.error);
  return (
    <Suspense key={appId} fallback={<BlockSkeleton className="h-72" />}>
      <p className="mb-4 text-sm">
        <Link className="text-primary underline underline-offset-2" href={`/${appId}`}>
          Back to {appId}
        </Link>
      </p>
      {sp.saved === "1" && <p className="mb-4 text-sm">Saved.</p>}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <form action={saveSettings.bind(null, appId)} className="flex max-w-md flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="timezone">Timezone</Label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={settings.timezone}
            className="h-7.5 rounded-md border border-input bg-transparent px-2 text-base md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="hosts">Own hostnames</Label>
          <textarea
            id="hosts"
            name="hosts"
            defaultValue={settings.hosts.join("\n")}
            rows={3}
            className="rounded-md border border-input bg-transparent p-2 text-base md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-sm text-muted-foreground">
            One per line. Referrers from these hosts count as direct traffic.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="goal_event">Goal event</Label>
          <select
            id="goal_event"
            name="goal_event"
            defaultValue={settings.goal?.event ?? ""}
            className="h-7.5 rounded-md border border-input bg-transparent px-2 text-base md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">No goal</option>
            {goalEvents.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">
            A session converts when it has this event. Only events with a session are listed, so server events are not.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="goal_label">Goal name</Label>
          <input
            id="goal_label"
            name="goal_label"
            defaultValue={settings.goal?.label ?? ""}
            maxLength={60}
            className="h-7.5 rounded-md border border-input bg-transparent px-2 text-base md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-sm text-muted-foreground">
            Say what it really counts, for example &quot;Clicks on subscribe&quot;. Empty: the event name.
          </p>
        </div>
        <Button type="submit" className="self-start">
          Save
        </Button>
      </form>
    </Suspense>
  );
}

// A synchronous page: the title and the panel frame render at once, the form comes with the data.
export default function SettingsPage({ params, searchParams }: PageProps<"/[appId]/settings">) {
  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-5">
      <PageBar title="Settings" />
      <Panel title="App settings" fallback={<BlockSkeleton className="h-72" />}>
        <SettingsView params={params} searchParams={searchParams} />
      </Panel>
    </main>
  );
}
