import { defineConfig } from "vitest/config";

// ArchUnitTS reads `expect` from the global scope, so `globals: true` is required here.
// It also needs tsconfig.arch.json, limited to src/, so tests never become part of the graph.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/architecture/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
