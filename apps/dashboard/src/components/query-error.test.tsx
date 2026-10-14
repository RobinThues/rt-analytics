import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryError } from "./query-error";

describe("QueryError", () => {
  it("explains the byte cap with the configured limit", () => {
    render(<QueryError result={{ ok: false, error: "bytes-cap", message: "x" }} maxBytes={1_000_000_000} />);
    expect(screen.getByText("This query would scan more than 1 GB. Choose a shorter date range.")).toBeInTheDocument();
  });
  it("shows a short message and a retry button for other failures", () => {
    render(<QueryError result={{ ok: false, error: "failed", message: "boom" }} maxBytes={1} />);
    expect(screen.getByText("Could not load this panel.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
