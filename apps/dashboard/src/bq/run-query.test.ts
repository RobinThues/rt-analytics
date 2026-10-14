// @vitest-environment node
import { describe, expect, it } from "vitest";
import { runQuery, toPlain, type QueryClient } from "./run-query";

const spec = { sql: "SELECT 1 AS n", params: { app_id: "demo" } };
const client = (impl: QueryClient["query"]): QueryClient => ({ query: impl });

describe("runQuery", () => {
  it("passes params, EU location and the byte cap", async () => {
    let seen: Record<string, unknown> = {};
    const res = await runQuery(
      client(async (o) => {
        seen = o;
        return [[{ n: 1 }]];
      }),
      spec,
      1000,
    );
    expect(res).toEqual({ ok: true, rows: [{ n: 1 }] });
    expect(seen).toMatchObject({
      query: "SELECT 1 AS n",
      params: { app_id: "demo" },
      location: "EU",
      maximumBytesBilled: "1000",
    });
  });

  it("classifies the byte cap error", async () => {
    const err = Object.assign(new Error("Query exceeded limit for bytes billed: 1000."), {
      errors: [{ reason: "bytesBilledLimitExceeded" }],
    });
    const res = await runQuery(
      client(async () => {
        throw err;
      }),
      spec,
      1000,
    );
    expect(res).toMatchObject({ ok: false, error: "bytes-cap" });
  });

  it("returns other errors as failed, never throws", async () => {
    const res = await runQuery(
      client(async () => {
        throw new Error("boom");
      }),
      spec,
      1000,
    );
    expect(res).toEqual({ ok: false, error: "failed", message: "boom" });
  });
});

describe("toPlain", () => {
  it("unwraps BigQuery value objects and Big numbers", () => {
    class BigQueryDate {
      constructor(public value: string) {}
    }
    const big = { toNumber: () => 12.5 };
    expect(
      toPlain({ d: new BigQueryDate("2026-10-01"), n: big, s: "x", a: [new BigQueryDate("2026-10-02")], z: null }),
    ).toEqual({ d: "2026-10-01", n: 12.5, s: "x", a: ["2026-10-02"], z: null });
  });
  it("turns Date into an ISO string", () => {
    expect(toPlain(new Date("2026-10-01T00:00:00Z"))).toBe("2026-10-01T00:00:00.000Z");
  });
});
