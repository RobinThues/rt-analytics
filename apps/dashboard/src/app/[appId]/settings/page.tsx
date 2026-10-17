import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/auth/session";
import { PageBar } from "@/components/page-bar";
import { Panel } from "@/components/panel";
import { BlockSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getSettings } from "@/config/data";
import { APP_ID_RE } from "@/discovery/sql";
import { pickMessage } from "@/lib/messages";
import { saveSettings } from "../actions";

const ERRORS: Record<string, string> = {
  timezone: "Unknown timezone.",
  hosts: "Some hostnames are not valid. Use plain hostnames like example.com, one per line.",
  save: "Could not save the settings. Try again.",
};

async function SettingsView({ params, searchParams }: Pick<PageProps<"/[appId]/settings">, "params" | "searchParams">) {
  const { appId } = await params;
  if (!APP_ID_RE.test(appId)) notFound();
  await requireUser();
  const [settings, sp] = await Promise.all([getSettings(appId), searchParams]);
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
            className="h-9 rounded-md border bg-transparent px-2"
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
            className="rounded-md border bg-transparent p-2"
          />
          <p className="text-sm text-muted-foreground">
            One per line. Referrers from these hosts count as direct traffic.
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
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <PageBar title="Settings" />
      <Panel title="App settings" fallback={<BlockSkeleton className="h-72" />}>
        <SettingsView params={params} searchParams={searchParams} />
      </Panel>
    </main>
  );
}
