import { render, screen } from "@testing-library/react";
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
});
