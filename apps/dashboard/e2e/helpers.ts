import type { Page } from "@playwright/test";

/**
 * Delays navigation RSC requests (not prefetches) by `ms`, so tests can look at the pending state.
 * Call `page.waitForLoadState("networkidle")` first so prefetches are done.
 */
export async function slowRsc(page: Page, ms: number): Promise<void> {
  await page.route("**/*", async (route) => {
    const h = route.request().headers();
    if (h["rsc"] && !h["next-router-prefetch"] && !h["next-router-segment-prefetch"]) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    await route.continue();
  });
}
