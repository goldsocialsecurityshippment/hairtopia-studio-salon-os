import { execSync } from "child_process";
import path from "path";
import fs from "fs";

/**
 * Runs ONCE before the whole test suite. Creates a dedicated test database
 * (data/test.db — never the dev/demo database) with the full current
 * schema applied via the same `drizzle-kit push` the real app uses, so
 * tests run against the actual schema, not a hand-maintained copy of it.
 */
export async function setup() {
  const testDbPath = path.join(process.cwd(), "data", "test.db");
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = testDbPath + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  execSync("npx drizzle-kit push --config drizzle.config.ts", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_PATH: testDbPath },
    input: "y\n",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export async function teardown() {
  // Intentionally leaves data/test.db in place after a run (useful for
  // debugging locally). It's gitignored and excluded from the packaged ZIP.
}
