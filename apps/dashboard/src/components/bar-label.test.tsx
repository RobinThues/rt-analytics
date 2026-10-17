import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarLabel, rowBarWidth } from "./bar-label";

describe("rowBarWidth", () => {
  it("is the share of the top row, capped at 100 %", () => {
    expect(rowBarWidth(50, 200)).toBe("25.0%");
    expect(rowBarWidth(200, 200)).toBe("100.0%");
    expect(rowBarWidth(300, 200)).toBe("100.0%");
  });
  it("no bar when the top row is 0", () => {
    expect(rowBarWidth(5, 0)).toBeNull();
  });
});

describe("BarLabel", () => {
  it("draws the bar behind a truncated label", () => {
    render(<BarLabel width="25.0%">/a-very-long-path</BarLabel>);
    expect(screen.getByTestId("row-bar")).toHaveStyle({ width: "25.0%" });
    expect(screen.getByText("/a-very-long-path").className.split(" ")).toContain("truncate");
  });
  it("no bar without a width", () => {
    render(<BarLabel width={null}>Other</BarLabel>);
    expect(screen.queryByTestId("row-bar")).toBeNull();
  });
});
