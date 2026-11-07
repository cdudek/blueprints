import { defineConfig } from "@playwright/test";

const port = 3100;

// E2E runs against the production build (`pnpm build` first; CI reuses the build artifact), so
// it tests what ships. The auth stub refuses production unless AUTH_STUB=e2e, production defaults
// to the real payments provider, and the fixture provider refuses production unless
// PAYMENTS_STUB=e2e, so this config sets all three.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `pnpm start --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      AUTH_STUB: "e2e",
      PAYMENTS_PROVIDER: "fixture",
      PAYMENTS_STUB: "e2e",
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
    },
  },
});
