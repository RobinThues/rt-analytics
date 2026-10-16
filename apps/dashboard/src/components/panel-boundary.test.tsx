import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import { Component, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PanelBoundary } from "./panel-boundary";

describe("PanelBoundary", () => {
  it("a throwing child shows the panel message instead of breaking the page", () => {
    const Boom = () => {
      throw new Error("x");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <div>
        <PanelBoundary>
          <Boom />
        </PanelBoundary>
        <p>sibling</p>
      </div>,
    );
    expect(screen.getByText("Could not load this panel.")).toBeInTheDocument();
    expect(screen.getByText("sibling")).toBeInTheDocument();
  });

  it("hands Next.js redirects up to Next instead of showing the panel message", () => {
    const Redirecting = () => redirect("/demo/settings?saved=1");
    let caught: unknown = null;
    class Outer extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() {
        return { failed: true };
      }
      componentDidCatch(error: unknown) {
        caught = error;
      }
      render() {
        return this.state.failed ? <p>outer</p> : this.props.children;
      }
    }
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <Outer>
        <PanelBoundary>
          <Redirecting />
        </PanelBoundary>
      </Outer>,
    );
    expect(screen.queryByText("Could not load this panel.")).toBeNull();
    expect(screen.getByText("outer")).toBeInTheDocument();
    expect(String((caught as { digest?: string } | null)?.digest)).toMatch(/^NEXT_REDIRECT/);
  });
});
