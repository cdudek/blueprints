import { defineConfig } from "vitest/config";

// Report-only: writes artifacts, asserts nothing about the numbers.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/report/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
