// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sourceExpr } from "./source";

describe("sourceExpr", () => {
  const sql = sourceExpr("first_pv");

  it("checks an external referrer, then utm_source, then the in-app browser, else direct", () => {
    const order = [
      "NOT IN UNNEST(@own_hosts)",
      "LOWER(TRIM(first_pv.utm_source))",
      "first_pv.in_app IS NOT NULL",
      "'direct'",
    ];
    const positions = order.map((part) => sql.indexOf(part));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("maps referrer hosts and utm values to one platform name", () => {
    for (const host of [
      "l.instagram.com",
      "com.google.android.youtube",
      "youtu.be",
      "vm.tiktok.com",
      "l.facebook.com",
    ]) {
      expect(sql).toContain(`'${host}'`);
    }
    for (const platform of ["instagram", "youtube", "tiktok", "facebook"]) {
      expect(sql).toContain(`THEN '${platform}'`);
    }
    // The map is used for both, so utm_source=ig and l.instagram.com end up the same.
    expect(sql.match(/'ig'/g)).toHaveLength(2);
  });

  it("reads the struct it was given", () => {
    expect(sourceExpr("pv")).toContain("NET.HOST(pv.referrer)");
    expect(sourceExpr("pv")).not.toContain("first_pv");
  });
});
