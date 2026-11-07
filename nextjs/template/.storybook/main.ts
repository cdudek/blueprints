import type { StorybookConfig } from "@storybook/nextjs-vite";

// Stories sit beside the src/ui components they show. Stories render props only: Server
// Components in Storybook are experimental and Server Actions do not run there.
const config: StorybookConfig = {
  framework: "@storybook/nextjs-vite",
  stories: ["../src/ui/**/*.stories.tsx"],
  addons: ["@storybook/addon-a11y"],
};

export default config;
