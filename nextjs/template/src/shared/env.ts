import "server-only";
import { z } from "zod";

// The only place that reads process.env. Server code asks for what it needs.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().default("postgres://app:app@localhost:5432/app"),
  PAYMENTS_PROVIDER: z.enum(["fixture", "noop", "real"]).optional(),
  PAYMENTS_API_KEY: z.string().optional(),
  PAYMENTS_WEBHOOK_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  // the auth stub refuses production unless this is set; only the e2e job sets it
  AUTH_STUB: z.enum(["e2e"]).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
