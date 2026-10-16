import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompareToggle } from "./compare-toggle";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("CompareToggle", () => {
  beforeEach(() => {
    push.mockClear();
    window.history.replaceState(null, "", "/demo/funnels?from=a&to=b&steps=s1&steps=s2");
  });

  it("unchecking navigates with compare=0 and keeps the other parameters", async () => {
    render(<CompareToggle compare={true} />);
    const box = screen.getByRole("checkbox", { name: "Compare" });
    expect(box).toBeChecked();
    await userEvent.setup().click(box);
    expect(push).toHaveBeenCalledWith("/demo/funnels?from=a&to=b&compare=0&steps=s1&steps=s2", { scroll: false });
  });

  it("checking removes compare=0", async () => {
    window.history.replaceState(null, "", "/demo?from=a&to=b&compare=0");
    render(<CompareToggle compare={false} />);
    await userEvent.setup().click(screen.getByRole("checkbox", { name: "Compare" }));
    expect(push).toHaveBeenCalledWith("/demo?from=a&to=b", { scroll: false });
  });
});
