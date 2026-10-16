import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppSwitcher } from "./app-switcher";

vi.mock("next/navigation", () => ({
  usePathname: () => "/demo/events",
  useSearchParams: () => new URLSearchParams("from=a&to=b&event=x"),
}));

describe("AppSwitcher", () => {
  it("filters the apps and links to the same page with the range", async () => {
    render(<AppSwitcher appId="demo" apps={["demo", "wetter-in-kalender"]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Switch app" }));
    await user.type(await screen.findByLabelText("Filter apps"), "kal");
    expect(screen.queryByRole("link", { name: "demo" })).toBeNull();
    expect(screen.getByRole("link", { name: "wetter-in-kalender" })).toHaveAttribute(
      "href",
      "/wetter-in-kalender/events?from=a&to=b",
    );
  });
});
