import { beforeEach, describe, expect, it } from "vitest";
import { themeScript } from "./script";

const html = document.documentElement;
const run = () => new Function(themeScript)();

beforeEach(() => {
  document.cookie = "rta-theme=; path=/; max-age=0";
  html.className = "";
  html.removeAttribute("data-theme-choice");
});

describe("themeScript", () => {
  it("without a cookie follows the system", () => {
    run();
    expect(html.getAttribute("data-theme-choice")).toBe("system");
    expect(html.classList.contains("dark")).toBe(false);
    expect(html.classList.contains("light")).toBe(false);
  });

  it("applies a dark or light choice", () => {
    document.cookie = "rta-theme=dark; path=/";
    run();
    expect(html.classList.contains("dark")).toBe(true);
    expect(html.getAttribute("data-theme-choice")).toBe("dark");

    html.className = "";
    document.cookie = "rta-theme=light; path=/";
    run();
    expect(html.classList.contains("light")).toBe(true);
    expect(html.getAttribute("data-theme-choice")).toBe("light");
  });

  it("treats an empty or unknown value as system without throwing", () => {
    for (const value of ["", "blue"]) {
      html.className = "";
      document.cookie = `rta-theme=${value}; path=/`;
      expect(run).not.toThrow();
      expect(html.getAttribute("data-theme-choice")).toBe("system");
      expect(html.className).toBe("");
    }
  });

  it("keeps the classes <html> already has", () => {
    html.className = "h-full antialiased";
    document.cookie = "rta-theme=dark; path=/";
    run();
    expect(html.className.split(" ")).toEqual(expect.arrayContaining(["h-full", "antialiased", "dark"]));
  });
});
