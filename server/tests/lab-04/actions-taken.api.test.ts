import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAgent, type AuthedAgent } from "../authHelper.js";
import { createTestUser, removeTestUsers } from "../lab-03/helpers.js";

// Actions Taken API — specification.md §4.1/§5.1, api-spec.md §2, tests.md
// A-01, ID-01, AU-01 (partial).

const prisma = getPrisma();
const TAG = "[actions-api-test]";

let requesterId: number;
let requesterAgent: AuthedAgent;
let otherRequesterAgent: AuthedAgent;
let staff1Id: number;
let staff1Agent: AuthedAgent;
let staff2Id: number;
let staff2Agent: AuthedAgent;
let adminAgent: AuthedAgent;
let inactiveStaffId: number;
let requesterActorId: number; // a Requester user id, used as an invalid performer
let categoryId: number;
let systemId: number;

async function removeFixtures() {
  // ActionTaken.ticketId is onDelete: Restrict (DD-03 append-only), so
  // fixture actions must go first.
  await prisma.actionTaken.deleteMany({ where: { ticket: { summary: { contains: TAG } } } });
  await prisma.ticket.deleteMany({ where: { summary: { contains: TAG } } });
}

async function createTicket(overrides: {
  summary: string;
  currentStatus?: string;
  ticketOwnerId?: number | null;
  createdAt?: Date;
}) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TT-ACT-${Math.random().toString(36).slice(2, 10)}`,
      requesterId,
      categoryId,
      relatedSystemId: systemId,
      summary: `${TAG} ${overrides.summary}`,
      description: "Created by the Actions Taken API test suite.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: (overrides.currentStatus ?? "InProgress") as never,
      ticketOwnerId: overrides.ticketOwnerId ?? null,
      createdAt: overrides.createdAt,
    },
    select: { id: true, createdAt: true, version: true },
  });
  return ticket;
}

/** A valid create body an IT Staff/Administrator would send. */
function validCreateBody(overrides: Record<string, unknown> = {}) {
  return {
    clientRequestId: randomUUID(),
    // A bare `new Date()` here can land a millisecond or two before the
    // fixture ticket's own `createdAt` (Postgres's and Node's clocks aren't
    // synchronized to sub-millisecond precision), intermittently tripping
    // "Action date/time cannot be before the ticket was created." No real
    // user submits within a millisecond of creating a ticket; this small
    // forward pad is well inside the 5-minutes-future cap and removes the
    // flake without loosening the validation rule itself.
    actionAt: new Date(Date.now() + 50).toISOString(),
    description: "Investigated and applied a fix.",
    status: "Completed",
    result: "Issue resolved after applying the fix.",
    followUpRequired: false,
    ...overrides,
  };
}

beforeAll(async () => {
  const [requester, otherRequester, staff1, staff2, admin, inactiveStaff, category, system] =
    await Promise.all([
      createTestUser({ role: "Requester", name: "Actions Requester" }),
      createTestUser({ role: "Requester", name: "Actions Other Requester" }),
      createTestUser({ role: "ITStaff", name: "Actions Staff One" }),
      createTestUser({ role: "ITStaff", name: "Actions Staff Two" }),
      createTestUser({ role: "Administrator", name: "Actions Admin" }),
      createTestUser({ role: "ITStaff", name: "Actions Inactive Staff", isActive: false }),
      prisma.category.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
      prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
    ]);

  requesterId = requester.id;
  staff1Id = staff1.id;
  staff2Id = staff2.id;
  inactiveStaffId = inactiveStaff.id;
  requesterActorId = otherRequester.id;
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

describe("GET /api/tickets/:ticketId/actions", () => {
  it("returns Actions Taken in stable order (actionAt, createdAt, id)", async () => {
    const ticket = await createTicket({ summary: "stable order" });
    const base = ticket.createdAt.getTime() + 60_000;

    // Created out of order on purpose; the response must still be sorted.
    await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        actionAt: new Date(base + 2000),
        description: "Third by actionAt.",
        performedById: staff1Id,
        createdById: staff1Id,
        clientRequestId: randomUUID(),
      },
    });
    await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        actionAt: new Date(base),
        description: "First by actionAt.",
        performedById: staff1Id,
        createdById: staff1Id,
        clientRequestId: randomUUID(),
      },
    });
    await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        actionAt: new Date(base + 1000),
        description: "Second by actionAt.",
        performedById: staff1Id,
        createdById: staff1Id,
        clientRequestId: randomUUID(),
      },
    });

    const res = await staff1Agent.get(`/api/tickets/${ticket.id}/actions`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items.map((a: { description: string }) => a.description)).toEqual([
      "First by actionAt.",
      "Second by actionAt.",
      "Third by actionAt.",
    ]);
  });

  it("lets a Requester read Actions Taken on their own ticket, with createdBy/updatedBy hidden (AC-05)", async () => {
    const ticket = await createTicket({ summary: "requester read own", ticketOwnerId: staff1Id });
    await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        actionAt: new Date(Date.now() + 50), // padded — see validCreateBody() above
        description: "Visible to the requester.",
        performedById: staff1Id,
        createdById: staff1Id,
        clientRequestId: randomUUID(),
      },
    });

    const res = await requesterAgent.get(`/api/tickets/${ticket.id}/actions`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].performedBy).toMatchObject({ id: staff1Id });
    expect(res.body.items[0]).not.toHaveProperty("createdBy");
    expect(res.body.items[0]).not.toHaveProperty("updatedBy");
  });

  it("returns createdBy/updatedBy for IT Staff and Administrator", async () => {
    const ticket = await createTicket({ summary: "staff sees audit fields" });
    await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        actionAt: new Date(Date.now() + 50), // padded — see validCreateBody() above
        description: "Audited action.",
        performedById: staff1Id,
        createdById: staff2Id,
        clientRequestId: randomUUID(),
      },
    });

    const res = await staff1Agent.get(`/api/tickets/${ticket.id}/actions`);
    expect(res.status).toBe(200);
    expect(res.body.items[0].createdBy).toMatchObject({ id: staff2Id });
    expect(res.body.items[0]).toHaveProperty("updatedBy");
  });

  it("returns 404 for a Requester requesting a ticket they do not own (AC-06)", async () => {
    const ticket = await createTicket({ summary: "not owned by requester" });
    const res = await otherRequesterAgent.get(`/api/tickets/${ticket.id}/actions`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/tickets/:ticketId/actions (AC-01)", () => {
  it("creates an Action Taken under the correct ticket with the authenticated creator and approved performer", async () => {
    const ticket = await createTicket({ summary: "create basic" });

    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions`)
      .send(validCreateBody());

    expect(res.status).toBe(201);
    expect(res.body.data.ticketId).toBe(ticket.id);
    expect(res.body.data.createdBy).toMatchObject({ id: staff1Id });
    expect(res.body.data.performedBy).toMatchObject({ id: staff1Id });
    expect(res.body.data.status).toBe("Completed");
    expect(res.body.data.version).toBe(1);

    const stored = await prisma.actionTaken.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(stored.ticketId).toBe(ticket.id);
    expect(stored.createdById).toBe(staff1Id);
    expect(stored.performedById).toBe(staff1Id);
  });

  it("touches the Ticket's updatedAt so it surfaces as recently active", async () => {
    const ticket = await createTicket({ summary: "touches ticket updatedAt" });
    const before = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      select: { updatedAt: true },
    });

    await new Promise((r) => setTimeout(r, 10));
    const res = await staff1Agent.post(`/api/tickets/${ticket.id}/actions`).send(validCreateBody());
    expect(res.status).toBe(201);

    const after = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      select: { updatedAt: true },
    });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it("accepts an explicit active performedById different from the creator", async () => {
    const ticket = await createTicket({ summary: "explicit performer" });
    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions`)
      .send(validCreateBody({ performedById: staff2Id }));

    expect(res.status).toBe(201);
    expect(res.body.data.performedBy).toMatchObject({ id: staff2Id });
    expect(res.body.data.createdBy).toMatchObject({ id: staff1Id });
  });

  it("rejects an inactive performedById with 422 INACTIVE_OR_INVALID_ASSIGNEE (AC-07)", async () => {
    const ticket = await createTicket({ summary: "inactive performer" });
    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions`)
      .send(validCreateBody({ performedById: inactiveStaffId }));

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INACTIVE_OR_INVALID_ASSIGNEE");
    expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it("rejects a Requester performedById with 422 INACTIVE_OR_INVALID_ASSIGNEE (AC-07)", async () => {
    const ticket = await createTicket({ summary: "requester performer" });
    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions`)
      .send(validCreateBody({ performedById: requesterActorId }));

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INACTIVE_OR_INVALID_ASSIGNEE");
  });

  it("returns 400 when followUpRequired is true and followUpNote is empty (AC-08)", async () => {
    const ticket = await createTicket({ summary: "followup required" });
    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions`)
      .send(validCreateBody({ followUpRequired: true }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fieldErrors).toHaveProperty("followUpNote");
    expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it("accepts followUpRequired = true with a followUpNote", async () => {
    const ticket = await createTicket({ summary: "followup with note" });
    const res = await staff1Agent.post(`/api/tickets/${ticket.id}/actions`).send(
      validCreateBody({ followUpRequired: true, followUpNote: "Check back next week." }),
    );

    expect(res.status).toBe(201);
    expect(res.body.data.followUpRequired).toBe(true);
    expect(res.body.data.followUpNote).toBe("Check back next week.");
  });

  it("returns 400 when creating a Completed action without a result (AC-09)", async () => {
    const ticket = await createTicket({ summary: "completed without result" });
    const res = await staff1Agent.post(`/api/tickets/${ticket.id}/actions`).send(
      validCreateBody({ status: "Completed", result: undefined }),
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fieldErrors).toHaveProperty("result");
  });

  it("allows a Planned action without a result", async () => {
    const ticket = await createTicket({ summary: "planned without result" });
    const res = await staff1Agent.post(`/api/tickets/${ticket.id}/actions`).send(
      validCreateBody({ status: "Planned", result: undefined }),
    );

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("Planned");
  });

  it("returns 400 when actionAt is more than 5 minutes in the future (AC-15)", async () => {
    const ticket = await createTicket({ summary: "future actionAt" });
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions`)
      .send(validCreateBody({ actionAt: future }));

    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors).toHaveProperty("actionAt");
  });

  it("returns 400 when actionAt is before the ticket was created (AC-15)", async () => {
    const ticket = await createTicket({ summary: "actionAt before ticket" });
    const before = new Date(ticket.createdAt.getTime() - 60 * 60 * 1000).toISOString();
    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions`)
      .send(validCreateBody({ actionAt: before }));

    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors).toHaveProperty("actionAt");
  });

  it("returns 409 TICKET_LOCKED on a Closed ticket (AC-13)", async () => {
    const ticket = await createTicket({ summary: "closed locked", currentStatus: "Closed" });
    const res = await staff1Agent.post(`/api/tickets/${ticket.id}/actions`).send(validCreateBody());

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TICKET_LOCKED");
  });

  it("returns 409 TICKET_LOCKED on a Cancelled ticket (AC-13)", async () => {
    const ticket = await createTicket({ summary: "cancelled locked", currentStatus: "Cancelled" });
    const res = await staff1Agent.post(`/api/tickets/${ticket.id}/actions`).send(validCreateBody());

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TICKET_LOCKED");
  });

  it("returns 403 for a Requester and creates nothing (AC-04)", async () => {
    const ticket = await createTicket({ summary: "requester forbidden create" });
    const res = await requesterAgent.post(`/api/tickets/${ticket.id}/actions`).send(validCreateBody());

    expect(res.status).toBe(403);
    expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it("de-duplicates a repeated clientRequestId, creating only one row (AC-11)", async () => {
    const ticket = await createTicket({ summary: "idempotent create" });
    const body = validCreateBody();

    const first = await staff1Agent.post(`/api/tickets/${ticket.id}/actions`).send(body);
    expect(first.status).toBe(201);

    const second = await staff1Agent.post(`/api/tickets/${ticket.id}/actions`).send(body);
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);

    expect(
      await prisma.actionTaken.count({
        where: { ticketId: ticket.id, clientRequestId: body.clientRequestId },
      }),
    ).toBe(1);
  });

  it("de-duplicates concurrent requests with the same clientRequestId (AC-11)", async () => {
    const ticket = await createTicket({ summary: "idempotent concurrent create" });
    const body = validCreateBody();

    const [a, b] = await Promise.all([
      staff1Agent.post(`/api/tickets/${ticket.id}/actions`).send(body),
      staff1Agent.post(`/api/tickets/${ticket.id}/actions`).send(body),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(
      await prisma.actionTaken.count({
        where: { ticketId: ticket.id, clientRequestId: body.clientRequestId },
      }),
    ).toBe(1);
  });

  it("lets two different IT Staff record actions on the same ticket, each with its own performedBy", async () => {
    const ticket = await createTicket({ summary: "two staff same ticket" });

    const res1 = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions`)
      .send(validCreateBody({ description: "Staff one's action." }));
    const res2 = await staff2Agent
      .post(`/api/tickets/${ticket.id}/actions`)
      .send(validCreateBody({ description: "Staff two's action." }));

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.data.performedBy.id).toBe(staff1Id);
    expect(res2.body.data.performedBy.id).toBe(staff2Id);

    const list = await staff1Agent.get(`/api/tickets/${ticket.id}/actions`);
    expect(list.body.total).toBe(2);
    const performers = list.body.items.map((a: { performedBy: { id: number } }) => a.performedBy.id);
    expect(performers.sort()).toEqual([staff1Id, staff2Id].sort());
  });
});

describe("PATCH /api/tickets/:ticketId/actions/:actionId", () => {
  async function createAction(ticketId: number, overrides: Record<string, unknown> = {}) {
    return prisma.actionTaken.create({
      data: {
        ticketId,
        actionAt: new Date(Date.now() + 50), // padded — see validCreateBody() above
        description: "Original description.",
        result: "Original result.",
        status: "Completed",
        performedById: staff1Id,
        createdById: staff1Id,
        clientRequestId: randomUUID(),
        ...overrides,
      },
    });
  }

  it("edits with the current version and increments it", async () => {
    const ticket = await createTicket({ summary: "edit happy path" });
    const action = await createAction(ticket.id);

    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: 1, description: "Updated description." });

    expect(res.status).toBe(200);
    expect(res.body.data.description).toBe("Updated description.");
    expect(res.body.data.version).toBe(2);
    expect(res.body.data.updatedBy).toMatchObject({ id: staff1Id });
  });

  it("returns 409 STALE_UPDATE with the current record on a version mismatch (AC-10)", async () => {
    const ticket = await createTicket({ summary: "stale update" });
    const action = await createAction(ticket.id);

    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: 999, description: "Should not apply." });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("STALE_UPDATE");
    expect(res.body.current).toMatchObject({ id: action.id, description: "Original description." });

    const stillOriginal = await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } });
    expect(stillOriginal.description).toBe("Original description.");
  });

  it("returns 409 ACTION_LOCKED for a Cancelled action and shows the Cancelled status with reason (AC-12)", async () => {
    const ticket = await createTicket({ summary: "edit cancelled action" });
    const action = await createAction(ticket.id, {
      status: "Cancelled",
      cancelledAt: new Date(),
      cancelReason: "Duplicate entry.",
    });

    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: 1, description: "Attempted edit." });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ACTION_LOCKED");

    const view = await staff1Agent.get(`/api/tickets/${ticket.id}/actions`);
    const found = view.body.items.find((a: { id: number }) => a.id === action.id);
    expect(found.status).toBe("Cancelled");
    expect(found.cancelReason).toBe("Duplicate entry.");
  });

  it("returns 409 TICKET_LOCKED when the ticket is Closed (AC-13)", async () => {
    const ticket = await createTicket({ summary: "edit on closed ticket", currentStatus: "InProgress" });
    const action = await createAction(ticket.id);
    await prisma.ticket.update({ where: { id: ticket.id }, data: { currentStatus: "Closed" } });

    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: 1, description: "Should be blocked." });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TICKET_LOCKED");
  });

  it("returns 403 for a Requester and changes nothing (AC-04)", async () => {
    const ticket = await createTicket({ summary: "requester forbidden edit" });
    const action = await createAction(ticket.id);

    const res = await requesterAgent
      .patch(`/api/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: 1, description: "Should not apply." });

    expect(res.status).toBe(403);
    const stillOriginal = await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } });
    expect(stillOriginal.description).toBe("Original description.");
  });

  it("rejects an inactive performedById on edit with 422 (AC-07)", async () => {
    const ticket = await createTicket({ summary: "edit invalid performer" });
    const action = await createAction(ticket.id);

    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: 1, performedById: inactiveStaffId });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INACTIVE_OR_INVALID_ASSIGNEE");
  });

  it("re-validates the merged record: clearing result while Completed returns 400", async () => {
    const ticket = await createTicket({ summary: "clear result while completed" });
    const action = await createAction(ticket.id, { status: "Completed" });

    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: 1, result: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors).toHaveProperty("result");
  });
});

describe("POST /api/tickets/:ticketId/actions/:actionId/complete", () => {
  async function plannedAction(ticketId: number) {
    return prisma.actionTaken.create({
      data: {
        ticketId,
        actionAt: new Date(Date.now() + 50), // padded — see validCreateBody() above
        description: "Planned work.",
        status: "Planned",
        performedById: staff1Id,
        createdById: staff1Id,
        clientRequestId: randomUUID(),
      },
    });
  }

  it("completes a Planned action, setting result and completedAt", async () => {
    const ticket = await createTicket({ summary: "complete planned" });
    const action = await plannedAction(ticket.id);

    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions/${action.id}/complete`)
      .send({ version: 1, result: "Fixed the issue." });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("Completed");
    expect(res.body.data.result).toBe("Fixed the issue.");
    expect(res.body.data.completedAt).not.toBeNull();
    expect(res.body.data.version).toBe(2);
  });

  it("returns 400 when completing without a result (AC-09)", async () => {
    const ticket = await createTicket({ summary: "complete missing result" });
    const action = await plannedAction(ticket.id);

    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions/${action.id}/complete`)
      .send({ version: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 INVALID_TRANSITION when the action is already Completed", async () => {
    const ticket = await createTicket({ summary: "complete already completed" });
    const action = await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        actionAt: new Date(Date.now() + 50), // padded — see validCreateBody() above
        description: "Already done.",
        status: "Completed",
        result: "Done already.",
        performedById: staff1Id,
        createdById: staff1Id,
        clientRequestId: randomUUID(),
      },
    });

    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions/${action.id}/complete`)
      .send({ version: 1, result: "Trying again." });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("returns 409 ACTION_LOCKED when the action is Cancelled", async () => {
    const ticket = await createTicket({ summary: "complete cancelled action" });
    const action = await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        actionAt: new Date(Date.now() + 50), // padded — see validCreateBody() above
        description: "Cancelled work.",
        status: "Cancelled",
        cancelledAt: new Date(),
        cancelReason: "No longer needed.",
        performedById: staff1Id,
        createdById: staff1Id,
        clientRequestId: randomUUID(),
      },
    });

    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions/${action.id}/complete`)
      .send({ version: 1, result: "Trying anyway." });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ACTION_LOCKED");
  });

  it("returns 409 STALE_UPDATE on a version mismatch (AC-10)", async () => {
    const ticket = await createTicket({ summary: "complete stale version" });
    const action = await plannedAction(ticket.id);

    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions/${action.id}/complete`)
      .send({ version: 5, result: "Attempted." });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("STALE_UPDATE");
  });

  it("returns 403 for a Requester (AC-04)", async () => {
    const ticket = await createTicket({ summary: "requester complete forbidden" });
    const action = await plannedAction(ticket.id);

    const res = await requesterAgent
      .post(`/api/tickets/${ticket.id}/actions/${action.id}/complete`)
      .send({ version: 1, result: "Should not apply." });

    expect(res.status).toBe(403);
  });
});

describe("POST /api/tickets/:ticketId/actions/:actionId/cancel", () => {
  async function plannedAction(ticketId: number) {
    return prisma.actionTaken.create({
      data: {
        ticketId,
        actionAt: new Date(Date.now() + 50), // padded — see validCreateBody() above
        description: "Planned work to cancel.",
        status: "Planned",
        performedById: staff1Id,
        createdById: staff1Id,
        clientRequestId: randomUUID(),
      },
    });
  }

  it("cancels a Planned action with a reason", async () => {
    const ticket = await createTicket({ summary: "cancel planned" });
    const action = await plannedAction(ticket.id);

    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions/${action.id}/cancel`)
      .send({ version: 1, reason: "Duplicate entry." });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("Cancelled");
    expect(res.body.data.cancelReason).toBe("Duplicate entry.");
    expect(res.body.data.cancelledAt).not.toBeNull();
  });

  it("cancels a Completed action with a reason", async () => {
    const ticket = await createTicket({ summary: "cancel completed" });
    const action = await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        actionAt: new Date(Date.now() + 50), // padded — see validCreateBody() above
        description: "Completed work to cancel.",
        status: "Completed",
        result: "Done.",
        performedById: staff1Id,
        createdById: staff1Id,
        clientRequestId: randomUUID(),
      },
    });

    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions/${action.id}/cancel`)
      .send({ version: 1, reason: "Recorded in error." });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("Cancelled");
  });

  it("requires a non-empty reason (400)", async () => {
    const ticket = await createTicket({ summary: "cancel missing reason" });
    const action = await plannedAction(ticket.id);

    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions/${action.id}/cancel`)
      .send({ version: 1, reason: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors).toHaveProperty("reason");
  });

  it("returns 409 ACTION_LOCKED when already Cancelled", async () => {
    const ticket = await createTicket({ summary: "cancel already cancelled" });
    const action = await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        actionAt: new Date(Date.now() + 50), // padded — see validCreateBody() above
        description: "Already cancelled.",
        status: "Cancelled",
        cancelledAt: new Date(),
        cancelReason: "First reason.",
        performedById: staff1Id,
        createdById: staff1Id,
        clientRequestId: randomUUID(),
      },
    });

    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions/${action.id}/cancel`)
      .send({ version: 1, reason: "Second reason." });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ACTION_LOCKED");
  });

  it("returns 409 TICKET_LOCKED when the ticket is Cancelled", async () => {
    const ticket = await createTicket({ summary: "cancel on cancelled ticket", currentStatus: "InProgress" });
    const action = await plannedAction(ticket.id);
    await prisma.ticket.update({ where: { id: ticket.id }, data: { currentStatus: "Cancelled" } });

    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/actions/${action.id}/cancel`)
      .send({ version: 1, reason: "Should be blocked." });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TICKET_LOCKED");
  });

  it("returns 403 for a Requester (AC-04)", async () => {
    const ticket = await createTicket({ summary: "requester cancel forbidden" });
    const action = await plannedAction(ticket.id);

    const res = await requesterAgent
      .post(`/api/tickets/${ticket.id}/actions/${action.id}/cancel`)
      .send({ version: 1, reason: "Should not apply." });

    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/tickets/:ticketId/actions/:actionId", () => {
  it("returns 405 for every role — Actions Taken are append-only", async () => {
    const ticket = await createTicket({ summary: "delete not allowed" });
    const action = await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        actionAt: new Date(Date.now() + 50), // padded — see validCreateBody() above
        description: "Should never be deletable.",
        performedById: staff1Id,
        createdById: staff1Id,
        clientRequestId: randomUUID(),
      },
    });

    for (const agent of [staff1Agent, adminAgent, requesterAgent]) {
      const res = await agent.delete(`/api/tickets/${ticket.id}/actions/${action.id}`);
      expect(res.status).toBe(405);
    }

    expect(await prisma.actionTaken.findUnique({ where: { id: action.id } })).not.toBeNull();
  });
});

describe("Error responses never leak internals", () => {
  it("every triggered error is the documented { error: { code, message } } envelope only", async () => {
    const ticket = await createTicket({ summary: "safe errors" });
    const responses = [
      await requesterAgent.get(`/api/tickets/999999999/actions`),
      await staff1Agent.post(`/api/tickets/${ticket.id}/actions`).send({}),
      await requesterAgent.post(`/api/tickets/${ticket.id}/actions`).send(validCreateBody()),
      await staff1Agent.patch(`/api/tickets/${ticket.id}/actions/999999999`).send({ version: 1 }),
    ];

    for (const res of responses) {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.error).toBeDefined();
      expect(typeof res.body.error.code).toBe("string");
      expect(typeof res.body.error.message).toBe("string");
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toMatch(/at [A-Za-z0-9_.]+\s*\(/); // stack trace frames
      expect(serialized.toLowerCase()).not.toMatch(/select .* from|insert into|prismaclientknownrequesterror/i);
    }
  });
});
