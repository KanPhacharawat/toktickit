import { describe, it, expect, beforeAll } from "vitest";
import { app } from "../../src/app.js";
import { loginAgent, type AuthedAgent } from "../authHelper.js";
import { DEV_PASSWORD } from "../../prisma/seedData.js";

// P-01 — docs/lab-04/tests.md §7. Dashboard endpoints must respond in under
// 500ms (median of 5 runs) against the seeded dataset — the volume the app
// actually ships with, not an empty or synthetic fixture set.

const RUNS = 5;
const THRESHOLD_MS = 500;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function medianResponseTime(agent: AuthedAgent, path: string): Promise<number> {
  const durations: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    const res = await agent.get(path);
    durations.push(performance.now() - start);
    expect(res.status, `${path} run ${i + 1}`).toBe(200);
  }
  return median(durations);
}

let requesterAgent: AuthedAgent;
let staffAgent: AuthedAgent;
let adminAgent: AuthedAgent;

beforeAll(async () => {
  [requesterAgent, staffAgent, adminAgent] = await Promise.all([
    loginAgent(app, { email: "requester-a@example.com", password: DEV_PASSWORD }),
    loginAgent(app, { email: "itstaff-1@example.com", password: DEV_PASSWORD }),
    loginAgent(app, { email: "admin@example.com", password: DEV_PASSWORD }),
  ]);
});

describe("Dashboard endpoint response time (median of 5 runs, seeded data)", () => {
  it(`GET /api/dashboard/requester responds in under ${THRESHOLD_MS}ms`, async () => {
    const median = await medianResponseTime(requesterAgent, "/api/dashboard/requester");
    expect(median, `median ${median.toFixed(1)}ms`).toBeLessThan(THRESHOLD_MS);
  });

  it(`GET /api/dashboard/staff responds in under ${THRESHOLD_MS}ms`, async () => {
    const median = await medianResponseTime(staffAgent, "/api/dashboard/staff");
    expect(median, `median ${median.toFixed(1)}ms`).toBeLessThan(THRESHOLD_MS);
  });

  it(`GET /api/dashboard/admin responds in under ${THRESHOLD_MS}ms`, async () => {
    const median = await medianResponseTime(adminAgent, "/api/dashboard/admin");
    expect(median, `median ${median.toFixed(1)}ms`).toBeLessThan(THRESHOLD_MS);
  });
});
