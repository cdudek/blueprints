import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";
import { buildBoundariesConfig } from "./scripts/arch/eslint-boundaries.mjs";
import { loadArchitecture } from "./scripts/arch/lib.mjs";

export default defineConfig([
  globalIgnores([
    ".next/**",
    "reports/**",
    "drizzle/**",
    "tests/fixtures/**",
    "playwright-report/**",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextVitals,
  // Generated from architecture.json: the same source the architecture tests read.
  ...buildBoundariesConfig(loadArchitecture()),
  {
    files: ["**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/consistent-type-imports": "error" },
  },
]);
