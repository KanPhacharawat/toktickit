import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAgent, type AuthedAgent } from "../authHelper.js";
import { createTestUser, removeTestUsers } from "./helpers.js";

// IT Staff Ticket Operations issue — tests.md §6.
// API-20 to API-35.

const prisma = getPrisma();
const TAG = "[staff-ops-test]";

let requesterId: number;
let requesterAgent: AuthedAgent;
let staff1Id: number;
let staff1Agent: AuthedAgent;
let staff2Id: number;
let staff2Agent: AuthedAgent;
let adminId: number;
let adminAgent: AuthedAgent;
let inactiveStaffId: number;
let categoryId: number;
let systemId: number;

async function removeFixtures() {
  await prisma.ticket.deleteMany({ where: { summary: { contains: TAG } } });
}

async function createTicket(overrides: {
  summary: string;
  currentStatus?: string;
  requestedPriority?: string;
  itPriority?: string;
  ticketOwnerId?: number | null;
  problemAppearsResolvedAt?: Date | null;
}) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TT-OPS-${Math.random().toString(36).slice(2, 10)}`,
      requesterId,
      categoryId,
      relatedSystemId: systemId,
      summary: `${TAG} ${overrides.summary}`,
      description: "Created by the staff ticket operations test suite.",
      requestedPriority: (overrides.requestedPriority ?? "MEDIUM") as never,
      itPriority: (overrides.itPriority ?? overrides.requestedPriority ?? "MEDIUM") as never,
      currentStatus: (overrides.currentStatus ?? "New") as never,
      ticketOwnerId: overrides.ticketOwnerId ?? null,
      problemAppearsResolvedAt: overrides.problemAppearsResolvedAt ?? null,
    },
    select: { id: true, updatedAt: true },
  });
  return ticket;
}

beforeAll(async () => {
  const [requester, staff1, staff2, admin, inactiveStaff, category, system] = await Promise.all([
    createTestUser({ role: "Requester", name: "Ops Requester" }),
    createTestUser({ role: "ITStaff", name: "Ops Staff One" }),
    createTestUser({ role: "ITStaff", name: "Ops Staff Two" }),
    createTestUser({ role: "Administrator", name: "Ops Admin" }),
    createTestUser({ role: "ITStaff", name: "Ops Inactive Staff", isActive: false }),
    prisma.category.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
  ]);

  requesterId = requester.id;
  staff1Id = staff1.id;
  staff2Id = staff2.id;
  adminId = admin.id;
  inactiveStaffId = inactiveStaff.id;
  categoryId = category.id;
  systemId = system.id;

  requesterAgent = await loginAgent(app, { email: requester.email, password: requester.password });
  staff1Agent = await loginAgent(app, { email: staff1.email, password: staff1.password });
  staff2Agent = await loginAgent(app, { email: staff2.email, password: staff2.password });
  adminAgent = await loginAgent(app, { email: admin.email, password: admin.password });

  await removeFixtures();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await removeFixtures();
});

afterAll(async () => {
  await removeTestUsers();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// API-20 — Staff Ticket Detail (AC-24, FR-33, FR-42)
// ---------------------------------------------------------------------------
describe("API-20 — Staff Ticket Detail", () => {
  it("returns itPriority, owner, permissions, and allowedStatusTransitions", async () => {
    const ticket = await createTicket({ summary: "Detail shape", currentStatus: "New" });

    const res = await staff1Agent.get(`/api/tickets/${ticket.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      itPriority: "MEDIUM",
      ticketOwner: null,
      allowedStatusTransitions: [],
      permissions: {
        canClaim: true,
        canAssign: true,
        canReassign: false,
        canChangeItPriority: false,
        canChangeStatus: false,
        canAddPublicComment: true,
        canAddInternalNote: true,
        canManageAttachments: false,
      },
    });
  });

  it("computes owner-authority permissions and transitions for the owner", async () => {
    const ticket = await createTicket({
      summary: "Owner permissions",
      currentStatus: "InProgress",
      ticketOwnerId: staff1Id,
    });

    const res = await staff1Agent.get(`/api/tickets/${ticket.id}`);
    expect(res.body.data.permissions).toMatchObject({
      canClaim: false,
      canAssign: false,
      canReassign: true,
      canChangeItPriority: true,
      canChangeStatus: true,
    });
    expect(res.body.data.allowedStatusTransitions.sort()).toEqual(
      ["Cancelled", "Resolved", "WaitingForRequester"].sort(),
    );
  });

  it("gives a non-owner IT Staff member read-only authority", async () => {
    const ticket = await createTicket({
      summary: "Non-owner",
      currentStatus: "InProgress",
      ticketOwnerId: staff1Id,
    });

    const res = await staff2Agent.get(`/api/tickets/${ticket.id}`);
    expect(res.body.data.permissions).toMatchObject({
      canReassign: false,
      canChangeItPriority: false,
      canChangeStatus: false,
    });
    expect(res.body.data.allowedStatusTransitions).toEqual([]);
  });

  it("gives an Administrator authority over any Ticket without ownership (BR-10)", async () => {
    const ticket = await createTicket({
      summary: "Admin authority",
      currentStatus: "InProgress",
      ticketOwnerId: staff1Id,
    });

    const res = await adminAgent.get(`/api/tickets/${ticket.id}`);
    expect(res.body.data.permissions).toMatchObject({
      canReassign: true,
      canChangeItPriority: true,
      canChangeStatus: true,
    });
  });

  it("returns 404 for a nonexistent ticket", async () => {
    const res = await staff1Agent.get("/api/tickets/99999999");
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// API-21 — assignable users
// ---------------------------------------------------------------------------
describe("API-21 — assignable users (AC-36, BR-33)", () => {
  it("returns only active IT Staff and Administrators, sorted by name then id", async () => {
    const res = await staff1Agent.get("/api/users/assignable");

    expect(res.status).toBe(200);
    const ids = res.body.data.map((u: { id: number }) => u.id);
    expect(ids).toContain(staff1Id);
    expect(ids).toContain(staff2Id);
    expect(ids).toContain(adminId);
    expect(ids).not.toContain(inactiveStaffId);
    expect(ids).not.toContain(requesterId);

    const names = res.body.data.map((u: { name: string }) => u.name);
    expect(names).toEqual([...names].sort());
  });
});

// ---------------------------------------------------------------------------
// API-22 / API-23 — claim (AC-34, AC-35, BR-34)
// ---------------------------------------------------------------------------
describe("API-22 — claim (AC-34, BR-34)", () => {
  it("lets any IT Staff or Administrator claim an unassigned ticket", async () => {
    const ticket = await createTicket({ summary: "Claim me" });

    const res = await staff1Agent.post(`/api/tickets/${ticket.id}/claim`);
    expect(res.status).toBe(200);
    expect(res.body.data.ticketOwner).toMatchObject({ id: staff1Id });

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.ticketOwnerId).toBe(staff1Id);
  });
});

describe("API-23 — claim conflicts (AC-35)", () => {
  it("rejects claiming an already-owned ticket with 409", async () => {
    const ticket = await createTicket({ summary: "Already owned", ticketOwnerId: staff2Id });

    const res = await staff1Agent.post(`/api/tickets/${ticket.id}/claim`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TICKET_ALREADY_CLAIMED");
  });

  it("exactly one side wins a simultaneous claim", async () => {
    const ticket = await createTicket({ summary: "Race" });

    const [a, b] = await Promise.all([
      staff1Agent.post(`/api/tickets/${ticket.id}/claim`),
      staff2Agent.post(`/api/tickets/${ticket.id}/claim`),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect([staff1Id, staff2Id]).toContain(stored.ticketOwnerId);
  });

  it("rejects claiming a terminal ticket with TICKET_CLOSED", async () => {
    const ticket = await createTicket({ summary: "Closed claim", currentStatus: "Closed" });
    const res = await staff1Agent.post(`/api/tickets/${ticket.id}/claim`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TICKET_CLOSED");
  });
});

// ---------------------------------------------------------------------------
// API-24 — assign an unassigned ticket (AC-36, BR-35)
// ---------------------------------------------------------------------------
describe("API-24 — assign (AC-36, BR-35)", () => {
  it("lets any IT Staff member assign to another active staff member or administrator", async () => {
    const ticket = await createTicket({ summary: "Assign" });

    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/owner`)
      .send({ ticketOwnerId: staff2Id });
    expect(res.status).toBe(200);
    expect(res.body.data.ticketOwner).toMatchObject({ id: staff2Id });
  });

  it("rejects a Requester as target with 400", async () => {
    const ticket = await createTicket({ summary: "Bad target" });
    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/owner`)
      .send({ ticketOwnerId: requesterId });
    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors.ticketOwnerId).toEqual(expect.any(String));
  });

  it("rejects an inactive target with 400", async () => {
    const ticket = await createTicket({ summary: "Inactive target" });
    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/owner`)
      .send({ ticketOwnerId: inactiveStaffId });
    expect(res.status).toBe(400);
  });

  it("rejects a missing or null ticketOwnerId with 400", async () => {
    const ticket = await createTicket({ summary: "Missing target" });
    const res = await staff1Agent.patch(`/api/tickets/${ticket.id}/owner`).send({});
    expect(res.status).toBe(400);
  });

  it("rejects a nonexistent target with 400", async () => {
    const ticket = await createTicket({ summary: "Nonexistent target" });
    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/owner`)
      .send({ ticketOwnerId: 99999999 });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// API-25 — reassign an owned ticket (AC-37, BR-35)
// ---------------------------------------------------------------------------
describe("API-25 — reassign (AC-37, BR-35)", () => {
  it("lets the current owner reassign", async () => {
    const ticket = await createTicket({ summary: "Reassign by owner", ticketOwnerId: staff1Id });
    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/owner`)
      .send({ ticketOwnerId: staff2Id });
    expect(res.status).toBe(200);
    expect(res.body.data.ticketOwner).toMatchObject({ id: staff2Id });
  });

  it("lets an Administrator reassign without owning the ticket", async () => {
    const ticket = await createTicket({ summary: "Reassign by admin", ticketOwnerId: staff1Id });
    const res = await adminAgent
      .patch(`/api/tickets/${ticket.id}/owner`)
      .send({ ticketOwnerId: staff2Id });
    expect(res.status).toBe(200);
  });

  it("rejects reassignment by a non-owner IT Staff member with 403", async () => {
    const ticket = await createTicket({ summary: "Non-owner reassign", ticketOwnerId: staff1Id });
    const res = await staff2Agent
      .patch(`/api/tickets/${ticket.id}/owner`)
      .send({ ticketOwnerId: staff2Id });
    expect(res.status).toBe(403);

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.ticketOwnerId).toBe(staff1Id);
  });

  it("rejects reassigning to the current owner with 400", async () => {
    const ticket = await createTicket({ summary: "Same owner", ticketOwnerId: staff1Id });
    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/owner`)
      .send({ ticketOwnerId: staff1Id });
    expect(res.status).toBe(400);
  });

  it("returns 409 STALE_TICKET when the owner changed since it was read", async () => {
    const ticket = await createTicket({ summary: "Stale owner", ticketOwnerId: staff1Id });
    await prisma.ticket.update({ where: { id: ticket.id }, data: { ticketOwnerId: staff2Id } });

    // An Administrator always has authority, regardless of ownership, so
    // this isolates the staleness check from the owner-authority check.
    const res = await adminAgent
      .patch(`/api/tickets/${ticket.id}/owner`)
      .send({ ticketOwnerId: staff1Id, expectedUpdatedAt: ticket.updatedAt.toISOString() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("STALE_TICKET");
  });
});

// ---------------------------------------------------------------------------
// API-26 — IT Priority (AC-38, BR-37, BR-38)
// ---------------------------------------------------------------------------
describe("API-26 — IT Priority (AC-38, BR-37, BR-38)", () => {
  it("copies Requested Priority at creation, then lets the owner change it independently", async () => {
    const ticket = await createTicket({
      summary: "Priority copy",
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      ticketOwnerId: staff1Id,
    });

    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/it-priority`)
      .send({ itPriority: "URGENT" });
    expect(res.status).toBe(200);
    expect(res.body.data.itPriority).toBe("URGENT");
    expect(res.body.data.requestedPriority).toBe("HIGH");
  });

  it("lets an Administrator change IT Priority without owning the ticket", async () => {
    const ticket = await createTicket({ summary: "Admin priority", ticketOwnerId: staff1Id });
    const res = await adminAgent
      .patch(`/api/tickets/${ticket.id}/it-priority`)
      .send({ itPriority: "LOW" });
    expect(res.status).toBe(200);
  });

  it("rejects a non-owner IT Staff member with 403, including an unassigned ticket", async () => {
    const owned = await createTicket({ summary: "Non-owner priority", ticketOwnerId: staff1Id });
    const unowned = await createTicket({ summary: "Unassigned priority" });

    const resOwned = await staff2Agent
      .patch(`/api/tickets/${owned.id}/it-priority`)
      .send({ itPriority: "LOW" });
    expect(resOwned.status).toBe(403);

    const resUnowned = await staff1Agent
      .patch(`/api/tickets/${unowned.id}/it-priority`)
      .send({ itPriority: "LOW" });
    expect(resUnowned.status).toBe(403);
  });

  it("rejects an invalid or missing value with 400", async () => {
    const ticket = await createTicket({ summary: "Invalid priority", ticketOwnerId: staff1Id });
    expect(
      (await staff1Agent.patch(`/api/tickets/${ticket.id}/it-priority`).send({ itPriority: "CRITICAL" }))
        .status,
    ).toBe(400);
    expect(
      (await staff1Agent.patch(`/api/tickets/${ticket.id}/it-priority`).send({})).status,
    ).toBe(400);
  });

  it("leaves updatedAt unchanged when resending the stored value", async () => {
    const ticket = await createTicket({
      summary: "No-op priority",
      itPriority: "MEDIUM",
      ticketOwnerId: staff1Id,
    });

    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/it-priority`)
      .send({ itPriority: "MEDIUM" });
    expect(res.status).toBe(200);
    expect(new Date(res.body.data.updatedAt).getTime()).toBe(ticket.updatedAt.getTime());
  });
});

// ---------------------------------------------------------------------------
// API-27 — permitted status walk (AC-39, BR-39)
// ---------------------------------------------------------------------------
describe("API-27 — permitted status walk (AC-39, BR-39)", () => {
  it("walks the full documented path", async () => {
    const ticket = await createTicket({ summary: "Full walk", ticketOwnerId: staff1Id });
    const path = [
      "Open",
      "InProgress",
      "WaitingForRequester",
      "InProgress",
      "Resolved",
      "Reopened",
      "InProgress",
      "Resolved",
      "Closed",
    ];

    for (const currentStatus of path) {
      const res = await staff1Agent
        .patch(`/api/tickets/${ticket.id}/status`)
        .send({ currentStatus });
      expect(res.status, `-> ${currentStatus}`).toBe(200);
      expect(res.body.data.currentStatus).toBe(currentStatus);
    }
  });

  it("clears problemAppearsResolvedAt when moving to Reopened", async () => {
    const ticket = await createTicket({
      summary: "Reopen clears flag",
      currentStatus: "Resolved",
      ticketOwnerId: staff1Id,
      problemAppearsResolvedAt: new Date(),
    });

    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/status`)
      .send({ currentStatus: "Reopened" });
    expect(res.status).toBe(200);
    expect(res.body.data.problemAppearsResolvedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// API-28 — forbidden status changes (AC-40, BR-39)
// ---------------------------------------------------------------------------
describe("API-28 — forbidden status changes (AC-40, BR-39)", () => {
  it("rejects New -> Closed with 409 INVALID_STATUS_TRANSITION", async () => {
    const ticket = await createTicket({ summary: "Skip ahead", ticketOwnerId: staff1Id });
    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/status`)
      .send({ currentStatus: "Closed" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_STATUS_TRANSITION");

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.currentStatus).toBe("New");
  });

  it("rejects the same status with 409", async () => {
    const ticket = await createTicket({ summary: "Same status", ticketOwnerId: staff1Id });
    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/status`)
      .send({ currentStatus: "New" });
    expect(res.status).toBe(409);
  });

  it("rejects an unknown status with 400", async () => {
    const ticket = await createTicket({ summary: "Unknown status", ticketOwnerId: staff1Id });
    const res = await staff1Agent
      .patch(`/api/tickets/${ticket.id}/status`)
      .send({ currentStatus: "Pending" });
    expect(res.status).toBe(400);
  });

  it("rejects a non-owner IT Staff member with 403", async () => {
    const ticket = await createTicket({ summary: "Non-owner status", ticketOwnerId: staff1Id });
    const res = await staff2Agent
      .patch(`/api/tickets/${ticket.id}/status`)
      .send({ currentStatus: "Open" });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// API-29 — owner required (AC-41, BR-40)
// ---------------------------------------------------------------------------
describe("API-29 — owner required (AC-41, BR-40)", () => {
  it("blocks Open on an unassigned ticket, but allows Cancelled", async () => {
    const ticket = await createTicket({ summary: "Owner required" });

    const toOpen = await adminAgent
      .patch(`/api/tickets/${ticket.id}/status`)
      .send({ currentStatus: "Open" });
    expect(toOpen.status).toBe(409);
    expect(toOpen.body.error.code).toBe("OWNER_REQUIRED");

    const toCancelled = await adminAgent
      .patch(`/api/tickets/${ticket.id}/status`)
      .send({ currentStatus: "Cancelled" });
    expect(toCancelled.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// API-30 — terminal tickets (AC-42, BR-41)
// ---------------------------------------------------------------------------
describe("API-30 — terminal tickets (AC-42, BR-41)", () => {
  it("rejects claim, owner, IT Priority, status, and comments with TICKET_CLOSED; allows an Internal Note", async () => {
    const closed = await createTicket({
      summary: "Terminal ops",
      currentStatus: "Closed",
      ticketOwnerId: staff1Id,
    });

    expect((await staff2Agent.post(`/api/tickets/${closed.id}/claim`)).status).toBe(409);
    expect(
      (await staff1Agent.patch(`/api/tickets/${closed.id}/owner`).send({ ticketOwnerId: staff2Id }))
        .status,
    ).toBe(409);
    expect(
      (await staff1Agent.patch(`/api/tickets/${closed.id}/it-priority`).send({ itPriority: "LOW" }))
        .status,
    ).toBe(409);
    expect(
      (await staff1Agent.patch(`/api/tickets/${closed.id}/status`).send({ currentStatus: "Open" }))
        .status,
    ).toBe(409);
    expect(
      (
        await staff1Agent
          .post(`/api/tickets/${closed.id}/public-comments`)
          .send({ body: "Trying to comment" })
      ).status,
    ).toBe(409);

    const note = await staff1Agent
      .post(`/api/tickets/${closed.id}/internal-notes`)
      .send({ body: "Still allowed" });
    expect(note.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// API-31 — stale updates (AC-44, BR-42)
// ---------------------------------------------------------------------------
describe("API-31 — stale updates (AC-44, BR-42)", () => {
  it("rejects claim, IT Priority, and status with an old expectedUpdatedAt", async () => {
    const owned = await createTicket({ summary: "Stale it-priority", ticketOwnerId: staff1Id });
    const staleTime = new Date(owned.updatedAt.getTime() - 60_000).toISOString();

    const priorityRes = await staff1Agent
      .patch(`/api/tickets/${owned.id}/it-priority`)
      .send({ itPriority: "HIGH", expectedUpdatedAt: staleTime });
    expect(priorityRes.status).toBe(409);
    expect(priorityRes.body.error.code).toBe("STALE_TICKET");

    const statusRes = await staff1Agent
      .patch(`/api/tickets/${owned.id}/status`)
      .send({ currentStatus: "Open", expectedUpdatedAt: staleTime });
    expect(statusRes.status).toBe(409);
    expect(statusRes.body.error.code).toBe("STALE_TICKET");

    const unowned = await createTicket({ summary: "Stale claim" });
    const claimRes = await staff1Agent
      .post(`/api/tickets/${unowned.id}/claim`)
      .send({ expectedUpdatedAt: new Date(unowned.updatedAt.getTime() - 60_000).toISOString() });
    expect(claimRes.status).toBe(409);
    expect(claimRes.body.error.code).toBe("STALE_TICKET");
  });
});

// ---------------------------------------------------------------------------
// API-32 — staff Public Comments (AC-23, BR-43)
// ---------------------------------------------------------------------------
describe("API-32 — staff Public Comments (FR-39, AC-23, BR-43)", () => {
  it("lets staff post on any active ticket and the owning Requester sees it", async () => {
    const ticket = await createTicket({ summary: "Staff public comment" });

    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/public-comments`)
      .send({ body: "We are looking into it." });
    expect(res.status).toBe(201);
    expect(res.body.data.author.role).toBe("ITStaff");

    const seenByRequester = await requesterAgent.get(`/api/tickets/${ticket.id}/public-comments`);
    expect(seenByRequester.body.data).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// API-33 — Internal Notes (AC-43, BR-44, BR-47)
// ---------------------------------------------------------------------------
describe("API-33 — Internal Notes for staff (AC-43, BR-44, BR-47)", () => {
  it("posts as the session author and does not change the Ticket's updatedAt", async () => {
    const ticket = await createTicket({ summary: "Internal note" });
    const before = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      select: { updatedAt: true },
    });

    const res = await staff1Agent
      .post(`/api/tickets/${ticket.id}/internal-notes`)
      .send({ body: "Vendor recall in progress." });
    expect(res.status).toBe(201);
    expect(res.body.data.author).toMatchObject({ id: staff1Id, role: "ITStaff" });

    const after = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      select: { updatedAt: true },
    });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it("is readable by Administrators and other staff, oldest first", async () => {
    const ticket = await createTicket({ summary: "Shared notes" });
    await staff1Agent.post(`/api/tickets/${ticket.id}/internal-notes`).send({ body: "First." });
    await staff2Agent.post(`/api/tickets/${ticket.id}/internal-notes`).send({ body: "Second." });

    const res = await adminAgent.get(`/api/tickets/${ticket.id}/internal-notes`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((n: { body: string }) => n.body)).toEqual(["First.", "Second."]);
  });

  it("denies a Requester for any ticket id, without leaking existence (BR-09, AC-04)", async () => {
    const ticket = await createTicket({ summary: "Requester denied" });

    const real = await requesterAgent.get(`/api/tickets/${ticket.id}/internal-notes`);
    expect(real.status).toBe(403);
    const fake = await requesterAgent.get("/api/tickets/99999999/internal-notes");
    expect(fake.status).toBe(403);
    expect(real.body).toEqual(fake.body);
  });

  it("rejects empty and over-length notes with 400", async () => {
    const ticket = await createTicket({ summary: "Note validation" });
    expect(
      (await staff1Agent.post(`/api/tickets/${ticket.id}/internal-notes`).send({ body: "" })).status,
    ).toBe(400);
    expect(
      (
        await staff1Agent
          .post(`/api/tickets/${ticket.id}/internal-notes`)
          .send({ body: "a".repeat(2001) })
      ).status,
    ).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// API-35 — attachment continuity for staff (AC-45, BR-25)
// ---------------------------------------------------------------------------
describe("API-35 — attachment continuity for staff (AC-45, BR-25)", () => {
  it("lets staff list metadata and download active attachments, but never upload or remove", async () => {
    const ticket = await createTicket({ summary: "Attachment continuity" });

    const upload = await requesterAgent
      .post(`/api/tickets/${ticket.id}/attachments`)
      .attach(
        "file",
        Buffer.from(
          "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
          "hex",
        ),
        { filename: "screenshot.png", contentType: "image/png" },
      );
    expect(upload.status).toBe(201);

    const list = await staff1Agent.get(`/api/tickets/${ticket.id}/attachments`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const download = await staff1Agent.get(
      `/api/tickets/${ticket.id}/attachments/${upload.body.data.id}`,
    );
    expect(download.status).toBe(200);

    const uploadAsStaff = await staff1Agent
      .post(`/api/tickets/${ticket.id}/attachments`)
      .attach("file", Buffer.from("x"), { filename: "not-allowed.png", contentType: "image/png" });
    expect(uploadAsStaff.status).toBe(403);

    const removeAsStaff = await staff1Agent
      .delete(`/api/tickets/${ticket.id}/attachments/${upload.body.data.id}`)
      .send({ removalReason: "Not mine to remove" });
    expect(removeAsStaff.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Safe failures
// ---------------------------------------------------------------------------
describe("Staff ticket operations — unexpected failures stay safe (BR-60)", () => {
  it("returns a safe 500 without leaking internals on claim", async () => {
    const ticket = await createTicket({ summary: "Safe failure" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.ticket, "updateMany").mockRejectedValue(
      new Error('Invalid `prisma.ticket.updateMany()` at C:\\repo\\server\\src\\staffOperations.ts:70'),
    );

    const res = await staff1Agent.post(`/api/tickets/${ticket.id}/claim`);
    expect(res.status).toBe(500);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/prisma/i);
    expect(serialized).not.toMatch(/\.ts:/);
  });
});
