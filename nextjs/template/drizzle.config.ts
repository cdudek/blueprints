import { defineConfig } from "drizzle-kit";

// Each module owns its tables; drizzle-kit assembles them here, shared/db.ts does not.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/modules/*/*.tables.ts",
  out: "./drizzle",
});
