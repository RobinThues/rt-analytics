// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readEnv } from "@/env";
import { APP_ID_RE, appListQuery, eventNamesQuery, isUsablePropKey, propKeysQuery } from "./sql";

const env = readEnv({ GCP_PROJECT_ID: "robin-thues" });
const END = "2026-10-13T22:00:00.000Z";
const windowEnd = (sql: string) => {
  expect(sql).toContain("TIMESTAMP_SUB(TIMESTAMP(@today_end)");
  expect(sql).toContain("timestamp < TIMESTAMP(@today_end)");
  expect(sql).not.toContain("CURRENT_TIMESTAMP()");
};

describe("discovery SQL", () => {
  it("app list reads 7 days plus configured apps, no app filter", () => {
    const q = appListQuery(env, END);
    windowEnd(q.sql);
    expect(q.sql).toContain("`robin-thues.analytics.events`");
    expect(q.sql).toContain("INTERVAL 7 DAY");
    expect(q.sql).toContain("`robin-thues.analytics_dashboard.dashboard_config`");
    expect(q.params).toEqual({ today_end: END });
  });

  it("event names: 30 days, app filter as a parameter, no $ events, id counts", () => {
    const evil = "x' OR 1=1 --";
    const q = eventNamesQuery(env, evil, END);
    windowEnd(q.sql);
    expect(q.sql).not.toContain(evil);
    expect(q.params).toEqual({ app_id: evil, today_end: END });
    expect(q.sql).toContain("app_id = @app_id");
    expect(q.sql).toContain("INTERVAL 30 DAY");
    expect(q.sql).toContain("NOT STARTS_WITH(event_name, '$')");
    expect(q.sql).toContain("COUNTIF(visitor_id IS NOT NULL)");
  });

  it("prop keys: 7 days, scalar values only", () => {
    const q = propKeysQuery(env, "demo", END);
    windowEnd(q.sql);
    expect(q.sql).toContain("UNNEST(JSON_KEYS(props, 1))");
    expect(q.sql).toContain("JSON_TYPE(props[k]) IN ('string', 'number', 'boolean')");
    expect(q.sql).toContain("INTERVAL 7 DAY");
    expect(q.params).toEqual({ app_id: "demo", today_end: END });
  });

  it("app ids follow the ingest rule", () => {
    expect(APP_ID_RE.test("wetter-in-kalender")).toBe(true);
    expect(APP_ID_RE.test("demo")).toBe(true);
    expect(APP_ID_RE.test("a b")).toBe(false);
    expect(APP_ID_RE.test("x".repeat(33))).toBe(false);
  });

  it("usable prop keys: not quoted, at most 128 characters", () => {
    expect(isUsablePropKey("place")).toBe(true);
    expect(isUsablePropKey("my-key")).toBe(true);
    expect(isUsablePropKey('"a.b"')).toBe(false);
    expect(isUsablePropKey("k".repeat(129))).toBe(false);
    expect(isUsablePropKey("")).toBe(false);
  });
});
