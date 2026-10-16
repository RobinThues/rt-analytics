import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "happy-dom",
    // Unprevented link clicks in tests must not navigate the test window.
    environmentOptions: { happyDOM: { settings: { navigation: { disableMainFrameNavigation: true } } } },
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
