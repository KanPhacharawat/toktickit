import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAgent, type AuthedAgent } from "../authHelper.js";
import { createTestUser, removeTestUsers } from "../lab-03/helpers.js";

// Requester Dashboard — specification.md §4.3/§5.4, api-spec.md §4.1.
// tests.md A-03 (FR-17, FR-18, BR-17, BR-26–BR-32, AC-02, AC-26, AC-27).

const prisma = getPrisma();
const TAG = "[requester-dashboard-test]";

let requesterId: number;
let requesterAgent: AuthedAgent;
let otherRequesterId: number;
let otherRequesterAgent: AuthedAgent;
let emptyRequesterAgent: AuthedAgent;
let staffAgent: AuthedAgent;
let adminAgent: AuthedAgent;
let categoryId: number;
let systemId: number;

async function removeFixtures() {
  await prisma.ticket.deleteMany({ where: { summary: { contains: TAG } } });
}

async function createTicket(ownerRequesterId: number, overrides: {
  summary: string;
  currentStatus?: string;
  updatedAt?: Date;
}) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TT-RDASH-${Math.random().toString(36).slice(2, 10)}`,
      requesterId: ownerRequesterId,
      categoryId,
      relatedSystemId: systemId,
      summary: `${TAG} ${overrides.summary}`,
      description: "Created by the requester dashboard test suite.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: (overrides.currentStatus ?? "New") as never,
    },
    select: { id: true, updatedAt: true },
  });
  if (overrides.updatedAt) {
    await prisma.ticket.update({ where: { id: ticket.id }, data: { updatedAt: overrides.updatedAt } });
  }
  return ticket;
}

/** Parses a `drillDown` link like "/my-tickets?status=open" into query params. */
function drillDownParams(drillDown: string): Record<string, string> {
  const query = drillDown.split("?")[1] ?? "";
  return Object.fromEntries(new URLSearchParams(query));
}

beforeAll(async () => {
  const [requester, otherRequester, emptyRequester, staff, admin, category, system] = await Promise.all([
    createTestUser({ role: "Requester", name: "Dashboard Requester" }),
    createTestUser({ role: "Requester", name: "Dashboard Other Requester" }),
    createTestUser({ role: "Requester", name: "Dashboard Empty Requester" }),
    createTestUser({ role: "ITStaff", name: "Dashboard Staff" }),
    createTestUser({ role: "Administrator", name: "Dashboard Admin" }),
    prisma.category.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
  ]);

  requesterId = requester.id;
  otherRequesterId = otherRequester.id;
  categoryId = category.id;
  systemId = system.id;

  [requesterAgent, otherRequesterAgent, emptyRequesterAgent, staffAgent, adminAgent] = await Promise.all([
    loginAgent(app, { email: requester.email, password: requester.password }),
    loginAgent(app, { email: otherRequester.email, password: otherRequester.password }),
    loginAgent(app, { email: emptyRequester.email, password: emptyRequester.password }),
    loginAgent(app, { email: staff.email, password: staff.password }),
    loginAgent(app, { email: admin.email, password: admin.password }),
  ]);
});

afterAll(async () => {
  await removeFixtures();
  await removeTestUsers();
  await prisma.$disconnect();
});

describe("GET /api/dashboard/requester — empty state (AC-26)", () => {
  it("returns 0 counts and [] lists for a Requester with no tickets, never null", async () => {
    const res = await emptyRequesterAgent.get("/api/dashboard/requester");
    expect(res.status).toBe(200);
    expect(res.body.timeZone).toBe("Asia/Bangkok");
    for (const m of res.body.metrics) {
      expect(m.value).toBe(0);
    }
    expect(res.body.needsAttention).toEqual([]);
    expect(res.body.recentTickets).toEqual([]);
  });
});

describe("GET /api/dashboard/requester — scoping (AC-02)", () => {
  it("only counts and lists the authenticated Requester's own tickets", async () => {
    await createTicket(requesterId, { summary: "mine new" });
    await createTicket(requesterId, { summary: "mine in progress", currentStatus: "InProgress" });
    await createTicket(otherRequesterId, { summary: "not mine new" });
    await createTicket(otherRequesterId, { summary: "not mine in progress", currentStatus: "InProgress" });

    const res = await requesterAgent.get("/api/dashboard/requester");
    expect(res.status).toBe(200);

    const myOpen = res.body.metrics.find((m: { key: string }) => m.key === "myOpen");
    expect(myOpen.value).toBe(2);

    for (const t of [...res.body.recentTickets, ...res.body.needsAttention]) {
      expect(t.summary).not.toMatch(/not mine/);
    }
  });

  it("cannot read another Requester's data — an extra ticket for someone else never changes my count", async () => {
    const before = await requesterAgent.get("/api/dashboard/requester");
    const beforeMyOpen = before.body.metrics.find((m: { key: string }) => m.key === "myOpen").value;

    // The endpoint takes no requesterId param at all; it can only ever read
    // from the session. Adding tickets for someone else must not move it.
    await createTicket(otherRequesterId, { summary: "someone else again" });
    await createTicket(otherRequesterId, { summary: "someone else again 2", currentStatus: "InProgress" });

    const after = await requesterAgent.get("/api/dashboard/requester");
    const afterMyOpen = after.body.metrics.find((m: { key: string }) => m.key === "myOpen").value;
    expect(afterMyOpen).toBe(beforeMyOpen);
  });
});

describe("GET /api/dashboard/requester — metrics and drill-down (AC-25)", () => {
  it("every metric value equals the total of its own drill-down list", async () => {
    await createTicket(requesterId, { summary: "drill waiting", currentStatus: "WaitingForRequester" });
    await createTicket(requesterId, { summary: "drill resolved", currentStatus: "Resolved" });
    await createTicket(requesterId, { summary: "drill closed", currentStatus: "Closed" });

    const dash = await requesterAgent.get("/api/dashboard/requester");
    expect(dash.status).toBe(200);

    for (const m of dash.body.metrics) {
      const params = new URLSearchParams(drillDownParams(m.drillDown));
      const list = await requesterAgent.get(`/api/tickets/mine?${params.toString()}`);
      expect(list.status, m.key).toBe(200);
      expect(list.body.meta.totalItems, `${m.key}: ${m.drillDown}`).toBe(m.value);
    }
  });

  it("caps needsAttention and recentTickets at 5, and never returns a full collection", async () => {
    for (let i = 0; i < 8; i++) {
      await createTicket(requesterId, { summary: `bulk waiting ${i}`, currentStatus: "WaitingForRequester" });
    }
    const res = await requesterAgent.get("/api/dashboard/requester");
    expect(res.body.needsAttention.length).toBeLessThanOrEqual(5);
    expect(res.body.recentTickets.length).toBeLessThanOrEqual(5);
  });
});

describe("GET /api/dashboard/requester — authorization (AC-27)", () => {
  it("returns 403 for ITStaff and Administrator", async () => {
    expect((await staffAgent.get("/api/dashboard/requester")).status).toBe(403);
    expect((await adminAgent.get("/api/dashboard/requester")).status).toBe(403);
  });

  it("returns 401 unauthenticated", async () => {
    const res = await request(app).get("/api/dashboard/requester");
    expect(res.status).toBe(401);
  });
});
