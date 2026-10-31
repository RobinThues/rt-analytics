// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildContext } from "./context";
import { goalLines, goalQuery, goalTotals, type GoalRow } from "./goals";

const goal = { event: "signup", label: "Sign-ups" };
const ctx = buildContext({
  table: "`p.analytics.events`",
  appId: "app",
  settings: { timezone: "Europe/Berlin", hosts: ["example.com"], goal },
  range: { from: "2026-10-01", to: "2026-10-16" },
  compare: true,
  today: "2026-10-16",
});

const row = (over: Partial<GoalRow>): GoalRow => ({
  dim: "source",
  period: "cur",
  value: "direct",
  sessions: 10,
  conversions: 1,
  ...over,
});

describe("goalQuery", () => {
  const q = goalQuery(ctx, goal);

  it("takes the goal and the hosts as parameters, never inline", () => {
    expect(q.params.goal_event).toBe("signup");
    expect(q.params.own_hosts).toEqual(["example.com"]);
    expect(q.types).toEqual({ own_hosts: ["STRING"] });
    expect(q.sql).toContain("event_name = @goal_event");
    expect(q.sql).not.toContain("'signup'");
  });

  it("filters the app and reads the source columns", () => {
    expect(q.name).toBe("goals");
    expect(q.sql).toContain("app_id = @app_id");
    expect(q.sql).toContain("first_pv.in_app");
    expect(q.sql).toContain("NOT IN UNNEST(@own_hosts)");
  });

  it("has one row set per table", () => {
    for (const dim of ["total", "source", "entry_page", "device"]) expect(q.sql).toContain(`'${dim}' AS dim`);
  });
});

describe("goalLines", () => {
  it("gives rates, sorts by sessions and puts Other last", () => {
    const lines = goalLines(
      [
        row({ value: null, sessions: 100, conversions: 5 }),
        row({ value: "direct", sessions: 20, conversions: 5 }),
        row({ value: "tiktok", sessions: 40, conversions: 2 }),
      ],
      "source",
    );
    expect(lines.map((l) => l.label)).toEqual(["tiktok", "direct", "Other"]);
    expect(lines[1]!.rate).toBe(0.25);
    expect(lines[2]!.isOther).toBe(true);
  });

  it("reads the previous rate of the same value and only its own dim", () => {
    const lines = goalLines(
      [
        row({ sessions: 10, conversions: 2 }),
        row({ period: "prev", sessions: 10, conversions: 1 }),
        row({ dim: "device", value: "mobile" }),
      ],
      "source",
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]!.prevRate).toBe(0.1);
  });

  it("has no previous rate without previous sessions", () => {
    expect(goalLines([row({})], "source")[0]!.prevRate).toBeNull();
    const none = [row({}), row({ period: "prev", sessions: 0, conversions: 0 })];
    expect(goalLines(none, "source")[0]!.prevRate).toBeNull();
  });
});

describe("goalTotals", () => {
  it("reads both periods", () => {
    const t = goalTotals([
      row({ dim: "total", value: "all", sessions: 200, conversions: 50 }),
      row({ dim: "total", value: "all", period: "prev", sessions: 100, conversions: 10 }),
    ]);
    expect(t).toEqual({ sessions: 200, conversions: 50, rate: 0.25, prevConversions: 10, prevRate: 0.1 });
  });

  it("is all zero without rows, with no division by zero", () => {
    expect(goalTotals([])).toEqual({ sessions: 0, conversions: 0, rate: 0, prevConversions: null, prevRate: null });
  });
});
