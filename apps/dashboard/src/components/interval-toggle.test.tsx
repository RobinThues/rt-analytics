import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntervalToggle } from "./interval-toggle";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("IntervalToggle", () => {
  beforeEach(() => {
    push.mockClear();
    window.history.replaceState(null, "", "/demo/events?from=a&to=b&event=x");
  });

  it("marks the interval in use and switches to hourly, keeping the other parameters", async () => {
    render(<IntervalToggle interval="day" hourlyAllowed={true} />);
    expect(screen.getByRole("group", { name: "Chart interval" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Daily" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Hourly" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.setup().click(screen.getByRole("button", { name: "Hourly" }));
    expect(push).toHaveBeenCalledWith("/demo/events?from=a&to=b&interval=hour&event=x", { scroll: false });
  });

  it("switching back writes interval=day (a one-day range is hourly by default)", async () => {
    window.history.replaceState(null, "", "/demo?from=a&to=a");
    render(<IntervalToggle interval="hour" hourlyAllowed={true} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Daily" }));
    expect(push).toHaveBeenCalledWith("/demo?from=a&to=a&interval=day", { scroll: false });
  });

  it("the interval in use does nothing when clicked", async () => {
    render(<IntervalToggle interval="day" hourlyAllowed={true} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Daily" }));
    expect(push).not.toHaveBeenCalled();
  });

  it("hourly is unavailable for long ranges and says why", async () => {
    render(<IntervalToggle interval="day" hourlyAllowed={false} />);
    const hourly = screen.getByRole("button", { name: "Hourly" });
    expect(hourly).toHaveAttribute("aria-disabled", "true");
    expect(hourly).toHaveAttribute("title", "Hourly charts work for ranges up to 7 days.");
    await userEvent.setup().click(hourly);
    expect(push).not.toHaveBeenCalled();
  });
});
