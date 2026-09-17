import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // These are integration tests against one shared PostgreSQL database.
    // Running files in parallel lets one suite's fixtures land in another
    // suite's counts, so run them one file at a time.
    fileParallelism: false,
    env: {
      // Lab 3 BR-12 — the lowest permitted cost keeps hashing-heavy suites
      // fast; production keeps the default of 12.
      BCRYPT_COST: "10",
    },
  },
});
