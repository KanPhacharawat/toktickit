import { defineConfig, devices } from "@playwright/test";

// E2E and responsive tests (RESP-01–04, E2E-01–06 in docs/lab-02/tests.md).
//
// Both servers are started for the run. The API needs the database migrated
// and seeded first:
//   cd server && npx prisma migrate dev && npm run prisma:seed
export default defineConfig({
  testDir: "./e2e",
  // Clears tickets left by a previous run, so the suite is not history-dependent.
  globalSetup: "./e2e/global-setup.ts",
  // These drive one shared database, so they run in order, not in parallel.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: "npm run dev --prefix server",
      url: "http://localhost:3000/api/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev --prefix client",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
