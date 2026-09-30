import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAgent, type AuthedAgent } from "../authHelper.js";
import { createTestUser, removeTestUsers } from "../lab-03/helpers.js";

// A-09 — docs/lab-04/tests.md §2, api-spec.md §7 note 1. Lab 3's
// PATCH /api/tickets/:ticketId/status is retired by Lab 4; POST
// /api/tickets/:ticketId/status (server/tests/lab-04/ticket-workflow.api.test.ts)
// is now the only way to change status. Neither legacy shape survives, and
// neither can be used to slip past the resolution gate.

const prisma = getPrisma();
const TAG = "[legacy-status-test]";

let staff1Id: number;
let staff1Agent: AuthedAgent;
let requesterAgent: AuthedAgent;
let categoryId: number;
let systemId: number;
let requesterId: number;

async function removeFixtures() {
  await prisma.ticket.deleteMany({ where: { summary: { contains: TAG } } });
}

async function createTicket(overrides: { summary: string; ticketOwnerId?: number | null } = { summary: "" }) {
  return prisma.ticket.create({
    data: {
      ticketNumber: `TT-LGY-${Math.random().toString(36).slice(2, 10)}`,
      requesterId,
      categoryId,
      relatedSystemId: systemId,
      summary: `${TAG} ${overrides.summary}`,
      description: "Created by the legacy-status-route test.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "InProgress" as never,
      ticketOwnerId: overrides.ticketOwnerId ?? null,
    },
    select: { id: true, currentStatus: true, version: true },
  });
}

beforeAll(async () => {
  const [requester, staff1, category, system] = await Promise.all([
    createTestUser({ role: "Requester", name: "Legacy Requester" }),
    createTestUser({ role: "ITStaff", name: "Legacy Staff" }),
    prisma.category.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
  ]);
  requesterId = requester.id;
  staff1Id = staff1.id;
  categoryId = category.id;
  systemId = system.id;

  requesterAgent = await loginAgent(app, { email: requester.email, password: requester.password });
  staff1Agent = await loginAgent(app, { email: staff1.email, password: staff1.password });

  await removeFixtures();
});

afterEach(removeFixtures);

afterAll(async () => {
  await removeTestUsers();
  await prisma.$disconnect();
});

describe("PATCH /api/tickets/:ticketId/status is retired", () => {
  it("returns 404 and never changes the ticket, for staff and the ticket's own Requester", async () => {
    const ticket = await createTicket({ summary: "old status route", ticketOwnerId: staff1Id });

    for (const agent of [staff1Agent, requesterAgent]) {
      const res = await agent
        .patch(`/api/tickets/${ticket.id}/status`)
        .send({ currentStatus: "Resolved" });
      expect(res.status).toBe(404);
    }

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.currentStatus).toBe("InProgress");
  });

  it("cannot bypass the resolution gate: an owned, action-less ticket is still not Resolved afterward", async () => {
    const ticket = await createTicket({ summary: "gate bypass attempt", ticketOwnerId: staff1Id });

    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/status`)
      .send({ currentStatus: "Resolved", resolutionSummary: "Forcing it through the old route." });
    expect(res.status).toBe(404);

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.currentStatus).toBe("InProgress");
    expect(stored.resolutionSummary).toBeNull();
  });
});

describe("PATCH /api/tickets/:ticketId with a status field is not a route either", () => {
  it("returns 404 — there is no generic PATCH /api/tickets/:ticketId endpoint", async () => {
    const ticket = await createTicket({ summary: "generic patch attempt", ticketOwnerId: staff1Id });

    const res = await staff1Agent.patch(`/api/tickets/${ticket.id}`).send({ status: "Resolved" });
    expect(res.status).toBe(404);

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.currentStatus).toBe("InProgress");
  });
});
