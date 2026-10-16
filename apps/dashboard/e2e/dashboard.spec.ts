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

test("funnels: build, save, reopen and delete", async ({ page }) => {
  const name = `e2e ${Date.now()}`;
  await page.goto("/demo/funnels");
  await page.getByLabel("Step 1 event").selectOption("place_selected");
  await page.getByLabel("Step 2 event").selectOption("subscribe_click");
  await page.getByRole("button", { name: "Show funnel" }).click();
  await expect(page).toHaveURL(/steps=place_selected&steps=subscribe_click/);
  await expect(page.getByTestId("funnel-sessions-1")).not.toHaveText("0");
  await page.getByLabel("Funnel name").fill(name);
  await page.getByRole("button", { name: "Save funnel" }).click();
  // Saving is a BigQuery MERGE (DML), which often takes several seconds.
  await expect(page).toHaveURL(/funnel=[0-9a-f-]{36}/, { timeout: 30_000 });
  await page.goto("/demo/funnels");
  await page.getByRole("link", { name }).click();
  await expect(page.getByTestId("funnel-step-2")).toBeVisible();
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await expect(page.getByRole("link", { name })).toHaveCount(0, { timeout: 30_000 });
});

test("funnels: a stale saved funnel id and broken steps do not break the page", async ({ page }) => {
  await page.goto("/demo/funnels?funnel=00000000-0000-0000-0000-000000000000&steps=bad%20name");
  await expect(page.getByText("This saved funnel does not exist any more.")).toBeVisible();
  await expect(page.getByText("Choose 2 to 5 steps and press Show funnel.")).toBeVisible();
});

test("explorer: switching events resets the controls", async ({ page }) => {
  await page.goto("/demo/events?event=place_selected&metric=visitors&filter=source%3Asearch");
  await expect(page.getByLabel("Metric")).toHaveValue("visitors");
  // A typed, not yet applied value must not carry over to the next event.
  await page.getByLabel("Value", { exact: true }).fill("typed");
  await page.getByTestId("event-list").getByRole("link", { name: "subscribe_click" }).click();
  await expect(page).toHaveURL(/event=subscribe_click/);
  await expect(page.getByLabel("Metric")).toHaveValue("events");
  await expect(page.getByLabel("Value", { exact: true })).toHaveValue("");
});

test("a hand-edited error code does not break a page", async ({ page }) => {
  await page.goto("/demo/funnels?error=__proto__");
  await expect(page.getByText("Something went wrong.")).toBeVisible();
  await page.goto("/demo/settings?error=constructor");
  await expect(page.getByText("Something went wrong.")).toBeVisible();
});

test("funnels: one stale step keeps the other steps in the editor", async ({ page }) => {
  await page.goto("/demo/funnels?steps=place_selected&steps=gone_event&steps=subscribe_click");
  await expect(page.getByText("Some steps are not available any more and were left out.")).toBeVisible();
  await expect(page.getByLabel("Step 1 event")).toHaveValue("place_selected");
  await expect(page.getByLabel("Step 2 event")).toHaveValue("subscribe_click");
});

test("funnels: the result fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo/funnels?steps=place_selected&steps=subscribe_click");
  const table = page.getByTestId("funnel-result");
  await expect(page.getByTestId("funnel-sessions-1")).toBeVisible();
  const { scroll, client } = await table.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(scroll).toBeLessThanOrEqual(client);
});

test("explorer: a chosen filter key offers its values before Apply", async ({ page }) => {
  await page.goto("/demo/events?event=calendar_poll");
  await page.getByLabel("Filter by").selectOption("kind");
  const listId = await page.getByLabel("Value", { exact: true }).getAttribute("list");
  await expect(page.locator(`datalist[id="${listId}"] option[value="token"]`)).toHaveCount(1);
});
