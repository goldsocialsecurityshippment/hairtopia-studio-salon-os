import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.sqlite.ts",
  out: "./drizzle-sqlite",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH || "./data/test.db",
  },
} satisfies Config;
