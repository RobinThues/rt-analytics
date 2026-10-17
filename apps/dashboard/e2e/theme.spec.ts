import { expect, test, type Page } from "@playwright/test";
import { setTheme, testLogin } from "./helpers";

// Visual style spec, "Dark mode". Tests that need no data use /sign-in, which runs no query.

/** Blocks every JS chunk (CSS chunks share the folder and stay), so only the inline head script runs. */
const blockScripts = (page: Page) =>
  page.route("**/_next/static/chunks/**", (route) =>
    route.request().resourceType() === "script" ? route.abort() : route.continue(),
  );

test("head script sets the theme before any JS", async ({ page }) => {
  await setTheme(page, "dark");
  await blockScripts(page);
  await page.goto("/sign-in");
  const html = page.locator("html");
  await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
  await expect(html).toHaveAttribute("data-theme-choice", "dark");
});

test("system follows the OS without JS", async ({ page }) => {
  await blockScripts(page);
  const background = async (colorScheme: "light" | "dark") => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/sign-in");
    return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  };
  expect(await background("light")).not.toBe(await background("dark"));
});

test("switch persists across reload", async ({ page }) => {
  await testLogin(page);
  await page.goto("/demo/settings");
  const theme = page.getByRole("group", { name: "Theme" }).first();
  const dark = theme.getByRole("button", { name: "Dark" });
  // aria-pressed only exists after hydration, so the click below is not lost.
  await expect(dark).toHaveAttribute("aria-pressed", "false");
  await dark.click();
  await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
  await expect(dark).toHaveAttribute("aria-pressed", "true");
  await theme.getByRole("button", { name: "System" }).click();
  await expect(page.locator("html")).not.toHaveClass(/(^|\s)(dark|light)(\s|$)/);
});

test("dark overview has no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await testLogin(page, "dark");
  await page.goto("/demo");
  await expect(page.getByTestId("kpi-pageviews")).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});
