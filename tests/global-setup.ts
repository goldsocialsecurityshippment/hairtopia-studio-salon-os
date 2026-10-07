import { execSync } from "child_process";
import path from "path";
import fs from "fs";

/**
 * Creates a dedicated SQLite test database.
 * This database is completely separate from the production Neon database.
 */
export async function setup() {
  const testDbPath = path.join(process.cwd(), "data", "test.db");

  for (const suffix of ["", "-wal", "-shm"]) {
    const p = testDbPath + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  execSync("npx drizzle-kit push --config drizzle.sqlite.config.ts", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_PATH: testDbPath },
    input: "y\n",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export async function teardown() {
  // Keep data/test.db after tests for local debugging.
}
