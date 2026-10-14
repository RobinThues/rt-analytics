import { describe, expect, it } from "vitest";
import { dailyVisitorId } from "../next/enrich.js";
import { BUILTIN_EVENTS, DAILY_VISITOR_PREFIX, EVENTS, SERVER_CONSENT_STATE } from "./index.js";

describe("schema", () => {
  it("EVENTS covers exactly the built-in event names", () => {
    expect(new Set(Object.values(EVENTS))).toEqual(new Set(BUILTIN_EVENTS));
  });

  it("built-in names start with $", () => {
    for (const name of BUILTIN_EVENTS) expect(name.startsWith("$")).toBe(true);
  });

  it("daily visitor ids use the prefix", () => {
    const id = dailyVisitorId("salt-0123456789abcdef", "1.2.3.4", "ua", "app", new Date());
    expect(id.startsWith(DAILY_VISITOR_PREFIX)).toBe(true);
  });

  it("server consent state", () => {
    expect(SERVER_CONSENT_STATE).toBe("server");
  });
});
