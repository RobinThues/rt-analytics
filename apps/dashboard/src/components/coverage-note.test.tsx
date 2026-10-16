import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoverageNote } from "./coverage-note";

describe("CoverageNote", () => {
  it("coverage share and the zero case", () => {
    const { rerender } = render(<CoverageNote coverage={0.14} />);
    expect(screen.getByText(/Based on 14 % of sessions/)).toBeInTheDocument();
    rerender(<CoverageNote coverage={0} />);
    expect(screen.getByText(/all cookieless/)).toBeInTheDocument();
  });
});
