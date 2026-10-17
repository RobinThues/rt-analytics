import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BreakdownTable } from "./breakdown-table";

const rows = [
  { label: "/b", isOther: false, pageviews: 20, visitorsPerDay: 1, pageviewsChange: 100 },
  { label: "Other", isOther: true, pageviews: 1, visitorsPerDay: 0.3, pageviewsChange: null },
];

describe("BreakdownTable", () => {
  it("draws row bars relative to the top row, none for Other", () => {
    render(<BreakdownTable rows={rows} valueLabel="Page" compare testId="t" />);
    const bars = screen.getAllByTestId("row-bar");
    expect(bars).toHaveLength(1);
    expect(bars[0]).toHaveStyle({ width: "100.0%" });
  });
  it("renders rows, Other last and the change column only with compare", () => {
    const { rerender } = render(<BreakdownTable rows={rows} valueLabel="Page" compare testId="t" />);
    expect(screen.getAllByRole("row").at(-1)).toHaveTextContent("Other");
    expect(screen.getByTestId("t")).toHaveTextContent("up 100 %");
    rerender(<BreakdownTable rows={rows} valueLabel="Page" compare={false} testId="t" />);
    expect(screen.getByTestId("t")).not.toHaveTextContent("100 %");
  });
  it("empty table says so", () => {
    render(<BreakdownTable rows={[]} valueLabel="Page" compare testId="t" />);
    expect(screen.getByText("No data in this range.")).toBeInTheDocument();
  });
});
