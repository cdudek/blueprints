import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // The Dockerfile's web target runs the standalone server: build once, promote the image.
  output: "standalone",
  // One id per build, the same on every instance, so Server Actions and assets resolve across
  // instances and deploys (with one NEXT_SERVER_ACTIONS_ENCRYPTION_KEY). The image build sets it.
  deploymentId: process.env.DEPLOYMENT_ID,
};

// Finds the request config at src/i18n/request.ts.
export default createNextIntlPlugin()(config);
