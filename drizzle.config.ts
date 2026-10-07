import type { Config } from "drizzle-kit";

// Respects DATABASE_PATH so `drizzle-kit push` can target a different file
// (used by the test suite's global setup to push the schema into a
// dedicated data/test.db without touching the real dev database).
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH || "./data/hairtopia.db",
  },
} satisfies Config;
