import { expect, test, type Page } from "@playwright/test";
import { daysBetween } from "../src/time/range";
import { formatRangeLabel } from "../src/view/range-ui";
import { setTheme, slowRsc } from "./helpers";

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

// A fixed range inside the demo data, so this keeps working however old the demo data gets.
test("overview smoke: every panel shows data from real BigQuery", { tag: "@bq" }, async ({ page }) => {
  await page.goto("/demo?from=2026-09-16&to=2026-10-13");
  await expect(page.getByTestId("kpi-pageviews")).not.toHaveText("0");
  for (const dim of ["page", "entry_page", "source", "utm", "country", "device", "browser", "os"]) {
    await expect(page.getByTestId(`breakdown-${dim}`).getByRole("row"), dim).not.toHaveCount(1);
  }
  await expect(page.getByTestId("vital-lcp")).toBeVisible();
  await expect(page.getByTestId("consent-split")).toBeVisible();
  await expect(page.getByText("Could not load this panel.")).toHaveCount(0);
  // Not getByRole("alert"): Next renders an empty route announcer with that role.
  await expect(page.getByText("The dashboard cannot reach BigQuery")).toHaveCount(0);
});

test("date range and compare stay in the URL", async ({ page }) => {
  await page.goto("/demo/events?event=calendar_poll");
  await page.getByRole("button", { name: "Date range" }).click();
  await page.getByRole("button", { name: "Last 7 days" }).click();
  await expect(page).toHaveURL(/from=.*event=calendar_poll/);
  let url = new URL(page.url());
  expect(daysBetween(url.searchParams.get("from")!, url.searchParams.get("to")!)).toBe(6);
  await page.getByLabel("Compare").uncheck();
  await expect(page).toHaveURL(/compare=0/);
  url = new URL(page.url());
  expect(url.searchParams.get("event")).toBe("calendar_poll");
});

test("Live toggle and Refresh", { tag: "@bq" }, async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Turn Live on" }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Turn Live off" }).click();
  await expect(page.getByText("Live", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByTestId("kpi-pageviews")).toBeVisible();
});

test("settings: save and read back the timezone", { tag: "@bq" }, async ({ page }) => {
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

test("explorer: distinct subscriptions per day with a filter", { tag: "@bq" }, async ({ page }) => {
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

/** Deletes every "e2e <n>" funnel, also ones a failed run left in the real config table. */
async function deleteE2eFunnels(page: Page) {
  await page.goto("/demo/funnels");
  // The list streams in with the editor (one Suspense boundary); count() does not wait.
  await expect(page.getByRole("button", { name: "Show funnel" })).toBeVisible();
  const buttons = page.getByRole("button", { name: /^Delete e2e \d+$/ });
  for (let n = await buttons.count(); n > 0; n--) {
    await buttons.first().click();
    await expect(buttons).toHaveCount(n - 1, { timeout: 30_000 });
  }
}

// Real BigQuery only: saving and deleting are DML writes to the config table, which fixtures do not emulate.
test.describe("saved funnels", { tag: "@bq" }, () => {
  test.afterEach(async ({ page }) => deleteE2eFunnels(page));

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

test("explorer: hovering a sparkline shows the day and the count", async ({ page }) => {
  await page.goto("/demo/events");
  const spark = page.getByTestId("event-list").getByTestId("sparkline").first();
  await spark.hover({ position: { x: 40, y: 12 } });
  await expect(spark.getByRole("tooltip")).toHaveText(/^\d{1,2} \w+: [\d,]+$/);
});

test("explorer: picking another event keeps the old content dimmed", async ({ page }) => {
  await page.goto("/demo/events?event=place_selected");
  await expect(page.getByTestId("explorer-total")).toBeVisible();
  const before = await page.getByTestId("explorer-total").textContent();
  await page.waitForLoadState("networkidle");
  await slowRsc(page, 2000);
  await page.getByTestId("event-list").getByRole("link", { name: "subscribe_click" }).click();
  await expect(page.getByTestId("progress-line")).toBeVisible();
  await expect(page.getByTestId("explorer-total")).toHaveText(before ?? "");
  await expect(page.getByTestId("page-body")).toHaveCSS("opacity", "0.5");
  await expect(page).toHaveURL(/event=subscribe_click/, { timeout: 10_000 });
  await expect(page.getByTestId("progress-line")).toBeHidden();
});

test("overview: page switch shows panel frames with skeletons before data", async ({ page }) => {
  await page.goto("/demo/events");
  await page.waitForLoadState("networkidle");
  await slowRsc(page, 2000);
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
  await expect(page.getByTestId("skeleton").first()).toBeVisible();
  await expect(page.getByText("Loading…")).toHaveCount(0);
  await expect(page.getByTestId("kpi-pageviews")).toBeVisible({ timeout: 15_000 });
});

for (const path of [
  "/demo/events?event=calendar_poll&metric=distinct%3Asubscription",
  "/demo/funnels?steps=place_selected&steps=subscribe_click",
  "/demo/settings",
  "/",
]) {
  test(`hard load of ${path} shows frames, then data, no Loading text`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await expect(page.getByText("Could not load this panel.")).toHaveCount(0);
    await expect(page.getByTestId("skeleton")).toHaveCount(0, { timeout: 15_000 });
  });
}

test("funnels: page switch shows the static frames first", async ({ page }) => {
  await page.goto("/demo");
  await page.waitForLoadState("networkidle");
  await slowRsc(page, 2000);
  await page.getByRole("link", { name: "Funnels" }).click();
  await expect(page.getByRole("heading", { name: "Saved funnels" })).toBeVisible();
  await expect(page.getByTestId("skeleton").first()).toBeVisible();
});

test("quick second preset wins", async ({ page }) => {
  await page.goto("/demo");
  await page.waitForLoadState("networkidle");
  await slowRsc(page, 1500);
  await page.getByRole("button", { name: "Date range" }).click();
  await page.getByRole("button", { name: "Last 7 days" }).click();
  await page.getByRole("button", { name: "Date range" }).click();
  await page.getByRole("button", { name: "Last 90 days" }).click();
  await expect(page.getByTestId("progress-line")).toBeHidden({ timeout: 15_000 });
  const url = new URL(page.url());
  expect(daysBetween(url.searchParams.get("from")!, url.searchParams.get("to")!)).toBe(89);
  await expect(page.getByRole("button", { name: "Date range" })).toHaveText(
    formatRangeLabel({ from: url.searchParams.get("from")!, to: url.searchParams.get("to")! }),
  );
});

test("overview: revisit after a range change never shows old numbers undimmed", async ({ page }) => {
  await page.goto("/demo");
  const kpi = page.locator("[data-testid=kpi-pageviews]:visible");
  const body = page.locator("[data-testid=page-body]:visible");
  await expect(kpi).toBeVisible();
  const old = await kpi.textContent();
  await page.getByRole("link", { name: "Events" }).click(); // client-side, keeps the router state
  // Until the Events page commits, the Overview's own bar (and its picker) is still on screen.
  await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
  await page.getByRole("button", { name: "Date range" }).click();
  await page.getByRole("button", { name: "Last 7 days" }).click();
  await expect(page.getByTestId("progress-line")).toBeHidden({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  await slowRsc(page, 1500);
  await page.getByRole("link", { name: "Overview" }).click();
  for (let t = 0; t < 15; t++) {
    // sample ~1.5 s: the old text may only be visible while dimmed
    if ((await kpi.count()) === 1 && (await kpi.textContent()) === old) {
      expect(await body.evaluate((el) => getComputedStyle(el).opacity)).not.toBe("1");
    }
    await page.waitForTimeout(100);
  }
  await expect(kpi).not.toHaveText(old ?? "", { timeout: 15_000 });
});

test("sidebar: switching apps keeps the page and range", async ({ page }) => {
  await page.goto("/demo/events?from=2026-09-20&to=2026-10-10&event=calendar_poll");
  await page.getByRole("button", { name: "Switch app" }).click();
  const other = page.getByRole("link", { name: "demo-b" });
  await expect(other, "the e2e app list has the second synthetic app demo-b").toBeVisible();
  await other.click();
  await expect(page).toHaveURL(/\/demo-b\/events\?from=2026-09-20&to=2026-10-10$/);
});

test("sidebar: app switch shows skeletons, never the old app's numbers", async ({ page }) => {
  await page.goto("/demo");
  const kpi = page.getByTestId("kpi-pageviews");
  await expect(kpi).toBeVisible();
  const old = await kpi.textContent();
  await page.waitForLoadState("networkidle");
  await slowRsc(page, 2000);
  await page.getByRole("button", { name: "Switch app" }).click();
  await page.getByRole("link", { name: "demo-b" }).click();
  await expect(page.getByTestId("skeleton").first()).toBeVisible();
  await expect(page.locator("[data-testid=kpi-pageviews]:visible", { hasText: old ?? "" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/demo-b/, { timeout: 15_000 });
});

test("sidebar: pages", async ({ page }) => {
  await page.goto("/demo");
  const pages = page.getByRole("navigation", { name: "Pages" });
  await pages.getByRole("link", { name: "Funnels" }).click();
  await expect(page).toHaveURL(/\/demo\/funnels/);
  await expect(pages.getByRole("link", { name: "Funnels" })).toHaveAttribute("aria-current", "page");
});

test("sidebar: sign out", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/demo");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("sidebar: phone menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo");
  await expect(page.getByRole("navigation", { name: "Pages" })).toBeHidden();
  await page.getByRole("button", { name: "Open menu" }).click();
  const pages = page.getByRole("navigation", { name: "Pages" });
  await expect(pages).toBeVisible();
  await pages.getByRole("link", { name: "Events" }).click();
  await expect(page).toHaveURL(/\/demo\/events/);
  await expect(page.getByRole("navigation", { name: "Pages" })).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`390 px: no horizontal scroll in the ${theme} theme, drawer included`, async ({ page }) => {
    await setTheme(page, theme);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of [
      "/demo",
      "/demo/events?event=calendar_poll",
      "/demo/funnels?steps=place_selected&steps=subscribe_click",
    ]) {
      await page.goto(path);
      await expect(page.getByTestId("skeleton")).toHaveCount(0, { timeout: 15_000 });
      await expect(page.locator("html")).toHaveAttribute("data-theme-choice", theme);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("group", { name: "Theme" }).last()).toBeInViewport();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("funnels: Show funnel keeps the old result dimmed", async ({ page }) => {
  await page.goto("/demo/funnels?steps=place_selected&steps=subscribe_click");
  await expect(page.getByTestId("funnel-sessions-1")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await slowRsc(page, 2000);
  await page.getByLabel("Step 2 event").selectOption("$pageview");
  await page.getByRole("button", { name: "Show funnel" }).click();
  await expect(page.getByTestId("progress-line")).toBeVisible();
  await expect(page.getByTestId("page-body")).toHaveCSS("opacity", "0.5");
  await expect(page.getByTestId("funnel-sessions-1")).toBeVisible();
  await expect(page).toHaveURL(/steps=%24pageview/, { timeout: 10_000 });
  await expect(page.getByTestId("progress-line")).toBeHidden();
});

test("funnels: chart shows one bar per step with a hover tooltip", { tag: "@bq" }, async ({ page }) => {
  await page.goto("/demo/funnels?steps=place_selected&steps=subscribe_click");
  await expect(page.getByTestId("funnel-bar-h-1")).toBeVisible();
  await expect(page.getByTestId("funnel-bar-h-2")).toBeVisible();
  await expect(page.getByTestId("funnel-bar-h-3")).toHaveCount(0);
  await page.getByTestId("funnel-bar-h-2").hover();
  await expect(page.getByRole("tooltip")).toContainText("sessions");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("funnel-bar-v-1")).toBeVisible();
  await expect(page.getByTestId("funnel-bar-h-1")).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("sidebar: returning to a recent page gives feedback at once", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByTestId("kpi-pageviews")).toBeVisible();
  const pages = page.getByRole("navigation", { name: "Pages" });
  await pages.getByRole("link", { name: "Events" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
  await page.getByRole("button", { name: "Date range" }).click();
  await page.getByRole("button", { name: "Last 7 days" }).click();
  await expect(page.getByTestId("progress-line")).toBeHidden({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  await slowRsc(page, 2500);
  await pages.getByRole("link", { name: "Overview" }).click();
  // Either the progress line (old page dimmed) or the new page's skeletons, quickly; never a dead click.
  const feedback = page.getByTestId("progress-line").or(page.locator("[data-testid=skeleton]:visible").first());
  await expect(feedback).toBeVisible({ timeout: 500 });
});

// Hourly charts (spec 2026-10-27-hourly-charts). Ranges end on the fixed e2e today (2026-10-13).
const chart = (page: Page, title: string) => page.locator(`[data-slot="chart"][aria-label="${title}"]`).first();

test("overview: Hourly shows one point per hour and stays in the URL", async ({ page }) => {
  await page.goto("/demo?from=2026-10-07&to=2026-10-13");
  const interval = page.getByRole("group", { name: "Chart interval" });
  await expect(interval.getByRole("button", { name: "Daily" })).toHaveAttribute("aria-pressed", "true");
  await interval.getByRole("button", { name: "Hourly" }).click();
  await expect(page).toHaveURL(/from=2026-10-07&to=2026-10-13&interval=hour/);
  await expect(page.getByTestId("progress-line")).toBeHidden({ timeout: 15_000 });
  await expect(interval.getByRole("button", { name: "Hourly" })).toHaveAttribute("aria-pressed", "true");
  const visitors = chart(page, "Visitors");
  // One tick per day, labelled with the day.
  await expect(visitors.getByText("13 Oct", { exact: true })).toBeVisible();
  await expect(visitors.getByText(/^\d{2}:00$/)).toHaveCount(0);
  await visitors.hover({ position: { x: 200, y: 80 } });
  await expect(visitors.locator(".recharts-tooltip-wrapper")).toContainText(/\d{1,2} \w+, \d{2}:00: [\d,]+/);
  await expect(chart(page, "Errors")).toBeVisible();
  await expect(page.getByText("Could not load this panel.")).toHaveCount(0);
  // The sidebar keeps the interval with the range.
  await page.getByRole("link", { name: "Events" }).click();
  await expect(page).toHaveURL(/\/demo\/events\?from=2026-10-07&to=2026-10-13&interval=hour/);
});

test("overview: Hourly is unavailable for 28 days, the charts stay daily", async ({ page }) => {
  await page.goto("/demo?from=2026-09-16&to=2026-10-13&interval=hour");
  const interval = page.getByRole("group", { name: "Chart interval" });
  await expect(interval.getByRole("button", { name: "Daily" })).toHaveAttribute("aria-pressed", "true");
  const hourly = interval.getByRole("button", { name: "Hourly" });
  await expect(hourly).toHaveAttribute("aria-disabled", "true");
  await hourly.click({ force: true }); // aria-disabled: Playwright would wait for it to become enabled
  // A navigation would mark Hourly pressed at once (optimistic) and show the progress line.
  await expect(interval.getByRole("button", { name: "Daily" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("progress-line")).toBeHidden();
  await expect(page).toHaveURL(/from=2026-09-16&to=2026-10-13&interval=hour$/);
  const visitors = chart(page, "Visitors");
  await visitors.hover({ position: { x: 200, y: 80 } });
  await expect(visitors.locator(".recharts-tooltip-wrapper")).toContainText(/\d{1,2} \w+: [\d,]+/);
  await expect(visitors.locator(".recharts-tooltip-wrapper")).not.toContainText(":00");
});

test("explorer: a one-day range charts hours", async ({ page }) => {
  await page.goto("/demo/events?from=2026-10-13&to=2026-10-13&event=place_selected&metric=visitors");
  const interval = page.getByRole("group", { name: "Chart interval" });
  await expect(interval.getByRole("button", { name: "Hourly" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("explorer-total")).toBeVisible();
  const series = chart(page, "Visitors with the event, per hour");
  await expect(series.getByText("00:00", { exact: true })).toBeVisible();
  await expect(series.getByText("12:00", { exact: true })).toBeVisible();
  await series.hover({ position: { x: 200, y: 80 } });
  await expect(series.locator(".recharts-tooltip-wrapper")).toContainText(/13 Oct, \d{2}:00: [\d,]+/);
  await interval.getByRole("button", { name: "Daily" }).click();
  await expect(page).toHaveURL(/interval=day/);
  await expect(chart(page, "Visitors with the event, per day")).toBeVisible();
});
