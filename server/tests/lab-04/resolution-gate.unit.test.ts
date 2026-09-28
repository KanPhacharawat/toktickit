import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { checkResolutionGate } from "../../src/resolutionGate.js";
import { createTestUser, removeTestUsers } from "../lab-03/helpers.js";

// U-03 — specification.md §5.3 BR-20, FR-13, AC-18. The resolution gate
// function in isolation from the HTTP layer.

const prisma = getPrisma();
const TAG = "[resolution-gate-test]";

let staffId: number;
let requesterId: number;
let categoryId: number;
let systemId: number;

async function createTicket() {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TT-GATE-${Math.random().toString(36).slice(2, 10)}`,
      requesterId,
      categoryId,
      relatedSystemId: systemId,
      summary: `${TAG} gate fixture`,
      description: "Created by the resolution gate unit test.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "InProgress",
    },
    select: { id: true },
  });
  return ticket.id;
}

async function addAction(
  ticketId: number,
  overrides: { status: "Planned" | "Completed"; followUpRequired?: boolean },
) {
  await prisma.actionTaken.create({
    data: {
      ticketId,
      actionAt: new Date(),
      description: "Gate fixture action.",
      status: overrides.status,
      result: overrides.status === "Completed" ? "Done." : null,
      followUpRequired: overrides.followUpRequired ?? false,
      followUpNote: overrides.followUpRequired ? "Check again." : null,
      performedById: staffId,
      createdById: staffId,
      clientRequestId: randomUUID(),
    },
  });
}

beforeAll(async () => {
  const [staff, requester, category, system] = await Promise.all([
    createTestUser({ role: "ITStaff", name: "Gate Staff" }),
    createTestUser({ role: "Requester", name: "Gate Requester" }),
    prisma.category.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
  ]);
  staffId = staff.id;
  requesterId = requester.id;
  categoryId = category.id;
  systemId = system.id;
});

afterAll(async () => {
  await prisma.actionTaken.deleteMany({ where: { ticket: { summary: { contains: TAG } } } });
  await prisma.ticket.deleteMany({ where: { summary: { contains: TAG } } });
  await removeTestUsers();
  await prisma.$disconnect();
});

describe("U-03 — checkResolutionGate (BR-20, AC-18)", () => {
  it("fails every check on an unowned ticket with no actions", async () => {
    const ticketId = await createTicket();
    const gate = await checkResolutionGate(ticketId, false, false);

    expect(gate.passed).toBe(false);
    expect(gate.checks).toEqual([
      { id: "HAS_OWNER", passed: false },
      { id: "HAS_COMPLETED_ACTION", passed: false },
      { id: "NO_PLANNED_ACTIONS", passed: true },
      { id: "FOLLOW_UPS_ACKNOWLEDGED", passed: true, requiresAcknowledgement: false },
    ]);
  });

  it("fails NO_PLANNED_ACTIONS when a Planned action exists, even with a Completed one", async () => {
    const ticketId = await createTicket();
    await addAction(ticketId, { status: "Completed" });
    await addAction(ticketId, { status: "Planned" });

    const gate = await checkResolutionGate(ticketId, true, false);
    expect(gate.passed).toBe(false);
    const planned = gate.checks.find((c) => c.id === "NO_PLANNED_ACTIONS");
    expect(planned?.passed).toBe(false);
  });

  it("requires acknowledgement when a Completed action has an outstanding follow-up", async () => {
    const ticketId = await createTicket();
    await addAction(ticketId, { status: "Completed", followUpRequired: true });

    const unacknowledged = await checkResolutionGate(ticketId, true, false);
    expect(unacknowledged.passed).toBe(false);
    expect(unacknowledged.checks.find((c) => c.id === "FOLLOW_UPS_ACKNOWLEDGED")).toEqual({
      id: "FOLLOW_UPS_ACKNOWLEDGED",
      passed: false,
      requiresAcknowledgement: true,
    });

    const acknowledged = await checkResolutionGate(ticketId, true, true);
    expect(acknowledged.passed).toBe(true);
    expect(acknowledged.checks.find((c) => c.id === "FOLLOW_UPS_ACKNOWLEDGED")).toEqual({
      id: "FOLLOW_UPS_ACKNOWLEDGED",
      passed: true,
      requiresAcknowledgement: true,
    });
  });

  it("passes when owned, one Completed action, nothing Planned, and no outstanding follow-up", async () => {
    const ticketId = await createTicket();
    await addAction(ticketId, { status: "Completed" });

    const gate = await checkResolutionGate(ticketId, true, false);
    expect(gate.passed).toBe(true);
    expect(gate.checks.every((c) => c.passed)).toBe(true);
  });
});
