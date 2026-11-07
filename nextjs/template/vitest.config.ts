import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Unit and integration tests. Architecture checks have their own config (vitest.arch.config.ts).
export default defineConfig({
  resolve: {
    alias: {
      "@tests": path("./tests"),
      "@": path("./src"),
      // server-only throws outside the Next.js server runtime; tests are server code.
      "server-only": path("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.{ts,tsx}",
      "tests/tooling/**/*.test.ts",
      "tests/integration/**/*.test.ts",
    ],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30_000,
  },
});
