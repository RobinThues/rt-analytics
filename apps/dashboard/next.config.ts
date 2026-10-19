import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // src/bq/client.ts names the e2e fixtures folder for replay (local only); keep that test data out of the
  // server traces, so it never ships in a Vercel function.
  outputFileTracingExcludes: { "/**": ["./e2e/**/*"] },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
