import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServerTracker } from "rt-analytics/next";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("./pseudonymize.ts", import.meta.url));

describe("scripts/pseudonymize.ts", () => {
  it("prints the same pseudonyms as the tracker", () => {
    const key = "salt-0123456789abcdef";
    const out = execFileSync("npx", ["tsx", script, "--app", "wetter", "s:0123456789abcdef", "link:x"], {
      env: { ...process.env, ANALYTICS_DAILY_SALT: key, ANALYTICS_PSEUDONYM_KEY: "" },
      encoding: "utf8",
    });
    const tracker = createServerTracker({ appId: "wetter", pseudonymKey: key });
    expect(out.trim().split("\n")).toEqual([
      `${tracker.pseudonymize("s:0123456789abcdef")}\ts:0123456789abcdef`,
      `${tracker.pseudonymize("link:x")}\tlink:x`,
    ]);
  }, 30_000);
});
