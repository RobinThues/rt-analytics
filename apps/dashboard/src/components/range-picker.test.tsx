import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RangePicker } from "./range-picker";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const range = { from: "2026-09-19", to: "2026-10-16" };

function open() {
  render(<RangePicker range={range} today="2026-10-16" label="19 Sept – 16 Oct 2026" />);
  const user = userEvent.setup();
  return { user, opened: user.click(screen.getByRole("button", { name: "Date range" })) };
}

describe("RangePicker", () => {
  beforeEach(() => {
    push.mockClear();
    window.history.replaceState(null, "", "/demo/events?from=2026-09-19&to=2026-10-16&event=x");
  });

  it("shows the label on the trigger", () => {
    render(<RangePicker range={range} today="2026-10-16" label="19 Sept – 16 Oct 2026" />);
    expect(screen.getByRole("button", { name: "Date range" })).toHaveTextContent("19 Sept – 16 Oct 2026");
  });

  it("a preset applies at once and keeps the other parameters", async () => {
    const { user, opened } = open();
    await opened;
    await user.click(await screen.findByRole("button", { name: "Last 7 days" }));
    expect(push).toHaveBeenCalledWith("/demo/events?from=2026-10-10&to=2026-10-16&event=x", { scroll: false });
  });

  it("the calendar applies only after the second day, even with a range already set", async () => {
    const { user, opened } = open();
    await opened;
    await user.click(await screen.findByRole("button", { name: /October 1st, 2026/ }));
    expect(push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /October 5th, 2026/ }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/demo/events?from=2026-10-01&to=2026-10-05&event=x", { scroll: false });
  });

  it("a second day before the first swaps them", async () => {
    const { user, opened } = open();
    await opened;
    await user.click(await screen.findByRole("button", { name: /October 9th, 2026/ }));
    await user.click(screen.getByRole("button", { name: /October 2nd, 2026/ }));
    expect(push).toHaveBeenCalledWith("/demo/events?from=2026-10-02&to=2026-10-09&event=x", { scroll: false });
  });

  it("marks the preset that matches the range", async () => {
    const { opened } = open();
    await opened;
    expect(await screen.findByRole("button", { name: "Last 28 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Last 7 days" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Last 90 days" })).toHaveAttribute("aria-pressed", "false");
  });

  it("no preset is marked for a custom range", async () => {
    render(<RangePicker range={{ from: "2026-10-01", to: "2026-10-05" }} today="2026-10-16" label="1 – 5 Oct 2026" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Date range" }));
    for (const name of ["Last 7 days", "Last 28 days", "Last 90 days"]) {
      expect(await screen.findByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("shows the current range, then only the clicked first day", async () => {
    const { user, opened } = open();
    await opened;
    expect(await screen.findByRole("button", { name: /October 16th, 2026/ })).toHaveAttribute("data-range-end", "true");
    await user.click(screen.getByRole("button", { name: /October 1st, 2026/ }));
    const picked = document.querySelectorAll('[data-range-start="true"], [data-selected-single="true"]');
    expect(picked).toHaveLength(1);
    expect(picked[0]?.getAttribute("aria-label") ?? picked[0]?.textContent).toMatch(/October 1st, 2026|^1$/);
    expect(document.querySelectorAll('[data-range-middle="true"], [data-range-end="true"]')).toHaveLength(0);
  });

  it("days after today cannot be picked", async () => {
    const { opened } = open();
    await opened;
    expect(await screen.findByRole("button", { name: /October 17th, 2026/ })).toBeDisabled();
  });
});
