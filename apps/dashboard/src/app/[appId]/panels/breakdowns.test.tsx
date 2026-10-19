// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildContext } from "@/queries/context";
import type { BreakdownsRow } from "@/queries/overview";

const loadBreakdowns = vi.fn();
vi.mock("./shared", () => ({ loadBreakdowns: (...args: unknown[]) => loadBreakdowns(...args) }));
const { BreakdownPanel } = await import("./breakdowns");

const ctx = buildContext({
  table: "`p.analytics.events`",
  appId: "demo",
  settings: { timezone: "Europe/Berlin", hosts: [] },
  range: { from: "2026-10-01", to: "2026-10-13" },
  compare: false,
  today: "2026-10-13",
});
const rows: BreakdownsRow[] = [
  { dim: "os", period: "cur", value: "Linux", pageviews: 3, visitor_days: 2 },
  { dim: "country", period: "cur", value: "DE", pageviews: 5, visitor_days: 4 },
];

describe("BreakdownPanel", () => {
  it("reads the shared breakdowns result and shows only its own dimension", async () => {
    loadBreakdowns.mockResolvedValue({ ok: true, rows });
    const el = (await BreakdownPanel({ ctx, live: false, maxBytes: 1e9, dim: "os", valueLabel: "OS" })) as {
      props: { rows: Array<{ label: string }>; testId: string };
    };
    expect(loadBreakdowns).toHaveBeenCalledWith(ctx, false);
    expect(el.props.testId).toBe("breakdown-os");
    expect(el.props.rows.map((r) => r.label)).toEqual(["Linux"]);
  });

  it("shows the query error in every panel of the merged query", async () => {
    loadBreakdowns.mockResolvedValue({ ok: false, error: "bytes-cap", message: "too big" });
    const el = (await BreakdownPanel({ ctx, live: false, maxBytes: 1e9, dim: "page", valueLabel: "Page" })) as {
      props: { result: unknown };
    };
    expect(el.props.result).toEqual({ ok: false, error: "bytes-cap", message: "too big" });
  });
});
