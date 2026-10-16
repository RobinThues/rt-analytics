import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PendingLink } from "./pending-link";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("PendingLink", () => {
  beforeEach(() => push.mockClear());

  it("a plain click navigates in place", async () => {
    render(<PendingLink href="/demo/events?event=a">a</PendingLink>);
    await userEvent.setup().click(screen.getByRole("link", { name: "a" }));
    expect(push).toHaveBeenCalledWith("/demo/events?event=a", { scroll: false });
  });

  it("modified, middle and target clicks are left to the browser", () => {
    render(
      <>
        <PendingLink href="/x">x</PendingLink>
        <PendingLink href="/y" target="_blank">
          y
        </PendingLink>
      </>,
    );
    const x = screen.getByRole("link", { name: "x" });
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])
      fireEvent.click(x, mod);
    fireEvent.click(screen.getByRole("link", { name: "y" }));
    expect(push).not.toHaveBeenCalled();
  });
});
