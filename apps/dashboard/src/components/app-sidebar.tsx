"use client";
import { LogOutIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut } from "@/auth/actions";
import { AppSwitcher } from "@/components/app-switcher";
import { Button } from "@/components/ui/button";
import { PAGE_PATHS, type AppPage } from "@/lib/pages";
import { pageHref } from "@/view/app-switch";

const PAGES: ReadonlyArray<{ page: AppPage; label: string }> = [
  { page: "overview", label: "Overview" },
  { page: "events", label: "Events" },
  { page: "funnels", label: "Funnels" },
];

const linkClass = (current: boolean) =>
  `flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${current ? "bg-muted font-semibold" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;

/**
 * Sidebar (layout spec, option A): app switcher, the pages, then Settings, the signed-in email and Sign
 * out. Links keep the date range. `onNavigate` closes the phone drawer.
 */
export function AppSidebar({
  appId,
  apps,
  email,
  onNavigate,
}: {
  appId: string;
  apps: readonly string[];
  email: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const segment = pathname.replace(/^\/[^/]+/, "");
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <AppSwitcher appId={appId} apps={apps} onNavigate={onNavigate} />
      <nav aria-label="Pages" className="flex flex-1 flex-col gap-0.5">
        {PAGES.map(({ page, label }) => {
          const current = segment === PAGE_PATHS[page];
          return (
            <Link
              key={page}
              href={pageHref(appId, page, search)}
              aria-current={current ? "page" : undefined}
              onClick={onNavigate}
              className={linkClass(current)}
            >
              {label}
            </Link>
          );
        })}
        <div className="flex-1" />
        <Link
          href={pageHref(appId, "settings", search)}
          aria-current={segment === "/settings" ? "page" : undefined}
          onClick={onNavigate}
          className={linkClass(segment === "/settings")}
        >
          <SettingsIcon className="size-4" aria-hidden />
          Settings
        </Link>
      </nav>
      <div className="mt-auto flex flex-col gap-1 border-t pt-3">
        <p className="truncate px-2 text-xs text-muted-foreground" title={email}>
          {email}
        </p>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
            <LogOutIcon className="size-4" aria-hidden />
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
