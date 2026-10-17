import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Change } from "./change";

describe("Change", () => {
  it("shows an arrow, sr-only direction and the percent", () => {
    const { container } = render(<Change pct={12.4} />);
    expect(container).toHaveTextContent("up 12 %");
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1);
    expect(container.querySelector(".sr-only")).toHaveTextContent("up");
  });

  it("down for a fall", () => {
    const { container } = render(<Change pct={-26} />);
    expect(container).toHaveTextContent("down 26 %");
  });

  it("no arrow for 'new' and 0 %", () => {
    const { container, rerender } = render(<Change pct={null} />);
    expect(container).toHaveTextContent("new");
    expect(container.querySelector("svg")).toBeNull();
    rerender(<Change pct={0} />);
    expect(container).toHaveTextContent("0 %");
    expect(container.querySelector("svg")).toBeNull();
  });
});
