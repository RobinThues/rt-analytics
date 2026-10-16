import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const res = await page.request.post("/api/auth/test-login", {
    headers: { "x-test-login-secret": process.env.DASHBOARD_TEST_LOGIN_SECRET ?? "" },
    data: { email: (process.env.DASHBOARD_ALLOWED_EMAILS ?? "").split(",")[0] },
  });
  expect(res.ok()).toBe(true);
});

test("app picker lists the demo app and the overview shows data", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "demo", exact: true }).click();
  await expect(page).toHaveURL(/\/demo/);
  await expect(page.getByTestId("kpi-pageviews")).toBeVisible();
  await expect(page.getByTestId("kpi-pageviews")).not.toHaveText("0");
  await expect(page.getByTestId("breakdown-page").getByRole("row")).not.toHaveCount(1);
  await expect(page.getByText("Could not load this panel.")).toHaveCount(0);
});

test("date range and compare stay in the URL", async ({ page }) => {
  await page.goto("/demo");
  await page.getByLabel("From", { exact: true }).fill("2026-09-01");
  await page.getByLabel("To", { exact: true }).fill("2026-09-07");
  await page.getByLabel("Compare").uncheck();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/from=2026-09-01&to=2026-09-07&compare=0/);
  await expect(page.getByLabel("From", { exact: true })).toHaveValue("2026-09-01");
});

test("Live toggle and Refresh", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Turn Live on" }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Turn Live off" }).click();
  await expect(page.getByText("Live", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByTestId("kpi-pageviews")).toBeVisible();
});

test("settings: save and read back the timezone", async ({ page }) => {
  await page.goto("/demo/settings");
  await page.getByLabel("Timezone").selectOption("Europe/Vienna");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Timezone")).toHaveValue("Europe/Vienna");
  await page.getByLabel("Timezone").selectOption("Europe/Berlin");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
});

test("unauthenticated visitors go to sign-in", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("http://localhost:3300/demo");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("explorer: distinct subscriptions per day with a filter", async ({ page }) => {
  await page.goto("/demo/events");
  await page.getByTestId("event-list").getByRole("link", { name: "calendar_poll" }).click();
  await expect(page).toHaveURL(/event=calendar_poll/);
  await page.getByLabel("Metric").selectOption("distinct:subscription");
  await page.getByLabel("Filter by").selectOption("kind");
  await page.getByLabel("Value", { exact: true }).fill("token");
  await page.getByRole("button", { name: "Apply" }).last().click();
  await expect(page).toHaveURL(/metric=distinct%3Asubscription/);
  await expect(page).toHaveURL(/filter=kind%3Atoken/);
  await expect(page.getByTestId("explorer-total")).not.toHaveText(/^0(\.0)?$/);
  await expect(page.getByText("Could not load this panel.")).toHaveCount(0);
});

test("explorer: unknown event in the URL shows the list, no error", async ({ page }) => {
  await page.goto("/demo/events?event=gone_event&filter=x:y");
  await expect(page.getByText("Pick an event on the left.")).toBeVisible();
  await expect(page.getByTestId("event-list")).toBeVisible();
});
