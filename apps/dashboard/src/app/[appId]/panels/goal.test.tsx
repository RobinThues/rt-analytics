// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildContext } from "@/queries/context";
import type { GoalRow } from "@/queries/goals";

const dataQuery = vi.fn();
vi.mock("@/bq/query", () => ({ dataQuery: (...args: unknown[]) => dataQuery(...args) }));
const { GoalPanel } = await import("./goal");

const context = (goal?: { event: string; label: string }, compare = true) =>
  buildContext({
    table: "`p.analytics.events`",
    appId: "app",
    settings: { timezone: "Europe/Berlin", hosts: [], ...(goal ? { goal } : {}) },
    range: { from: "2026-10-01", to: "2026-10-13" },
    compare,
    today: "2026-10-13",
  });
const goal = { event: "subscribe_click", label: "Clicks on subscribe" };
const row = (over: Partial<GoalRow>): GoalRow => ({
  dim: "total",
  period: "cur",
  value: "all",
  sessions: 200,
  conversions: 50,
  ...over,
});
const panel = async (ctx: ReturnType<typeof context>) =>
  renderToStaticMarkup(await GoalPanel({ ctx, live: false, maxBytes: 1e9 }));

describe("GoalPanel", () => {
  it("asks for a goal and runs no query without one", async () => {
    dataQuery.mockClear();
    const html = await panel(context());
    expect(html).toContain("No goal set.");
    expect(html).toContain('href="/app/settings"');
    expect(dataQuery).not.toHaveBeenCalled();
  });

  it("shows the label, the rate and the tables", async () => {
    dataQuery.mockResolvedValue({
      ok: true,
      rows: [
        row({}),
        row({ period: "prev", sessions: 100, conversions: 10 }),
        row({ dim: "source", value: "tiktok", sessions: 80, conversions: 40 }),
        row({ dim: "source", period: "prev", value: "tiktok", sessions: 10, conversions: 1 }),
        row({ dim: "entry_page", value: "/", sessions: 200, conversions: 50 }),
        row({ dim: "device", value: "mobile", sessions: 200, conversions: 50 }),
      ],
    });
    const html = await panel(context(goal));
    expect(html).toContain("Clicks on subscribe");
    expect(html).toContain("25 %");
    expect(html).toContain("tiktok");
    expect(html).toContain("50 %");
    expect(html).toContain('data-testid="goal-source"');
    expect(html).toContain('data-testid="goal-entry_page"');
    expect(html).toContain('data-testid="goal-device"');
    expect(html).toContain(">Prev<");
  });

  it("has no previous column when Compare is off", async () => {
    dataQuery.mockResolvedValue({ ok: true, rows: [row({}), row({ dim: "source", value: "direct" })] });
    expect(await panel(context(goal, false))).not.toContain(">Prev<");
  });

  it("says so when there are no sessions", async () => {
    dataQuery.mockResolvedValue({ ok: true, rows: [] });
    expect(await panel(context(goal))).toContain("No sessions in this range.");
  });

  it("shows a query error", async () => {
    dataQuery.mockResolvedValue({ ok: false, error: "failed", message: "boom" });
    expect(await panel(context(goal))).toContain("Could not load this panel.");
  });
});
