import { defineConfig } from "vitest/config";

// Root tests: ops scripts and SQL templates. Workspace packages run their own suites.
export default defineConfig({
  test: { environment: "node", include: ["scripts/**/*.test.ts"] },
});
