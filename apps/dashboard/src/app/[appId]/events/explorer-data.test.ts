import { describe, expect, it, vi } from "vitest";
import { listEvents } from "@/discovery/data";
import { loadExplorer } from "./explorer-data";

vi.mock("@/auth/session", () => ({ requireUser: vi.fn(async () => ({ email: "a@b.c" })) }));
vi.mock("@/config/data", () => ({
  getSettings: vi.fn(async () => ({ timezone: "Europe/Berlin", hosts: [] })),
}));
vi.mock("@/discovery/data", () => ({
  listApps: vi.fn(async () => ({ ok: true, rows: [{ app_id: "demo" }] })),
  listEvents: vi.fn(async () => ({
    ok: true,
    rows: [{ event_name: "calendar_poll", events: 5, with_visitor: 0, with_session: 0 }],
  })),
  listPropKeys: vi.fn(async () => ({ ok: true, rows: [{ event_name: "calendar_poll", prop_key: "kind", n: 5 }] })),
}));
vi.mock("@/bq/query", () => ({ isLive: vi.fn(async () => false) }));
vi.mock("@/env", () => ({ readEnv: () => ({ analyticsTable: "`p.analytics.events`", maxBytesPerQuery: 1e9 }) }));

describe("loadExplorer", () => {
  it("runs discovery once per input object and parses the selection", async () => {
    const input = {
      params: Promise.resolve({ appId: "demo" }),
      searchParams: Promise.resolve({ event: "calendar_poll", filter: "kind:token" }),
    };
    const [a, b] = await Promise.all([loadExplorer(input), loadExplorer(input)]);
    expect(a).toBe(b);
    expect(listEvents).toHaveBeenCalledTimes(1);
    expect(a.sel).toEqual({
      event: "calendar_poll",
      metric: { kind: "events" },
      filter: { key: "kind", value: "token" },
      by: null,
    });
  });
});
