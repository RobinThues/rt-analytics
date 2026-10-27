// @vitest-environment node
// Hourly chart queries (spec 2026-10-27-hourly-charts). The daily SQL must stay byte for byte as it was, so
// cache keys and e2e fixtures of the daily charts stay valid: the hashes below were taken before the change.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildContext } from "./context";
import { eventSeriesQuery, type ExplorerSelection, type Metric } from "./explorer";
import { trafficQuery } from "./overview";

const make = (interval: "day" | "hour") =>
  buildContext({
    table: "`p.analytics.events`",
    appId: "demo",
    settings: { timezone: "Europe/Berlin", hosts: [] },
    range: { from: "2026-10-10", to: "2026-10-16" },
    compare: true,
    today: "2026-10-16",
    interval,
  });
const day = make("day");
const hour = make("hour");

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const sel = (metric: Metric, filter: ExplorerSelection["filter"] = null): ExplorerSelection => ({
  event: "calendar_poll",
  metric,
  filter,
  by: null,
});
const SELECTIONS: Array<[string, ExplorerSelection]> = [
  ["events", sel({ kind: "events" })],
  ["sessions", sel({ kind: "sessions" })],
  ["visitors", sel({ kind: "visitors" })],
  ["distinct + filter", sel({ kind: "distinct", key: "subscription" }, { key: "kind", value: "token" })],
];

describe("daily chart SQL is unchanged", () => {
  it("traffic", () => {
    expect(sha(trafficQuery(day).sql)).toBe("b6cd16b073baa0b6");
  });
  const pinned: Record<string, string> = {
    events: "ce0a5df02202047b",
    sessions: "dfdbd96776476ce0",
    visitors: "1e4c15076127ce9c",
    "distinct + filter": "952864b5daeb1ec5",
  };
  it.each(SELECTIONS)("explorer series %s", (name, s) => {
    expect(sha(eventSeriesQuery(day, s).sql)).toBe(pinned[name]);
  });
});

const HOUR_OF = (ts: string) => `FORMAT_DATETIME('%Y-%m-%dT%H:00', DATETIME(${ts}, @tz))`;

describe("hourly traffic", () => {
  const q = trafficQuery(hour);
  it("same name and params as daily, so only the SQL splits the cache key", () => {
    expect(q.name).toBe("traffic");
    expect(q.params).toEqual(trafficQuery(day).params);
  });
  it("events by their own wall-clock hour, sessions by the hour of their first event", () => {
    expect(q.sql).toContain(`${HOUR_OF("timestamp")} AS hour_start`);
    expect(q.sql).toContain(`${HOUR_OF("start_ts")} AS hour_start`);
    expect(q.sql.match(/GROUP BY period, hour_start/g)).toHaveLength(2);
    expect(q.sql).toContain("FULL JOIN ss USING (period, hour_start)");
  });
  it("returns the hour and the query time instead of the day", () => {
    expect(q.sql).toMatch(/SELECT period, hour_start, CURRENT_TIMESTAMP\(\) AS as_of,\s+IFNULL\(visitors, 0\)/);
    expect(q.sql).not.toContain("CAST(day AS STRING)");
    expect(q.sql).toContain("ORDER BY period, hour_start");
  });
});

describe("hourly explorer series", () => {
  it.each(SELECTIONS)("%s: daily rows, hourly rows and the total in one query", (_, s) => {
    const q = eventSeriesQuery(hour, s);
    const daily = eventSeriesQuery(day, s);
    expect(q.name).toBe("event_series");
    expect(q.params).toEqual(daily.params);
    expect(q.sql).toContain(`${HOUR_OF("e.timestamp")} AS hour_start`);
    expect(q.sql).toContain("GROUP BY GROUPING SETS ((period, day), (period, hour_start), (period))");
    expect(q.sql).toContain("SELECT period, CAST(day AS STRING) AS day, hour_start, CURRENT_TIMESTAMP() AS as_of,");
  });
});
