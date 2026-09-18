import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAgent, type AuthedAgent } from "../authHelper.js";
import { createTestUser, removeTestUsers } from "./helpers.js";

// Public Comments and "Problem Appears Resolved" (Requester Regression issue,
// tests.md §4 API-12/API-13, api-spec.md §10, §12).

const prisma = getPrisma();
const TAG = "[comments-test]";

let requesterId: number;
let requesterAgent: AuthedAgent;
let otherAgent: AuthedAgent;
let staffAgent: AuthedAgent;

async function createTicketFor(reqId: number, summary: string, status = "New") {
  const [category, system] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
  ]);
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TT-CMT-${Math.random().toString(36).slice(2, 10)}`,
      requesterId: reqId,
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: `${TAG} ${summary}`,
      description: "Created by the comments API test suite.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: status as never,
    },
    select: { id: true },
  });
  return ticket.id;
}

async function removeFixtures() {
  await prisma.ticket.deleteMany({ where: { summary: { contains: TAG } } });
}

beforeAll(async () => {
  const [requester, other, staff] = await Promise.all([
    createTestUser({ role: "Requester" }),
    createTestUser({ role: "Requester" }),
    createTestUser({ role: "ITStaff" }),
  ]);
  requesterId = requester.id;

  requesterAgent = await loginAgent(app, { email: requester.email, password: requester.password });
  otherAgent = await loginAgent(app, { email: other.email, password: other.password });
  staffAgent = await loginAgent(app, { email: staff.email, password: staff.password });

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
// Public Comments (§10)
// ---------------------------------------------------------------------------
describe("API-12 — Requester Public Comments (AC-23, BR-43, BR-47)", () => {
  it("posts a comment as the caller and appends it last", async () => {
    const ticketId = await createTicketFor(requesterId, "Battery drains");

    const res = await requesterAgent
      .post(`/api/tickets/${ticketId}/public-comments`)
      .send({ body: "The battery still drains after the update." });

    expect(res.status).toBe(201);
    expect(res.body.data.body).toBe("The battery still drains after the update.");
    expect(res.body.data.author).toMatchObject({ id: requesterId, role: "Requester" });
    expect(res.body.meta.ticketUpdatedAt).toBeDefined();

    const list = await requesterAgent.get(`/api/tickets/${ticketId}/public-comments`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].id).toBe(res.body.data.id);
  });

  it("ignores a client-supplied author or timestamp", async () => {
    const ticketId = await createTicketFor(requesterId, "Author spoof");

    const res = await requesterAgent
      .post(`/api/tickets/${ticketId}/public-comments`)
      .send({ body: "Trying to spoof", authorId: 999999, createdAt: "1999-01-01" });

    expect(res.status).toBe(201);
    expect(res.body.data.author.id).toBe(requesterId);
    expect(new Date(res.body.data.createdAt).getFullYear()).toBeGreaterThan(2000);
  });

  it("updates the ticket's updatedAt (BR-47)", async () => {
    const ticketId = await createTicketFor(requesterId, "Updated at check");
    const before = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      select: { updatedAt: true },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    await requesterAgent
      .post(`/api/tickets/${ticketId}/public-comments`)
      .send({ body: "Bumping the timestamp." });

    const after = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      select: { updatedAt: true },
    });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it("rejects empty, whitespace-only, and over-length comments (AC-26)", async () => {
    const ticketId = await createTicketFor(requesterId, "Validation");

    for (const body of ["", "   ", "a".repeat(2001)]) {
      const res = await requesterAgent
        .post(`/api/tickets/${ticketId}/public-comments`)
        .send({ body });
      expect(res.status).toBe(400);
      expect(res.body.error.fieldErrors.body).toEqual(expect.any(String));
    }
  });

  it("accepts exactly 2000 characters", async () => {
    const ticketId = await createTicketFor(requesterId, "Boundary");
    const res = await requesterAgent
      .post(`/api/tickets/${ticketId}/public-comments`)
      .send({ body: "a".repeat(2000) });
    expect(res.status).toBe(201);
  });

  it("normalizes CRLF and strips control characters (BR-45)", async () => {
    const ticketId = await createTicketFor(requesterId, "Normalize");
    const res = await requesterAgent
      .post(`/api/tickets/${ticketId}/public-comments`)
      .send({ body: "line one\r\nline two\x07" });

    expect(res.status).toBe(201);
    expect(res.body.data.body).toBe("line one\nline two");
  });

  it("returns 404 for another requester's ticket, without leaking (AC-21, BR-09)", async () => {
    const ticketId = await createTicketFor(requesterId, "Not yours");

    const res = await otherAgent
      .post(`/api/tickets/${ticketId}/public-comments`)
      .send({ body: "Trying to read someone else's ticket." });

    expect(res.status).toBe(404);
  });

  it("rejects new comments on a Closed ticket (BR-41)", async () => {
    const ticketId = await createTicketFor(requesterId, "Closed ticket", "Closed");

    const res = await requesterAgent
      .post(`/api/tickets/${ticketId}/public-comments`)
      .send({ body: "Trying to comment on a closed ticket." });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TICKET_CLOSED");
  });

  it("denies IT Staff for now — staff comment access arrives with its own issue (FR-39)", async () => {
    const ticketId = await createTicketFor(requesterId, "Staff comment");

    // Staff access to any Ticket's Public Comments arrives with the IT Staff
    // Ticket Operations issue; today the route is Requester-only, so a staff
    // caller correctly gets 403 rather than reading another user's data.
    const res = await staffAgent
      .post(`/api/tickets/${ticketId}/public-comments`)
      .send({ body: "Staff comment" });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Problem Appears Resolved (§12, BR-48)
// ---------------------------------------------------------------------------
describe("API-13 — Problem Appears Resolved (AC-24, BR-05, BR-48)", () => {
  it("sets the flag and adds the automatic comment without changing status", async () => {
    const ticketId = await createTicketFor(requesterId, "Resolution signal", "InProgress");

    const res = await requesterAgent
      .post(`/api/tickets/${ticketId}/problem-resolved`)
      .send({ note: "Works fine since the restart." });

    expect(res.status).toBe(200);
    expect(res.body.data.currentStatus).toBe("InProgress");
    expect(res.body.data.problemAppearsResolvedAt).toBeDefined();
    expect(res.body.data.publicComment.body).toBe(
      "Problem appears resolved.\n\nWorks fine since the restart.",
    );

    const stored = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      select: { currentStatus: true, problemAppearsResolvedAt: true },
    });
    expect(stored.currentStatus).toBe("InProgress");
    expect(stored.problemAppearsResolvedAt).not.toBeNull();
  });

  it("works without a note", async () => {
    const ticketId = await createTicketFor(requesterId, "No note", "New");
    const res = await requesterAgent.post(`/api/tickets/${ticketId}/problem-resolved`).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.publicComment.body).toBe("Problem appears resolved.");
  });

  it("rejects a repeat report with 409 (BR-48)", async () => {
    const ticketId = await createTicketFor(requesterId, "Repeat", "Open");
    await requesterAgent.post(`/api/tickets/${ticketId}/problem-resolved`).send({});

    const second = await requesterAgent.post(`/api/tickets/${ticketId}/problem-resolved`).send({});
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("ALREADY_REPORTED_RESOLVED");
  });

  it("rejects reporting on a Resolved ticket with 409 (BR-48)", async () => {
    const ticketId = await createTicketFor(requesterId, "Already resolved", "Resolved");

    const res = await requesterAgent.post(`/api/tickets/${ticketId}/problem-resolved`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ACTION_NOT_ALLOWED_FOR_STATUS");
  });

  it("rejects reporting on a terminal ticket with TICKET_CLOSED (BR-41)", async () => {
    const ticketId = await createTicketFor(requesterId, "Terminal", "Cancelled");

    const res = await requesterAgent.post(`/api/tickets/${ticketId}/problem-resolved`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TICKET_CLOSED");
  });

  it("rejects IT Staff and Administrators with 403", async () => {
    const ticketId = await createTicketFor(requesterId, "Staff denied", "New");

    const res = await staffAgent.post(`/api/tickets/${ticketId}/problem-resolved`).send({});
    expect(res.status).toBe(403);
  });

  it("returns 404 for another requester's ticket, without leaking (BR-09)", async () => {
    const ticketId = await createTicketFor(requesterId, "Not yours", "New");

    const res = await otherAgent.post(`/api/tickets/${ticketId}/problem-resolved`).send({});
    expect(res.status).toBe(404);
  });

  it("rejects an over-length note with 400", async () => {
    const ticketId = await createTicketFor(requesterId, "Long note", "New");

    const res = await requesterAgent
      .post(`/api/tickets/${ticketId}/problem-resolved`)
      .send({ note: "a".repeat(2001) });
    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors.note).toEqual(expect.any(String));
  });
});
