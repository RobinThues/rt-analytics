import { expect, test, type Page } from "@playwright/test";
import { slowRsc, testLogin } from "./helpers";

// Visual style spec, anti-goals: a fixed-shape panel's skeleton has the height of its loaded content
// (within 4 px). Table panels have a variable row count and are not checked. The card content is
// measured, not the card: grid rows stretch a card to its table neighbour.
const PANELS = ["Summary", "Over time", "Web vitals", "Errors over time"];

const contentHeight = (page: Page, panel: string) =>
  page
    .locator(`[data-panel="${panel}"] [data-slot="card-content"]`)
    .evaluate((el) => el.getBoundingClientRect().height);

test.beforeEach(async ({ page }) => {
  await testLogin(page);
});

for (const width of [1440, 390]) {
  test(`overview skeletons keep the panel heights at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/demo/events");
    await page.waitForLoadState("networkidle");
    await slowRsc(page, 2500);
    if (width < 768) await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Overview" }).click();

    const before: Record<string, number> = {};
    for (const p of PANELS) {
      await expect(page.locator(`[data-panel="${p}"] [data-testid="skeleton"]`)).toBeVisible({ timeout: 10_000 });
      before[p] = await contentHeight(page, p);
    }
    await expect(page.getByTestId("skeleton")).toHaveCount(0, { timeout: 20_000 });
    const offenders = [];
    for (const p of PANELS) {
      const after = await contentHeight(page, p);
      if (Math.abs(after - (before[p] ?? 0)) > 4) offenders.push(`${p}: ${before[p]} -> ${after}`);
    }
    expect(offenders).toEqual([]);
  });
}
