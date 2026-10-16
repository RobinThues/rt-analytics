"use client";
import { Component, type ReactNode } from "react";
import { RetryButton } from "./retry-button";

/** A failing panel shows a short message; the rest of the page keeps working (spec section 5, "Errors"). */
export class PanelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p className="text-sm text-muted-foreground">
        Could not load this panel. <RetryButton />
      </p>
    );
  }
}
