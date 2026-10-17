import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Mark, Wordmark } from "./mark";

describe("Mark and Wordmark", () => {
  it("the wordmark is the mark plus rt-analytics", () => {
    const { container } = render(<Wordmark />);
    expect(container).toHaveTextContent("rt-analytics");
    const svg = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(svg).toHaveLength(1);
    expect(svg[0]?.querySelectorAll("rect")).toHaveLength(3);
  });

  it("the mark alone has no text", () => {
    const { container } = render(<Mark />);
    expect(container.textContent).toBe("");
  });
});
