import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Vercel's "Ignored Build Step" for the dashboard: exit 0 skips the build, exit 1 builds, any other code fails
// the deployment.
const script = fileURLToPath(new URL("../apps/dashboard/scripts/ignore-build.sh", import.meta.url));

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "rtd-ignore-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  mkdirSync(join(dir, "apps/dashboard"), { recursive: true });
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "apps/dashboard/a.txt"), "1");
  git("add", "-A");
  git("commit", "-qm", "base");
  return { dir, git };
}

function run(dir: string, previous: string) {
  return spawnSync("bash", [script], {
    cwd: join(dir, "apps/dashboard"),
    env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: previous },
  }).status;
}

function commit(r: ReturnType<typeof repo>, file: string) {
  writeFileSync(join(r.dir, file), String(Date.now()));
  r.git("add", "-A");
  r.git("commit", "-qm", file);
}

describe("ignore-build.sh", () => {
  it("builds when there is no previous deployment", () => {
    expect(run(repo().dir, "")).toBe(1);
  });

  it("skips docs-only changes", () => {
    const r = repo();
    const base = r.git("rev-parse", "HEAD");
    commit(r, "docs/x.md");
    expect(run(r.dir, base)).toBe(0);
  });

  it("builds dashboard changes", () => {
    const r = repo();
    const base = r.git("rev-parse", "HEAD");
    commit(r, "apps/dashboard/a.txt");
    expect(run(r.dir, base)).toBe(1);
  });

  it("builds when the previous commit is unknown (shallow clone)", () => {
    expect(run(repo().dir, "0123456789abcdef0123456789abcdef01234567")).toBe(1);
  });
});
