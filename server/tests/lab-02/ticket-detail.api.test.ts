import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAgent, type AuthedAgent } from "../authHelper.js";
import { createTestUser, removeTestUsers } from "../lab-03/helpers.js";

// API-07 — Cross-requester detail (Lab 3 AC-21, BR-09: 404, not 403).
//
// Integration test: needs the database migrated and seeded first.
//   npx prisma migrate deploy
//   npm run prisma:seed
const prisma = getPrisma();

const TAG = "[ticket-detail-test]";

let ownerId: number;
let ownedTicketId: number;
let foreignTicketId: number;
// Lab 3 BR-03 — ownership comes from the session.
let ownerAgent: AuthedAgent;
let otherAgent: AuthedAgent;

const detailUrl = (ticketId: number) => `/api/tickets/${ticketId}`;

async function createTicketFor(requesterId: number, summary: string) {
  const [category, system] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
  ]);

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TT-DET-${Math.random().toString(36).slice(2, 10)}`,
      requesterId,
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: `${TAG} ${summary}`,
      description: "Created by the ticket detail API test suite.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
    },
    select: { id: true },
  });
  return ticket.id;
}

async function removeFixtures() {
  await prisma.ticket.deleteMany({ where: { summary: { contains: TAG } } });
}

let otherId: number;

beforeAll(async () => {
  const [owner, other] = await Promise.all([
    createTestUser({ name: "Detail Owner" }),
    createTestUser({ name: "Detail Other Person" }),
  ]);
  ownerId = owner.id;
  otherId = other.id;
  await removeFixtures();

  ownerAgent = await loginAgent(app, { email: owner.email, password: owner.password });
  otherAgent = await loginAgent(app, { email: other.email, password: other.password });
});

beforeEach(async () => {
  await removeFixtures();
  ownedTicketId = await createTicketFor(ownerId, "Owned ticket");
  foreignTicketId = await createTicketFor(otherId, "Foreign ticket");
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await removeFixtures();
  await removeTestUsers();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// API-07 — the owner's own ticket is returned in full
// ---------------------------------------------------------------------------
describe("API-07 — GET ticket detail for the owner", () => {
  it("returns the complete read-only representation (AC-12)", async () => {
    const res = await ownerAgent.get(detailUrl(ownedTicketId));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(ownedTicketId);
    for (const field of [
      "ticketNumber",
      "ticketDate",
      "requester",
      "category",
      "relatedSystem",
      "summary",
      "requestedPriority",
      "currentStatus",
      "description",
      "createdAt",
      "updatedAt",
      "attachments",
      "ticketOwner",
      "problemAppearsResolvedAt",
      "permissions",
    ]) {
      expect(res.body.data[field]).not.toBe(undefined);
    }
  });

  it("includes the attachment metadata collection", async () => {
    const res = await ownerAgent.get(detailUrl(ownedTicketId));
    expect(Array.isArray(res.body.data.attachments)).toBe(true);
  });

  it("does not expose IT Priority or another user's email (BR-26)", async () => {
    const res = await ownerAgent.get(detailUrl(ownedTicketId));
    expect(res.body.data.itPriority).toBeUndefined();
    expect(res.body.data.allowedStatusTransitions).toBeUndefined();
  });

  it("shows the ticket as unassigned by default", async () => {
    const res = await ownerAgent.get(detailUrl(ownedTicketId));
    expect(res.body.data.ticketOwner).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// API-07 — a ticket owned by another requester is not returned (Lab 3 AC-21, BR-09)
// ---------------------------------------------------------------------------
describe("API-07 — cross-requester detail protection", () => {
  it("does not return a ticket owned by another requester, as a 404 (AC-21)", async () => {
    const res = await ownerAgent.get(detailUrl(foreignTicketId));

    expect(res.status).toBe(404);
    expect(res.body.data).toBeUndefined();
  });

  it("reveals nothing about the real owner (BR-09)", async () => {
    const res = await ownerAgent.get(detailUrl(foreignTicketId));
    const serialized = JSON.stringify(res.body);

    expect(serialized).not.toMatch(/Detail Other Person/);
    // No ticket content leaks either.
    expect(serialized).not.toMatch(/Foreign ticket/);
    expect(serialized).not.toMatch(/TT-DET-/);
  });

  it("is symmetric: the other requester cannot read the owner's ticket", async () => {
    const res = await otherAgent.get(detailUrl(ownedTicketId));

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/Owned ticket/);
  });

  it("still returns each requester their own ticket", async () => {
    const mine = await ownerAgent.get(detailUrl(ownedTicketId));
    const theirs = await otherAgent.get(detailUrl(foreignTicketId));

    expect(mine.status).toBe(200);
    expect(theirs.status).toBe(200);
    expect(mine.body.data.id).toBe(ownedTicketId);
    expect(theirs.body.data.id).toBe(foreignTicketId);
  });

  it("returns the identical 404 for a nonexistent ticket (BR-09)", async () => {
    const nonexistent = await ownerAgent.get(detailUrl(99999999));
    const foreign = await ownerAgent.get(detailUrl(foreignTicketId));

    expect(nonexistent.status).toBe(404);
    expect(nonexistent.body).toEqual(foreign.body);
  });

  it("rejects a malformed ticket id with 400", async () => {
    expect((await ownerAgent.get("/api/tickets/abc")).status).toBe(400);
  });

  it("returns a safe 500 without leaking internals (BR-39)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.ticket, "findFirst").mockRejectedValue(
      new Error('Invalid `prisma.ticket.findFirst()` at C:\\repo\\server\\src\\attachments.ts:120'),
    );

    const res = await ownerAgent.get(detailUrl(ownedTicketId));

    expect(res.status).toBe(500);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/prisma/i);
    expect(serialized).not.toMatch(/\.ts:/);
    expect(res.body.error.stack).toBeUndefined();
  });
});
