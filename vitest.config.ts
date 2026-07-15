import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "rt-analytics/react": fileURLToPath(new URL("./src/react/index.ts", import.meta.url)),
    },
  },
  test: { environment: "node" },
});
