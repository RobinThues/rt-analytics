import { Suspense, type ReactNode } from "react";
import { cn } from "cn";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PanelBoundary } from "./panel-boundary";

/** One dashboard panel: its own Suspense and error boundary, so a slow or failing query stays local. */
export function Panel({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <PanelBoundary>
          <Suspense fallback={<Skeleton className="h-32 w-full" />}>{children}</Suspense>
        </PanelBoundary>
      </CardContent>
    </Card>
  );
}
