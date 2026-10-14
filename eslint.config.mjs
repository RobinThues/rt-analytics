import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// Library, scripts and SQL helpers. Apps under apps/ have their own eslint.config.mjs (eslint-config-next).
export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "apps/**", "claude-tmp-helpers/**", "**/*.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/rt-analytics/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  { files: ["scripts/**/*.ts", "**/*.config.{ts,mjs}"], languageOptions: { globals: globals.node } },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  prettier,
);
