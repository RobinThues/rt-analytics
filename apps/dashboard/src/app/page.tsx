import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/auth/session";
import { QueryError } from "@/components/query-error";
import { listApps } from "@/discovery/data";
import { readEnv } from "@/env";

async function Apps() {
  await requireUser();
  const apps = await listApps();
  if (!apps.ok) return <QueryError result={apps} maxBytes={readEnv().maxBytesPerQuery} />;
  if (apps.rows.length === 0) return <p>No apps have sent events in the last 7 days.</p>;
  return (
    <ul className="space-y-2">
      {apps.rows.map(({ app_id }) => (
        <li key={app_id}>
          <Link className="underline" href={`/${encodeURIComponent(app_id)}`}>
            {app_id}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Apps</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <Apps />
      </Suspense>
    </main>
  );
}
