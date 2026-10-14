// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readEnv } from "@/env";
import { eventsInRangeQuery } from "./events-in-range";

describe("eventsInRangeQuery", () => {
  it("filters app and timestamp range with parameters only", () => {
    const q = eventsInRangeQuery(readEnv({ GCP_PROJECT_ID: "robin-thues" }), "demo", {
      fromTs: "2026-09-16T22:00:00.000Z",
      toTs: "2026-10-14T22:00:00.000Z",
    });
    expect(q.sql).toContain("app_id = @app_id");
    expect(q.sql).toContain("timestamp >= TIMESTAMP(@from_ts) AND timestamp < TIMESTAMP(@to_ts)");
    expect(q.params).toEqual({
      app_id: "demo",
      from_ts: "2026-09-16T22:00:00.000Z",
      to_ts: "2026-10-14T22:00:00.000Z",
    });
  });
});
