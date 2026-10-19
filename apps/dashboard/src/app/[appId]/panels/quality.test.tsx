// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildContext } from "@/queries/context";
import type { QualityRow } from "@/queries/overview";

const loadQuality = vi.fn();
vi.mock("./shared", () => ({ loadQuality: (...args: unknown[]) => loadQuality(...args) }));
const { SlowPagesPanel, TopErrorsPanel } = await import("./quality");

const ctx = buildContext({
  table: "`p.analytics.events`",
  appId: "demo-b",
  settings: { timezone: "Europe/Berlin", hosts: [] },
  range: { from: "2026-10-01", to: "2026-10-13" },
  compare: false,
  today: "2026-10-13",
});
const none = {
  period: null,
  metric: null,
  p75: null,
  samples: null,
  page_path: null,
  message: null,
  occurrences: null,
  last_seen: null,
  consent_state: null,
  pageviews: null,
};
const props = { ctx, live: false, maxBytes: 1e9 };

describe("quality panels", () => {
  it("read the shared quality result and keep their own rows", async () => {
    const rows: QualityRow[] = [{ ...none, panel: "slow_pages", page_path: "/a", p75: 2500, samples: 7 }];
    loadQuality.mockResolvedValue({ ok: true, rows });
    const el = (await SlowPagesPanel(props)) as { props: { rows: unknown[] } };
    expect(loadQuality).toHaveBeenCalledWith(ctx, false);
    expect(el.props.rows).toEqual([{ page_path: "/a", p75: 2500, samples: 7 }]);
  });

  it("an app without events shows the empty state, not an error", async () => {
    loadQuality.mockResolvedValue({ ok: true, rows: [] });
    const el = (await TopErrorsPanel(props)) as { props: { children: string } };
    expect(el.props.children).toBe("No errors in this range.");
  });
});
