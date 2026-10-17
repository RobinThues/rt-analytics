import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./card";

describe("Card", () => {
  it("is a bordered 6 px panel with its default 16 px spacing", () => {
    const { container } = render(<Card />);
    const tokens = (container.firstElementChild?.className ?? "").split(" ");
    expect(tokens).toEqual(
      expect.arrayContaining(["border", "border-border", "rounded-xl", "[--card-spacing:--spacing(4)]"]),
    );
    expect(tokens).not.toContain("ring-1");
  });
});
