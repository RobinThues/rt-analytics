import { defineConfig, type UserConfig } from "tsdown";

const shared: UserConfig = {
  format: ["esm"],
  dts: true,
  sourcemap: true,
  // Keep .js/.d.ts (package is "type": "module"); tsdown defaults to .mjs on platform node.
  fixedExtension: false,
  deps: { neverBundle: ["react", "next", "@google-cloud/bigquery-storage", "rt-analytics", "rt-analytics/react"] },
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
