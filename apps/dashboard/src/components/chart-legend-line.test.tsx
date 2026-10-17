import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartLegendLine } from "./chart-legend-line";

describe("ChartLegendLine", () => {
  it("only 'This period' without compare, at the same height", () => {
    const { container } = render(<ChartLegendLine compare={false} />);
    expect(container).toHaveTextContent("This period");
    expect(container).not.toHaveTextContent("Previous period");
    expect((container.firstElementChild?.className ?? "").split(" ")).toContain("h-5");
  });

  it("both periods with compare, the previous one dashed", () => {
    const { container } = render(<ChartLegendLine compare />);
    expect(container).toHaveTextContent("This period");
    expect(container).toHaveTextContent("Previous period");
    expect(container.querySelector("[stroke-dasharray]")).not.toBeNull();
  });
});
