import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(new URL(`../sql/templates/${name}`, import.meta.url), "utf8");

describe("sql templates", () => {
  it("never use LIKE 'd_%' (underscore is a wildcard)", () => {
    for (const name of ["retention.sql", "funnel.sql", "web_vitals.sql", "errors.sql"]) {
      expect(read(name)).not.toMatch(/LIKE\s+'d_%'/i);
    }
  });

  it("retention filters persistent ids with STARTS_WITH and has a date filter", () => {
    const sql = read("retention.sql");
    expect(sql).toMatch(/NOT STARTS_WITH\(visitor_id, 'd_'\)/);
    expect(sql).toMatch(/DATE\(timestamp\) BETWEEN/);
  });

  it("funnel takes each step after the previous step", () => {
    const sql = read("funnel.sql");
    expect(sql).toMatch(/ev\.timestamp > s1\.t1/);
    expect(sql).toMatch(/ev\.timestamp > s2\.t2/);
  });
});
