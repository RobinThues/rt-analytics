import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Panel } from "./panel";

describe("Panel", () => {
  it("names itself with data-panel and uses a 13 px semibold title", () => {
    const { container } = render(
      <Panel title="Summary">
        <p>body</p>
      </Panel>,
    );
    expect(container.querySelector('[data-panel="Summary"]')).not.toBeNull();
    const title = screen.getByRole("heading", { name: "Summary" }).parentElement;
    expect((title?.className ?? "").split(" ")).toEqual(expect.arrayContaining(["text-sm", "font-semibold"]));
  });
});
