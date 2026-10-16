import { describe, expect, it, vi } from "vitest";
import { getFunnels } from "@/config/data";
import { loadFunnelPage } from "./funnel-data";

vi.mock("@/auth/session", () => ({ requireUser: vi.fn(async () => ({ email: "a@b.c" })) }));
vi.mock("@/config/data", () => ({
  getSettings: vi.fn(async () => ({ timezone: "Europe/Berlin", hosts: [] })),
  getFunnels: vi.fn(async () => ({ funnels: [], failed: false })),
}));
vi.mock("@/discovery/data", () => ({
  listApps: vi.fn(async () => ({ ok: true, rows: [{ app_id: "demo" }] })),
  listEvents: vi.fn(async () => ({
    ok: true,
    rows: [
      { event_name: "place_selected", events: 5, with_visitor: 5, with_session: 5 },
      { event_name: "subscribe_click", events: 2, with_visitor: 2, with_session: 2 },
    ],
  })),
  listPropKeys: vi.fn(async () => ({ ok: true, rows: [] })),
}));
vi.mock("@/bq/query", () => ({ isLive: vi.fn(async () => false) }));
vi.mock("@/env", () => ({ readEnv: () => ({ analyticsTable: "`p.analytics.events`", maxBytesPerQuery: 1e9 }) }));

describe("loadFunnelPage", () => {
  it("loads once per input object and keeps the valid steps of a stale URL", async () => {
    const input = {
      params: Promise.resolve({ appId: "demo" }),
      searchParams: Promise.resolve({ steps: ["place_selected", "gone_event", "subscribe_click"] }),
    };
    const [a, b] = await Promise.all([loadFunnelPage(input), loadFunnelPage(input)]);
    expect(a).toBe(b);
    expect(getFunnels).toHaveBeenCalledTimes(1);
    expect(a.steps).toBeNull();
    expect(a.editorSteps.map((s) => s.event)).toEqual(["place_selected", "subscribe_click"]);
    expect(a.leftOut).toBe(true);
  });
});
