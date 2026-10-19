// Global setup of `npm run e2e:record`: starts from an empty fixtures folder, so files that no test uses
// any more disappear with the new recording.
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export default function clearFixtures(): void {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}
