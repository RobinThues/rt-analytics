import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiTile } from "./kpi-tile";

describe("KpiTile", () => {
  it("shows the change when compare is on", () => {
    render(<KpiTile label="Pageviews" value="1,234" change={12.4} testId="kpi-pageviews" />);
    expect(screen.getByTestId("kpi-pageviews")).toHaveTextContent("1,234");
    expect(screen.getByTestId("kpi-pageviews").parentElement).toHaveTextContent("up 12 %");
  });
  it("shows 'new' when the previous period was 0 and nothing when compare is off", () => {
    const { rerender } = render(<KpiTile label="Errors" value="3" change={null} testId="k" />);
    expect(screen.getByText("new")).toBeInTheDocument();
    rerender(<KpiTile label="Errors" value="3" change={undefined} testId="k" />);
    expect(screen.queryByText("new")).toBeNull();
  });
});
