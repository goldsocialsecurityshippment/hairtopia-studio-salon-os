import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    env: {
      DATABASE_PATH: "./data/test.db",
    },
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@/db/schema": path.resolve(__dirname, "./src/db/schema.sqlite.ts"),
      "@/db": path.resolve(__dirname, "./src/db/index.sqlite.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
