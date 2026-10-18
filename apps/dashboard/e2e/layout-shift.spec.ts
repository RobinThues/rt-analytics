import { expect, test, type Page } from "@playwright/test";
import { slowRsc, testLogin } from "./helpers";

// Visual style spec, anti-goals: a fixed-shape panel's skeleton has the height of its loaded content
// (within 4 px). Table panels have a variable row count, so for them one skeleton row is compared with one
// loaded row. The card content is measured, not the card: grid rows stretch a card to its table neighbour.
const PANELS = ["Summary", "Over time", "Web vitals", "Errors over time"];

const contentHeight = (page: Page, panel: string) =>
  page
    .locator(`[data-panel="${panel}"] [data-slot="card-content"]`)
    .evaluate((el) => el.getBoundingClientRect().height);

const height = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);

/** Opens page `to` from page `from` with a delayed page switch, so the skeletons stay up for a while. */
async function openSlowly(page: Page, width: number, from: string, to: "Overview" | "Events") {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(from);
  await page.waitForLoadState("networkidle");
  await slowRsc(page, 2500);
  if (width < 768) await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: to }).click();
}

// The overview's breakdown tables have text rows; the explorer's event list has a sparkline in each row.
const TABLES = [
  { from: "/demo/events", to: "Overview", panel: "Top pages" },
  { from: "/demo", to: "Events", panel: "Events" },
] as const;

test.beforeEach(async ({ page }) => {
  await testLogin(page);
});

for (const width of [1440, 390]) {
  test(`overview skeletons keep the panel heights at ${width} px`, async ({ page }) => {
    await openSlowly(page, width, "/demo/events", "Overview");

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

  for (const { from, to, panel } of TABLES) {
    test(`${panel}: table skeleton rows have the loaded row height at ${width} px`, async ({ page }) => {
      await openSlowly(page, width, from, to);
      const skeletonRow = `[data-panel="${panel}"] [data-testid="skeleton"] > :nth-child(2)`;
      await expect(page.locator(skeletonRow)).toBeVisible({ timeout: 10_000 });
      const before = await height(page, skeletonRow);
      await expect(page.getByTestId("skeleton")).toHaveCount(0, { timeout: 20_000 });
      const after = await height(page, `[data-panel="${panel}"] tbody tr`);
      expect(Math.abs(after - before), `skeleton row ${before} px, loaded row ${after} px`).toBeLessThanOrEqual(1);
    });
  }
}
