import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiRow } from "./kpi-row";

const cell = (change: number | null | undefined) => ({
  label: "Pageviews",
  value: "1,234",
  change,
  testId: "kpi-pageviews",
});

describe("KpiRow", () => {
  it("shows the value and the change line when compare is on", () => {
    const { container } = render(<KpiRow cols={{ base: 2 }} cells={[cell(13.3)]} />);
    expect(screen.getByTestId("kpi-pageviews")).toHaveTextContent("1,234");
    expect(container).toHaveTextContent("up 13 % vs previous period");
  });

  it("keeps an empty change line when compare is off, 'new' when there is nothing to compare with", () => {
    const { container, rerender } = render(<KpiRow cols={{ base: 2 }} cells={[cell(undefined)]} />);
    expect(container).not.toHaveTextContent("vs previous period");
    expect(container.querySelector('[aria-hidden="true"].h-4')).not.toBeNull();
    rerender(<KpiRow cols={{ base: 2 }} cells={[cell(null)]} />);
    expect(container).toHaveTextContent("new vs previous period");
  });

  it("a single cell has no lines; every line stays on one row", () => {
    const { container } = render(<KpiRow cols={{ base: 1 }} cells={[cell(5)]} />);
    const c = container.firstElementChild?.firstElementChild;
    const t = (c?.className ?? "").split(" ");
    expect(t).not.toContain("border-l");
    expect(t).not.toContain("border-t");
    for (const line of Array.from(c?.children ?? [])) {
      expect(line.className.split(" ")).toEqual(expect.arrayContaining(["truncate", "whitespace-nowrap"]));
    }
  });
});
