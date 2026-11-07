import { defineConfig } from "@playwright/test";

const port = 6106;

// Accessibility of the src/ui primitives, story by story (tests/storybook). Runs against the
// Storybook dev server; `pnpm storybook:test`.
export default defineConfig({
  testDir: "./tests/storybook",
  reporter: process.env.CI ? [["github"]] : "list",
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `pnpm exec storybook dev --ci --no-open --port ${port}`,
    url: `http://localhost:${port}/index.json`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
