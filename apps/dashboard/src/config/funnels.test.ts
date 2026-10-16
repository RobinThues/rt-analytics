// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readEnv } from "@/env";
import { deleteFunnelQuery, FUNNEL_ID_RE, listFunnelsQuery, parseSavedFunnel, saveFunnelQuery } from "./funnels";

const env = readEnv({ GCP_PROJECT_ID: "robin-thues" });
const steps = [
  { event: "place_selected", filter: { key: "source", value: "map" } },
  { event: "subscribe_click", filter: null },
];
const id = "0b5c7a1e-3f2d-4c8b-9a6e-1d2f3a4b5c6d";

describe("saved funnels store", () => {
  it("save is a MERGE on kind and id with the value as JSON param", () => {
    const q = saveFunnelQuery(env, "demo", { id, name: "Signup", steps }, "a@b.de");
    expect(q.sql).toContain("MERGE");
    expect(q.sql).toContain("'funnel'");
    expect(q.params).toMatchObject({ id, app_id: "demo", name: "Signup", email: "a@b.de" });
    expect(JSON.parse(q.params.value as string)).toEqual({ steps });
  });
  it("delete is scoped to app and kind", () => {
    expect(deleteFunnelQuery(env, "demo", id).sql).toMatch(/kind = 'funnel' AND id = @id AND app_id = @app_id/);
  });
  it("list reads the app's funnels from the config table", () => {
    const q = listFunnelsQuery(env, "demo");
    expect(q.sql).toContain("`robin-thues.analytics_dashboard.dashboard_config`");
    expect(q.sql).toContain("kind = 'funnel' AND app_id = @app_id");
  });
  it("parseSavedFunnel reads good rows and skips broken ones", () => {
    expect(parseSavedFunnel({ id, name: "Signup", value: JSON.stringify({ steps }) })).toEqual({
      id,
      name: "Signup",
      steps,
    });
    expect(parseSavedFunnel({ id, name: "n", value: "{}" })).toBeNull();
    expect(parseSavedFunnel({ id, name: "n", value: "not json" })).toBeNull();
    expect(
      parseSavedFunnel({
        id,
        name: "n",
        value: '{"steps":[{"event":"bad name","filter":null},{"event":"a","filter":null}]}',
      }),
    ).toBeNull();
    expect(parseSavedFunnel({ id, name: null, value: JSON.stringify({ steps }) })).toBeNull();
  });
  it("funnel ids are UUIDs", () => {
    expect(FUNNEL_ID_RE.test(id)).toBe(true);
    expect(FUNNEL_ID_RE.test("x' OR 1=1")).toBe(false);
  });
});
