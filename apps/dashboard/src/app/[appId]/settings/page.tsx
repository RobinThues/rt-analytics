import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/auth/session";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getSettings } from "@/config/data";
import { APP_ID_RE } from "@/discovery/sql";
import { saveSettings } from "../actions";

const ERRORS: Record<string, string> = {
  timezone: "Unknown timezone.",
  save: "Could not save the settings. Try again.",
};

async function SettingsView({ params, searchParams }: PageProps<"/[appId]/settings">) {
  const { appId } = await params;
  if (!APP_ID_RE.test(appId)) notFound();
  await requireUser();
  const [settings, sp] = await Promise.all([getSettings(appId), searchParams]);
  const zones = Intl.supportedValuesOf("timeZone");
  if (!zones.includes(settings.timezone)) zones.unshift(settings.timezone);
  const error = typeof sp.error === "string" ? (ERRORS[sp.error] ?? "Something went wrong.") : null;
  return (
    <>
      <p className="mb-4 text-sm">
        <Link className="underline" href={`/${appId}`}>
          Back to {appId}
        </Link>
      </p>
      <h1 className="mb-4 text-2xl font-semibold">Settings for {appId}</h1>
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
    </>
  );
}

export default function SettingsPage(props: PageProps<"/[appId]/settings">) {
  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <Suspense fallback={<p>Loading…</p>}>
        <SettingsView {...props} />
      </Suspense>
    </main>
  );
}
