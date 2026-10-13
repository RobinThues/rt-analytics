import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { pseudonymizeWith } from "./server-tracker.js";

describe("scripts/pseudonymize.ts", () => {
  it("prints the same pseudonyms as the tracker", () => {
    const key = "salt-0123456789abcdef";
    const out = execFileSync("npx", ["tsx", "scripts/pseudonymize.ts", "--app", "wetter", "s:0123456789abcdef", "link:x"], {
      env: { ...process.env, ANALYTICS_DAILY_SALT: key, ANALYTICS_PSEUDONYM_KEY: "" },
      encoding: "utf8",
    });
    expect(out.trim().split("\n")).toEqual([
      `${pseudonymizeWith(key, "wetter", "s:0123456789abcdef")}\ts:0123456789abcdef`,
      `${pseudonymizeWith(key, "wetter", "link:x")}\tlink:x`,
    ]);
  }, 30_000);
});
