import type { Preview } from "@storybook/nextjs-vite";
import "../src/ui/styles/index.css";

const preview: Preview = {
  // An accessibility violation fails the story, not just a warning in the panel.
  parameters: { a11y: { test: "error" } },
};

export default preview;
