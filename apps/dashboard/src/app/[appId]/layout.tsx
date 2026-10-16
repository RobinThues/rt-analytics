import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/auth/session";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileNavDrawer, MobileNavProvider } from "@/components/mobile-nav";
import { ProgressLine } from "@/components/progress-line";
import { Skeleton } from "@/components/ui/skeleton";
import { listApps } from "@/discovery/data";
import { APP_ID_RE } from "@/discovery/sql";
import { appList } from "./page-data";

async function SidebarData({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  if (!APP_ID_RE.test(appId)) notFound();
  const [user, apps] = await Promise.all([requireUser(), listApps()]);
  const list = appList(appId, apps.ok ? apps.rows.map((a) => a.app_id) : []);
  return (
    <>
      <AppSidebar appId={appId} apps={list} email={user.email} />
      <MobileNavDrawer appId={appId} apps={list} email={user.email} />
    </>
  );
}

function SidebarSkeleton() {
  return (
    <div data-testid="skeleton" className="flex flex-col gap-4 p-3">
      <Skeleton className="h-8 w-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-full" />
      </div>
    </div>
  );
}

/**
 * Shell of every app page (layout spec, option A): the sidebar on the left (a drawer on phones) and the
 * content area. The content area is a Tailwind group: a control with `data-pending` inside it dims the
 * page body and shows the progress line.
 */
export default function AppLayout({ children, params }: LayoutProps<"/[appId]">) {
  return (
    <MobileNavProvider>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r bg-muted/30 md:flex">
          <Suspense fallback={<SidebarSkeleton />}>
            <SidebarData params={params} />
          </Suspense>
        </aside>
        <div className="group/content min-w-0 flex-1">
          <ProgressLine />
          {children}
        </div>
      </div>
    </MobileNavProvider>
  );
}
