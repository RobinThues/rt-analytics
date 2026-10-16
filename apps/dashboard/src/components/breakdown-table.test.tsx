import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BreakdownTable } from "./breakdown-table";

const rows = [
  { label: "/b", isOther: false, pageviews: 20, visitorsPerDay: 1, pageviewsChange: 100 },
  { label: "Other", isOther: true, pageviews: 1, visitorsPerDay: 0.3, pageviewsChange: null },
];

describe("BreakdownTable", () => {
  it("renders rows, Other last and the change column only with compare", () => {
    const { rerender } = render(<BreakdownTable rows={rows} valueLabel="Page" compare testId="t" />);
    expect(screen.getAllByRole("row").at(-1)).toHaveTextContent("Other");
    expect(screen.getByText("+100 %")).toBeInTheDocument();
    rerender(<BreakdownTable rows={rows} valueLabel="Page" compare={false} testId="t" />);
    expect(screen.queryByText("+100 %")).toBeNull();
  });
  it("empty table says so", () => {
    render(<BreakdownTable rows={[]} valueLabel="Page" compare testId="t" />);
    expect(screen.getByText("No data in this range.")).toBeInTheDocument();
  });
});
