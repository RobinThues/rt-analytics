import { expect, type Page } from "@playwright/test";

/**
 * Signs in through the test-login endpoint, then sets the rta-theme cookie when asked. The cookie comes
 * after the login: Better Auth refuses a cookie-carrying request that has no Origin header.
 */
export async function testLogin(page: Page, theme?: "light" | "dark"): Promise<void> {
  const res = await page.request.post("/api/auth/test-login", {
    headers: { "x-test-login-secret": process.env.DASHBOARD_TEST_LOGIN_SECRET ?? "" },
    data: { email: (process.env.DASHBOARD_ALLOWED_EMAILS ?? "").split(",")[0] },
  });
  expect(res.ok()).toBe(true);
  if (theme) await setTheme(page, theme);
}

/** The theme cookie the head script reads; playwright.config.ts puts the server URL in BETTER_AUTH_URL. */
export async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  const url = process.env.BETTER_AUTH_URL ?? "http://localhost:3300";
  await page.context().addCookies([{ name: "rta-theme", value: theme, url }]);
}

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
