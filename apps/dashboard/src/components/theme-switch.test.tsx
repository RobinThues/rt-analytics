import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeSwitch } from "./theme-switch";

const html = document.documentElement;

beforeEach(() => {
  document.cookie = "rta-theme=; path=/; max-age=0";
  html.className = "";
  html.setAttribute("data-theme-choice", "system");
});

describe("ThemeSwitch", () => {
  it("offers System, Light and Dark in a Theme group", () => {
    render(<ThemeSwitch />);
    const group = screen.getByRole("group", { name: "Theme" });
    for (const name of ["System", "Light", "Dark"]) {
      expect(within(group).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("Dark writes the cookie and sets the class; System clears it", async () => {
    render(<ThemeSwitch />);
    await userEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.cookie).toContain("rta-theme=dark");
    expect(html.classList.contains("dark")).toBe(true);
    expect(html.getAttribute("data-theme-choice")).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "System" }));
    expect(html.classList.contains("dark")).toBe(false);
    expect(html.classList.contains("light")).toBe(false);
    expect(html.getAttribute("data-theme-choice")).toBe("system");
  });

  it("two switches stay in sync", async () => {
    render(
      <>
        <div data-testid="a">
          <ThemeSwitch />
        </div>
        <div data-testid="b">
          <ThemeSwitch />
        </div>
      </>,
    );
    await userEvent.click(within(screen.getByTestId("a")).getByRole("button", { name: "Light" }));
    for (const id of ["a", "b"]) {
      expect(within(screen.getByTestId(id)).getByRole("button", { name: "Light" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
  });
});
