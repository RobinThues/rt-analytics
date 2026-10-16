import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSettings } from "@/config/data";
import { appList, loadPage } from "./page-data";

vi.mock("@/auth/session", () => ({ requireUser: vi.fn(async () => ({ email: "a@b.c" })) }));
vi.mock("@/config/data", () => ({
  getSettings: vi.fn(async () => ({ timezone: "Europe/Berlin", hosts: [] })),
}));
vi.mock("@/discovery/data", () => ({ listApps: vi.fn(async () => ({ ok: true, rows: [{ app_id: "demo" }] })) }));
vi.mock("@/bq/query", () => ({ isLive: vi.fn(async () => false) }));
vi.mock("@/env", () => ({ readEnv: () => ({ analyticsTable: "`p.analytics.events`", maxBytesPerQuery: 1e9 }) }));

describe("page data", () => {
  beforeEach(() => vi.mocked(getSettings).mockClear());

  it("loadPage runs once per input object", async () => {
    const input = { params: Promise.resolve({ appId: "demo" }), searchParams: Promise.resolve({}) };
    const [a, b] = await Promise.all([loadPage(input), loadPage(input)]);
    expect(a).toBe(b);
    expect(getSettings).toHaveBeenCalledTimes(1);
  });

  it("appList adds the current app and sorts", () => {
    expect(appList("wik", ["demo"])).toEqual(["demo", "wik"]);
    expect(appList("demo", ["wik", "demo"])).toEqual(["demo", "wik"]);
  });
});
