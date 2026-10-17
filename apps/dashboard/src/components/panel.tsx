import { Suspense, type ReactNode } from "react";
import { cn } from "cn";
import { BlockSkeleton } from "@/components/skeletons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PanelBoundary } from "./panel-boundary";

/**
 * One dashboard panel: its frame (title, description) renders at once; the body has its own Suspense
 * with a skeleton and its own error boundary, so a slow or failing query stays local.
 */
export function Panel({
  title,
  description,
  className,
  fallback = <BlockSkeleton />,
  children,
}: {
  title: ReactNode;
  description?: string;
  className?: string;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className={cn("min-w-0 gap-3", className)} data-panel={typeof title === "string" ? title : undefined}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">
          <h2>{title}</h2>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <PanelBoundary>
          <Suspense fallback={fallback}>{children}</Suspense>
        </PanelBoundary>
      </CardContent>
    </Card>
  );
}
