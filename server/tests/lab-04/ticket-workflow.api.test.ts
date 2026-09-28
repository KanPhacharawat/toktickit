import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAgent, type AuthedAgent } from "../authHelper.js";
import { createTestUser, removeTestUsers } from "../lab-03/helpers.js";

// Ticket Workflow API — specification.md §4.2/§5.3, api-spec.md §3,
// tests.md A-02. `/transitions`, `POST /status`, `/requester-resolution`,
// `/status-history`, exercised as direct API calls so the matrix and the
// resolution gate cannot be bypassed by skipping the UI.

const prisma = getPrisma();
const TAG = "[workflow-api-test]";

let requesterId: number;
let requesterAgent: AuthedAgent;
let otherRequesterAgent: AuthedAgent;
let staff1Id: number;
let staff1Agent: AuthedAgent;
let staff2Id: number;
let staff2Agent: AuthedAgent;
let adminAgent: AuthedAgent;
let categoryId: number;
let systemId: number;

async function removeFixtures() {
  await prisma.ticketStatusHistory.deleteMany({ where: { ticket: { summary: { contains: TAG } } } });
  await prisma.actionTaken.deleteMany({ where: { ticket: { summary: { contains: TAG } } } });
  await prisma.ticket.deleteMany({ where: { summary: { contains: TAG } } });
}

async function createTicket(overrides: {
  summary: string;
  currentStatus?: string;
  ticketOwnerId?: number | null;
}) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TT-WF-${Math.random().toString(36).slice(2, 10)}`,
      requesterId,
      categoryId,
      relatedSystemId: systemId,
      summary: `${TAG} ${overrides.summary}`,
      description: "Created by the Ticket Workflow API test suite.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: (overrides.currentStatus ?? "New") as never,
      ticketOwnerId: overrides.ticketOwnerId ?? null,
    },
    select: { id: true, version: true, createdAt: true },
  });
  return ticket;
}

async function completedAction(ticketId: number, followUpRequired = false) {
  return prisma.actionTaken.create({
    data: {
      ticketId,
      actionAt: new Date(),
      description: "Fix applied.",
      status: "Completed",
      result: "Confirmed working.",
      followUpRequired,
      followUpNote: followUpRequired ? "Check again next week." : null,
      performedById: staff1Id,
      createdById: staff1Id,
      clientRequestId: randomUUID(),
    },
  });
}

async function plannedAction(ticketId: number) {
  return prisma.actionTaken.create({
    data: {
      ticketId,
      actionAt: new Date(),
      description: "Still planned.",
      status: "Planned",
      performedById: staff1Id,
      createdById: staff1Id,
      clientRequestId: randomUUID(),
    },
  });
}

beforeAll(async () => {
  const [requester, otherRequester, staff1, staff2, admin, category, system] = await Promise.all([
    createTestUser({ role: "Requester", name: "Workflow Requester" }),
    createTestUser({ role: "Requester", name: "Workflow Other Requester" }),
    createTestUser({ role: "ITStaff", name: "Workflow Staff One" }),
    createTestUser({ role: "ITStaff", name: "Workflow Staff Two" }),
    createTestUser({ role: "Administrator", name: "Workflow Admin" }),
    prisma.category.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
  ]);

  requesterId = requester.id;
  staff1Id = staff1.id;
  staff2Id = staff2.id;
  categoryId = category.id;
  systemId = system.id;

  [requesterAgent, otherRequesterAgent, staff1Agent, staff2Agent, adminAgent] = await Promise.all([
    loginAgent(app, { email: requester.email, password: requester.password }),
    loginAgent(app, { email: otherRequester.email, password: otherRequester.password }),
    loginAgent(app, { email: staff1.email, password: staff1.password }),
    loginAgent(app, { email: staff2.email, password: staff2.password }),
    loginAgent(app, { email: admin.email, password: admin.password }),
  ]);
});

afterAll(async () => {
  await removeFixtures();
  await removeTestUsers();
  await prisma.$disconnect();
});

describe("GET /api/tickets/:ticketId/transitions (§3.1, AC-22)", () => {
  it("returns 404 for a Requester who does not own the ticket", async () => {
    const ticket = await createTicket({ summary: "transitions not owned" });
    const res = await otherRequesterAgent.get(`/api/tickets/${ticket.id}/transitions`);
    expect(res.status).toBe(404);
  });

  it("omits owner-required targets on an unassigned New ticket for staff", async () => {
    const ticket = await createTicket({ summary: "transitions unassigned" });
    const res = await staff1Agent.get(`/api/tickets/${ticket.id}/transitions`);
    expect(res.status).toBe(200);
    const targets = res.body.transitions.map((t: { to: string }) => t.to);
    expect(targets.sort()).toEqual(["Cancelled", "Open"]);
  });

  it("includes InProgress once the ticket has an owner", async () => {
    const ticket = await createTicket({ summary: "transitions owned", ticketOwnerId: staff1Id });
    const res = await staff1Agent.get(`/api/tickets/${ticket.id}/transitions`);
    expect(res.status).toBe(200);
    const targets = res.body.transitions.map((t: { to: string }) => t.to);
    expect(targets.sort()).toEqual(["Cancelled", "InProgress", "Open"]);
  });

  it("returns an empty list on a terminal ticket", async () => {
    const ticket = await createTicket({ summary: "transitions terminal", currentStatus: "Closed" });
    const res = await staff1Agent.get(`/api/tickets/${ticket.id}/transitions`);
    expect(res.status).toBe(200);
    expect(res.body.transitions).toEqual([]);
  });

  it("shows only New -> Cancelled for the owning Requester", async () => {
    const ticket = await createTicket({ summary: "transitions requester new" });
    const res = await requesterAgent.get(`/api/tickets/${ticket.id}/transitions`);
    expect(res.status).toBe(200);
    expect(res.body.transitions.map((t: { to: string }) => t.to)).toEqual(["Cancelled"]);
  });

  it("includes a gate preview with failing checks when moving to Resolved", async () => {
    const ticket = await createTicket({
      summary: "transitions gate preview",
      currentStatus: "InProgress",
      ticketOwnerId: staff1Id,
    });
    const res = await staff1Agent.get(`/api/tickets/${ticket.id}/transitions`);
    const resolved = res.body.transitions.find((t: { to: string }) => t.to === "Resolved");
    expect(resolved.requiresReason).toBe(true);
    expect(resolved.gate.passed).toBe(false);
    expect(resolved.gate.checks.find((c: { id: string }) => c.id === "HAS_COMPLETED_ACTION").passed).toBe(
      false,
    );
  });

  it("reports requesterCanIndicateResolved only for the owning Requester in an eligible status", async () => {
    const inProgress = await createTicket({ summary: "transitions requester eligible", currentStatus: "InProgress" });
    const res = await requesterAgent.get(`/api/tickets/${inProgress.id}/transitions`);
    expect(res.body.requesterCanIndicateResolved).toBe(true);

    const staffRes = await staff1Agent.get(`/api/tickets/${inProgress.id}/transitions`);
    expect(staffRes.body.requesterCanIndicateResolved).toBe(false);

    const newTicket = await createTicket({ summary: "transitions requester ineligible" });
    const newRes = await requesterAgent.get(`/api/tickets/${newTicket.id}/transitions`);
    expect(newRes.body.requesterCanIndicateResolved).toBe(false);
  });
});

describe("POST /api/tickets/:ticketId/status — permitted matrix cells (AC-16)", () => {
  it("walks the full documented staff path, writing one history row per step", async () => {
    const ticket = await createTicket({ summary: "full staff walk", ticketOwnerId: staff1Id });
    let version = ticket.version;

    const steps: Array<{ to: string; reason?: string; setup?: () => Promise<unknown> }> = [
      { to: "Open" },
      { to: "InProgress" },
      { to: "WaitingForRequester" },
      { to: "InProgress" },
      { to: "Resolved", reason: "Fixed and verified.", setup: () => completedAction(ticket.id) },
      { to: "Reopened", reason: "Issue came back." },
      { to: "InProgress" },
      { to: "Resolved", reason: "Fixed again.", setup: () => completedAction(ticket.id) },
      { to: "Closed" },
    ];

    for (const step of steps) {
      if (step.setup) await step.setup();
      const res = await staff1Agent
        .post(`/api/tickets/${ticket.id}/status`)
        .send({ version, toStatus: step.to, reason: step.reason });
      expect(res.status, `-> ${step.to}: ${JSON.stringify(res.body)}`).toBe(200);
      expect(res.body.ticket.currentStatus).toBe(step.to);
      version = res.body.ticket.version;
    }

    const history = await prisma.ticketStatusHistory.findMany({
      where: { ticketId: ticket.id },
      orderBy: { id: "asc" },
    });
    expect(history).toHaveLength(steps.length);
    expect(history.map((h) => h.toStatus)).toEqual(steps.map((s) => s.to));
  });

  it("lets the owning Requester cancel their own New ticket", async () => {
    const ticket = await createTicket({ summary: "requester cancels new" });
    const res = await requesterAgent
      .post(`/api/tickets/${ticket.id}/status`)
      .send({ version: ticket.version, toStatus: "Cancelled", reason: "No longer needed." });

    expect(res.status).toBe(200);
    expect(res.body.ticket.currentStatus).toBe("Cancelled");
    expect(res.body.ticket.cancelledAt).not.toBeNull();
    expect(res.body.ticket.cancelReason).toBe("No longer needed.");
  });

  it("lets the owning Requester reopen their own Resolved ticket", async () => {
    const ticket = await createTicket({
      summary: "requester reopens resolved",
      currentStatus: "InProgress",
      ticketOwnerId: staff1Id,
    });
    await completedAction(ticket.id);
    const resolve = await staff1Agent
      .post(`/api/tickets/${ticket.id}/status`)
      .send({ version: ticket.version, toStatus: "Resolved", reason: "Fixed." });
    expect(resolve.status).toBe(200);

    const reopen = await requesterAgent
      .post(`/api/tickets/${ticket.id}/status`)
      .send({ version: resolve.body.ticket.version, toStatus: "Reopened", reason: "Still broken." });
    expect(reopen.status).toBe(200);
    expect(reopen.body.ticket.currentStatus).toBe("Reopened");
    expect(reopen.body.ticket.resolvedAt).toBeNull();
  });

  it("writes exactly one history row per successful change, with actor and reason", async () => {
    const ticket = await createTicket({ summary: "single history row", ticketOwnerId: staff1Id });
    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/status`)
      .send({ version: ticket.version, toStatus: "Open" });
    expect(res.status).toBe(200);
    expect(res.body.history).toMatchObject({
      fromStatus: "New",
      toStatus: "Open",
      actor: { id: staff1Id },
    });

    const rows = await prisma.ticketStatusHistory.count({ where: { ticketId: ticket.id } });
    expect(rows).toBe(1);
  });
});

describe("POST /api/tickets/:ticketId/status — disallowed transitions (AC-17)", () => {
  it("returns 422 INVALID_TRANSITION for every non-matrix cell, direct API call", async () => {
    const ticket = await createTicket({ summary: "skip ahead", ticketOwnerId: staff1Id });
    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/status`)
      .send({ version: ticket.version, toStatus: "Closed", reason: "Skipping ahead." });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.currentStatus).toBe("New");
    expect(await prisma.ticketStatusHistory.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it("returns 422 INVALID_TRANSITION from a terminal ticket regardless of role", async () => {
    const ticket = await createTicket({ summary: "terminal locked", currentStatus: "Closed" });
    for (const agent of [staff1Agent, adminAgent, requesterAgent]) {
      const res = await agent
        .post(`/api/tickets/${ticket.id}/status`)
        .send({ version: ticket.version, toStatus: "Open" });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("INVALID_TRANSITION");
    }
  });

  it("returns 403 FORBIDDEN (not 422) when the cell exists for another actor only", async () => {
    // Resolved -> Closed exists in the matrix, but only for Staff.
    const ticket = await createTicket({
      summary: "requester forbidden close",
      currentStatus: "Resolved",
      ticketOwnerId: staff1Id,
    });
    const res = await requesterAgent
      .post(`/api/tickets/${ticket.id}/status`)
      .send({ version: ticket.version, toStatus: "Closed" });
    expect(res.status).toBe(403);

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.currentStatus).toBe("Resolved");
  });

  it("bypassing the UI cannot skip the matrix: a Requester cannot force InProgress", async () => {
    const ticket = await createTicket({ summary: "requester bypass attempt", ticketOwnerId: staff1Id });
    const res = await requesterAgent
      .post(`/api/tickets/${ticket.id}/status`)
      .send({ version: ticket.version, toStatus: "InProgress" });
    expect([403, 422]).toContain(res.status);

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.currentStatus).toBe("New");
  });

  it("returns 422 when an owner-required target has no owner", async () => {
    const ticket = await createTicket({ summary: "owner required" });
    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/status`)
      .send({ version: ticket.version, toStatus: "InProgress" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
  });
});

describe("POST /api/tickets/:ticketId/status — resolution gate (AC-18)", () => {
  it("lists every failing condition when nothing has been done yet", async () => {
    const ticket = await createTicket({
      summary: "gate empty",
      currentStatus: "InProgress",
      ticketOwnerId: staff1Id,
    });
    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/status`)
      .send({ version: ticket.version, toStatus: "Resolved", reason: "Trying anyway." });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("RESOLUTION_GATE_FAILED");
    const checks = res.body.error.details.map((d: { check: string }) => d.check);
    expect(checks).toContain("HAS_COMPLETED_ACTION");

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.currentStatus).toBe("InProgress");
  });

  it("fails while an action is still Planned, even with a Completed one", async () => {
    const ticket = await createTicket({
      summary: "gate planned blocks",
      currentStatus: "InProgress",
      ticketOwnerId: staff1Id,
    });
    await completedAction(ticket.id);
    await plannedAction(ticket.id);

    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/status`)
      .send({ version: ticket.version, toStatus: "Resolved", reason: "Should fail." });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("RESOLUTION_GATE_FAILED");
    expect(res.body.error.details.map((d: { check: string }) => d.check)).toContain(
      "NO_PLANNED_ACTIONS",
    );
  });

  it("fails on an unacknowledged follow-up and succeeds once acknowledged", async () => {
    const ticket = await createTicket({
      summary: "gate follow-up ack",
      currentStatus: "InProgress",
      ticketOwnerId: staff1Id,
    });
    await completedAction(ticket.id, true);

    const unacked = await staff1Agent
      .post(`/api/tickets/${ticket.id}/status`)
      .send({ version: ticket.version, toStatus: "Resolved", reason: "Not yet." });
    expect(unacked.status).toBe(422);
    expect(unacked.body.error.details.map((d: { check: string }) => d.check)).toContain(
      "FOLLOW_UPS_ACKNOWLEDGED",
    );

    const acked = await staff1Agent.post(`/api/tickets/${ticket.id}/status`).send({
      version: ticket.version,
      toStatus: "Resolved",
      reason: "Confirmed with follow-up noted.",
      followUpAcknowledged: true,
    });
    expect(acked.status).toBe(200);
    expect(acked.body.ticket.currentStatus).toBe("Resolved");
    expect(acked.body.ticket.resolutionSummary).toBe("Confirmed with follow-up noted.");
  });

  it("requires a reason to move to Resolved (400, before the gate is even checked)", async () => {
    const ticket = await createTicket({
      summary: "gate missing reason",
      currentStatus: "InProgress",
      ticketOwnerId: staff1Id,
    });
    await completedAction(ticket.id);

    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/status`)
      .send({ version: ticket.version, toStatus: "Resolved" });
    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors).toHaveProperty("reason");
  });
});

describe("POST /api/tickets/:ticketId/status — stale version (AC-21)", () => {
  it("returns 409 STALE_UPDATE with the current ticket and applies nothing", async () => {
    const ticket = await createTicket({ summary: "stale version", ticketOwnerId: staff1Id });
    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/status`)
      .send({ version: ticket.version + 5, toStatus: "Open" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("STALE_UPDATE");
    expect(res.body.current).toMatchObject({ id: ticket.id, currentStatus: "New" });

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.currentStatus).toBe("New");
    expect(await prisma.ticketStatusHistory.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it("returns 409 for two concurrent requests racing on the same version; only one applies", async () => {
    const ticket = await createTicket({ summary: "race condition", ticketOwnerId: staff1Id });

    const [a, b] = await Promise.all([
      staff1Agent.post(`/api/tickets/${ticket.id}/status`).send({ version: ticket.version, toStatus: "Open" }),
      staff2Agent.post(`/api/tickets/${ticket.id}/status`).send({ version: ticket.version, toStatus: "Open" }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await prisma.ticketStatusHistory.count({ where: { ticketId: ticket.id } })).toBe(1);
  });
});

describe("POST /api/tickets/:ticketId/requester-resolution (§3.3, AC-19)", () => {
  it("does not change status and is idempotent", async () => {
    const ticket = await createTicket({ summary: "requester resolution advisory", currentStatus: "InProgress" });

    const first = await requesterAgent.post(`/api/tickets/${ticket.id}/requester-resolution`).send({});
    expect(first.status).toBe(200);
    expect(first.body.currentStatus).toBe("InProgress");
    expect(first.body.requesterResolvedIndicatedAt).not.toBeNull();

    const second = await requesterAgent.post(`/api/tickets/${ticket.id}/requester-resolution`).send({});
    expect(second.status).toBe(200);
    expect(second.body.requesterResolvedIndicatedAt).toBe(first.body.requesterResolvedIndicatedAt);

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.currentStatus).toBe("InProgress");
  });

  it("returns 403 for IT Staff and Administrator", async () => {
    const ticket = await createTicket({ summary: "requester resolution staff forbidden", currentStatus: "InProgress" });
    expect((await staff1Agent.post(`/api/tickets/${ticket.id}/requester-resolution`).send({})).status).toBe(403);
    expect((await adminAgent.post(`/api/tickets/${ticket.id}/requester-resolution`).send({})).status).toBe(403);
  });

  it("returns 422 INVALID_TRANSITION when the status is not eligible", async () => {
    const ticket = await createTicket({ summary: "requester resolution ineligible status" });
    const res = await requesterAgent.post(`/api/tickets/${ticket.id}/requester-resolution`).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
  });
});

describe("Requester Reopen / Closed hides controls (AC-20)", () => {
  it("a Closed ticket has no available transitions for the owning Requester", async () => {
    const ticket = await createTicket({ summary: "closed hides controls", currentStatus: "Closed" });
    const res = await requesterAgent.get(`/api/tickets/${ticket.id}/transitions`);
    expect(res.status).toBe(200);
    expect(res.body.transitions).toEqual([]);
  });
});

describe("GET /api/tickets/:ticketId/status-history (§3.4, AC-23)", () => {
  it("lists rows oldest -> newest and matches the actual transitions made", async () => {
    const ticket = await createTicket({ summary: "history order", ticketOwnerId: staff1Id });
    let version = ticket.version;

    for (const toStatus of ["Open", "InProgress", "WaitingForRequester"]) {
      const res = await staff1Agent
        .post(`/api/tickets/${ticket.id}/status`)
        .send({ version, toStatus });
      expect(res.status).toBe(200);
      version = res.body.ticket.version;
    }

    const history = await staff1Agent.get(`/api/tickets/${ticket.id}/status-history`);
    expect(history.status).toBe(200);
    expect(history.body.items.map((h: { toStatus: string }) => h.toStatus)).toEqual([
      "Open",
      "InProgress",
      "WaitingForRequester",
    ]);
    expect(history.body.items[0].actor).toMatchObject({ id: staff1Id });
  });

  it("is readable by the owning Requester, and 404 for a non-owning Requester", async () => {
    const ticket = await createTicket({ summary: "history requester access" });
    const own = await requesterAgent.get(`/api/tickets/${ticket.id}/status-history`);
    expect(own.status).toBe(200);

    const other = await otherRequesterAgent.get(`/api/tickets/${ticket.id}/status-history`);
    expect(other.status).toBe(404);
  });

  it("has no write, edit, or delete route", async () => {
    const ticket = await createTicket({ summary: "history no write route" });
    for (const method of ["post", "patch", "delete"] as const) {
      const res = await staff1Agent[method](`/api/tickets/${ticket.id}/status-history`);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).not.toBe(200);
    }
  });
});

describe("Lab 3's PATCH /api/tickets/:ticketId/status is retired (api-spec.md §3.2/§7)", () => {
  it("returns 404 and cannot be used to bypass the matrix or the gate", async () => {
    const ticket = await createTicket({ summary: "old route retired", ticketOwnerId: staff1Id });
    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/status`)
      .send({ currentStatus: "Open" });
    expect(res.status).toBe(404);

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.currentStatus).toBe("New");
  });
});

describe("Error responses never leak internals", () => {
  it("every triggered error is the documented { error: { code, message } } envelope only", async () => {
    const ticket = await createTicket({ summary: "safe errors", ticketOwnerId: staff1Id });
    const responses = [
      await otherRequesterAgent.get(`/api/tickets/${ticket.id}/transitions`),
      await staff1Agent.post(`/api/tickets/${ticket.id}/status`).send({}),
      await requesterAgent.post(`/api/tickets/${ticket.id}/status`).send({ version: 1, toStatus: "Closed" }),
    ];

    for (const res of responses) {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.error).toBeDefined();
      expect(typeof res.body.error.code).toBe("string");
      expect(typeof res.body.error.message).toBe("string");
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toMatch(/at [A-Za-z0-9_.]+\s*\(/);
      expect(serialized.toLowerCase()).not.toMatch(/select .* from|insert into|prismaclientknownrequesterror/i);
    }
  });
});
