"use client";
import { ChevronsUpDownIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isPlainClick, usePendingNavigation } from "@/lib/navigation";
import { appSwitchHref } from "@/view/app-switch";

/**
 * The app dropdown at the top of the sidebar: a filter field and one link per app. A link keeps the
 * current page and range (layout spec, option A). Scales to 20 or more apps.
 */
export function AppSwitcher({
  appId,
  apps,
  onNavigate,
}: {
  appId: string;
  apps: readonly string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const shown = apps.filter((a) => a.toLowerCase().includes(filter.trim().toLowerCase()));
  const { navigate } = usePendingNavigation();
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setFilter("");
      }}
    >
      <PopoverTrigger
        render={<Button variant="outline" aria-label="Switch app" className="w-full justify-between font-semibold" />}
      >
        <span className="truncate">{appId}</span>
        <ChevronsUpDownIcon className="size-4 shrink-0 opacity-60" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <Input
          aria-label="Filter apps"
          placeholder="Filter apps"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
        />
        <ul className="flex max-h-72 flex-col overflow-y-auto">
          {shown.map((a) => (
            <li key={a}>
              <Link
                href={appSwitchHref(pathname, a, search)}
                aria-current={a === appId ? "true" : undefined}
                onClick={(e) => {
                  if (!isPlainClick(e)) return;
                  // Through the layout's shared transition: the page dims until the other app is ready.
                  e.preventDefault();
                  setOpen(false);
                  onNavigate?.();
                  navigate(appSwitchHref(pathname, a, search));
                }}
                className={`block truncate rounded-md px-2 py-1.5 hover:bg-muted ${a === appId ? "font-semibold" : ""}`}
              >
                {a}
              </Link>
            </li>
          ))}
          {shown.length === 0 && <li className="px-2 py-1.5 text-muted-foreground">No app matches.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
