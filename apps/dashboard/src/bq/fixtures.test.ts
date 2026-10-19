// @vitest-environment node
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createRecordClient, createReplayClient, fixtureFile } from "./fixtures";
import type { QueryClient } from "./run-query";

const opts = (over: Record<string, unknown> = {}) => ({
  query: "SELECT 1",
  params: { app_id: "demo", a: 1 },
  location: "EU",
  maximumBytesBilled: "1000",
  labels: { rtd_source: "e2e", rtd_query: "kpis" },
  ...over,
});
const fake = (rows: unknown[]) => {
  const query = vi.fn(async () => [rows] as [unknown[]]);
  return { client: { query } as QueryClient, query };
};
const tmp = () => mkdtempSync(join(tmpdir(), "rtd-fixtures-"));

describe("fixtureFile", () => {
  it("does not depend on the order of param keys", () => {
    expect(fixtureFile(opts({ params: { app_id: "demo", a: 1, b: 2 } }))).toBe(
      fixtureFile(opts({ params: { b: 2, a: 1, app_id: "demo" } })),
    );
  });
  it("changes with the SQL and starts with the query name", () => {
    expect(fixtureFile(opts())).not.toBe(fixtureFile(opts({ query: "SELECT 2" })));
    expect(fixtureFile(opts())).toMatch(/^kpis-[0-9a-f]{16}\.json$/);
  });
  it("ignores the byte cap and the job source", () => {
    const a = fixtureFile(opts());
    expect(
      fixtureFile(opts({ maximumBytesBilled: "5", labels: { rtd_source: "development", rtd_query: "kpis" } })),
    ).toBe(a);
  });
});

describe("record and replay", () => {
  it("replays what was recorded", async () => {
    const dir = tmp();
    const { client } = fake([{ n: 1 }]);
    expect(await createRecordClient(client, dir).query(opts())).toEqual([[{ n: 1 }]]);
    expect(await createReplayClient(dir, 0).query(opts())).toEqual([[{ n: 1 }]]);
  });
  it("replay of an unknown query fails and names the command to run", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(createReplayClient(tmp(), 0).query(opts())).rejects.toThrow(/npm run e2e:record/);
  });
  it("record refuses apps outside the allowlist and writes nothing", async () => {
    const dir = tmp();
    const { client, query } = fake([{ n: 1 }]);
    await expect(
      createRecordClient(client, dir).query(opts({ params: { app_id: "wetter-in-kalender" } })),
    ).rejects.toThrow(/wetter-in-kalender/);
    expect(query).not.toHaveBeenCalled();
    expect(readdirSync(dir)).toEqual([]);
  });
  it("record keeps only allowed apps in the app list and adds demo-b", async () => {
    const dir = tmp();
    const { client } = fake([{ app_id: "demo" }, { app_id: "wetter-in-kalender" }]);
    const list = opts({
      params: { today_end: "2026-10-14T00:00:00.000Z" },
      labels: { rtd_source: "e2e", rtd_query: "app_list" },
    });
    const expected = [[{ app_id: "demo" }, { app_id: "demo-b" }]];
    expect(await createRecordClient(client, dir).query(list)).toEqual(expected);
    expect(await createReplayClient(dir, 0).query(list)).toEqual(expected);
  });
});
