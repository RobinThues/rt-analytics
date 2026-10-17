"use client";
import { MenuIcon } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { Wordmark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

// The phone drawer. The provider holds only the open state (no usePathname, so the layout's static shell
// stays prerenderable); the trigger lives in the page top bar, the drawer next to the sidebar data.
const MobileNavContext = createContext<{ open: boolean; setOpen: (open: boolean) => void }>({
  open: false,
  setOpen: () => {},
});

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <MobileNavContext.Provider value={{ open, setOpen }}>{children}</MobileNavContext.Provider>;
}

export function MobileNavTrigger() {
  const { setOpen } = useContext(MobileNavContext);
  return (
    <Button variant="outline" size="icon" aria-label="Open menu" className="md:hidden" onClick={() => setOpen(true)}>
      <MenuIcon className="size-4" aria-hidden />
    </Button>
  );
}

export function MobileNavDrawer({ appId, apps, email }: { appId: string; apps: readonly string[]; email: string }) {
  const { open, setOpen } = useContext(MobileNavContext);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="w-64 bg-sidebar p-0">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <div className="flex h-full flex-col">
          {/* Top row: the wordmark; the sheet's close button sits in the top right corner. */}
          <div className="flex h-10 shrink-0 items-center px-4">
            <Wordmark />
          </div>
          <AppSidebar appId={appId} apps={apps} email={email} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
