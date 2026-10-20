// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The visual style spec ("Color tokens", "Dark mode") pins how globals.css is built; these checks keep
// later edits from slipping back to a second dark block or derived radii.
const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

const TOKENS = [
  "background",
  "card",
  "popover",
  "foreground",
  "card-foreground",
  "popover-foreground",
  "muted",
  "muted-foreground",
  "secondary",
  "secondary-foreground",
  "accent",
  "accent-foreground",
  "border",
  "input",
  "ring",
  "primary",
  "primary-foreground",
  "destructive",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
  "row-line",
  "chart-current",
  "chart-previous",
  "chart-bar",
  "chart-area",
];

describe("globals.css", () => {
  it("defines every color token once with light-dark()", () => {
    for (const t of TOKENS) {
      const matches = css.match(new RegExp(`--${t}: light-dark\\(`, "g")) ?? [];
      expect(matches, t).toHaveLength(1);
    }
  });

  it("has no dark token block", () => {
    expect(css).not.toMatch(/^\.dark\s*\{/m);
  });

  it("pins the radius scale", () => {
    for (const r of ["--radius-sm: 2px", "--radius-md: 4px", "--radius-lg: 4px", "--radius-xl: 6px"]) {
      expect(css).toContain(r);
    }
  });

  it("dark variant covers class and system", () => {
    const variant = css.slice(css.indexOf("@custom-variant dark"), css.indexOf("@theme"));
    expect(variant).toContain(".dark");
    expect(variant).toContain("prefers-color-scheme: dark");
    expect(variant).toContain(":root:not(.light)");
  });

  it("sets color-scheme per class", () => {
    expect(css).toContain("color-scheme: light dark");
    expect(css).toMatch(/:root\.light\s*\{\s*color-scheme: light;?\s*\}/);
    expect(css).toMatch(/:root\.dark\s*\{\s*color-scheme: dark;?\s*\}/);
  });

  it("native select lists use the popover colors", () => {
    expect(css).toMatch(/option,\s*optgroup\s*\{\s*@apply bg-popover text-popover-foreground;\s*\}/);
  });

  it("brand and data values", () => {
    for (const v of [
      "oklch(0.52 0.2 300)",
      "oklch(0.74 0.15 300)",
      "#2a78d6",
      "#3987e5",
      "#8f8e88",
      "--text-sm: 13px",
    ]) {
      expect(css).toContain(v);
    }
  });
});
