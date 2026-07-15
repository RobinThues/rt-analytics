import { defineConfig } from "tsup";

const shared = {
  format: ["esm"] as const,
  dts: true,
  sourcemap: true,
  external: ["react", "next", "@google-cloud/bigquery-storage", "rt-analytics/react"],
};

export default defineConfig([
  {
    ...shared,
    entry: { index: "src/index.ts", "next/index": "src/next/index.ts" },
    clean: true,
  },
  {
    ...shared,
    entry: { "react/index": "src/react/index.ts", "next/client/index": "src/next/client/index.ts" },
    clean: false,
    banner: { js: '"use client";' },
  },
]);
