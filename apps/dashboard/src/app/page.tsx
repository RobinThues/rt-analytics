import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/auth/session";
import { Wordmark } from "@/components/mark";
import { QueryError } from "@/components/query-error";
import { Skeleton } from "@/components/ui/skeleton";
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
          <Link className="text-primary underline underline-offset-2" href={`/${encodeURIComponent(app_id)}`}>
            {app_id}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-5">
      <Wordmark className="mb-4 text-lg" />
      <h1 className="mb-4 text-2xl font-semibold">Apps</h1>
      <Suspense
        fallback={
          <div data-testid="skeleton" className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-5 w-32" />
            ))}
          </div>
        }
      >
        <Apps />
      </Suspense>
    </main>
  );
}
