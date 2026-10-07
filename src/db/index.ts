import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const databaseUrl = process.env.NEON_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "NEON_DATABASE_URL is not configured. Set it in the environment before starting the application."
  );
}

const sql = neon(databaseUrl);

export const db = drizzle(sql, { schema });
