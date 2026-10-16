"use client";
import { unstable_rethrow } from "next/navigation";
import { Component, type ReactNode } from "react";
import { RetryButton } from "./retry-button";

/**
 * A failing panel shows a short message; the rest of the page keeps working (spec section 5, "Errors").
 * Next.js's own control-flow errors (redirect() after a server action in a panel's form, notFound()) are
 * handed up to Next instead.
 */
export class PanelBoundary extends Component<{ children: ReactNode }, { error: unknown; failed: boolean }> {
  state = { error: null as unknown, failed: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    unstable_rethrow(this.state.error);
    return (
      <p className="text-sm text-muted-foreground">
        Could not load this panel. <RetryButton />
      </p>
    );
  }
}
