import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAgent, type AuthedAgent } from "../authHelper.js";

// API-07 â€” Cross-requester detail (AC-12).
// "Ticket owned by another Requester is not returned."
//
// Integration test: needs the database migrated and seeded first.
//   npx prisma migrate dev
//   npm run prisma:seed
const prisma = getPrisma();

const TAG = "[ticket-detail-test]";
const OWNER_EMAIL = "detail-owner@test.invalid";
const OTHER_EMAIL = "detail-other@test.invalid";

let ownerId: number;
let otherId: number;
let ownedTicketId: number;
let foreignTicketId: number;
// Lab 3 â€” this route is gated to the Requester role. The login identity is
// unrelated to `ownerId`/`otherId`, unchanged from Lab 2.
let agent: AuthedAgent;

const detailUrl = (requesterId: number, ticketId: number) =>
  `/api/requesters/${requesterId}/tickets/${ticketId}`;

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
    },
    select: { id: true },
  });
  return ticket.id;
}

async function removeFixtures() {
  await prisma.ticket.deleteMany({ where: { summary: { contains: TAG } } });
}

beforeAll(async () => {
  const [owner, other] = await Promise.all([
    prisma.user.upsert({
      where: { email: OWNER_EMAIL },
      update: { isActive: true, deletedAt: null },
      create: { name: "Detail Owner", email: OWNER_EMAIL, isActive: true },
      select: { id: true },
    }),
    prisma.user.upsert({
      where: { email: OTHER_EMAIL },
      update: { isActive: true, deletedAt: null },
      create: { name: "Detail Other Person", email: OTHER_EMAIL, isActive: true },
      select: { id: true },
    }),
  ]);
  ownerId = owner.id;
  otherId = other.id;
  await removeFixtures();
});

beforeEach(async () => {
  await removeFixtures();
  ownedTicketId = await createTicketFor(ownerId, "Owned ticket");
  foreignTicketId = await createTicketFor(otherId, "Foreign ticket");
  agent ??= await loginAgent(app);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await removeFixtures();
  await prisma.user.deleteMany({
    where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } },
  });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// API-07 â€” the owner's own ticket is returned in full
// ---------------------------------------------------------------------------
describe("API-07 â€” GET ticket detail for the owner", () => {
  it("returns the complete read-only representation (AC-12)", async () => {
    const res = await agent.get(detailUrl(ownerId, ownedTicketId));

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
    ]) {
      expect(res.body.data[field]).toBeDefined();
    }
  });

  it("includes the attachment metadata collection", async () => {
    const res = await agent.get(detailUrl(ownerId, ownedTicketId));
    expect(Array.isArray(res.body.data.attachments)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// API-07 â€” a ticket owned by another requester is not returned (AC-12, BR-09)
// ---------------------------------------------------------------------------
describe("API-07 â€” cross-requester detail protection", () => {
  it("does not return a ticket owned by another requester (AC-12)", async () => {
    const res = await agent.get(detailUrl(ownerId, foreignTicketId));

    expect(res.status).toBe(403);
    // No ticket payload is returned at all.
    expect(res.body.data).toBeUndefined();
  });

  it("reveals nothing about the real owner (BR-09)", async () => {
    const res = await agent.get(detailUrl(ownerId, foreignTicketId));
    const serialized = JSON.stringify(res.body);

    expect(serialized).not.toMatch(/Detail Other Person/);
    expect(serialized).not.toMatch(/detail-other@test\.invalid/);
    // No ticket content leaks either.
    expect(serialized).not.toMatch(/Foreign ticket/);
    expect(serialized).not.toMatch(/TT-DET-/);
  });

  it("is symmetric: the other requester cannot read the owner's ticket", async () => {
    const res = await agent.get(detailUrl(otherId, ownedTicketId));

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toMatch(/Owned ticket/);
  });

  it("still returns each requester their own ticket", async () => {
    const mine = await agent.get(detailUrl(ownerId, ownedTicketId));
    const theirs = await agent.get(detailUrl(otherId, foreignTicketId));

    expect(mine.status).toBe(200);
    expect(theirs.status).toBe(200);
    expect(mine.body.data.id).toBe(ownedTicketId);
    expect(theirs.body.data.id).toBe(foreignTicketId);
  });

  it("returns 404 when the ticket does not exist", async () => {
    const res = await agent.get(detailUrl(ownerId, 99999999));

    expect(res.status).toBe(404);
    expect(res.body.data).toBeUndefined();
  });

  it("rejects a malformed requester or ticket id with 400", async () => {
    expect((await agent.get("/api/requesters/abc/tickets/1")).status).toBe(400);
    expect((await agent.get(`/api/requesters/${ownerId}/tickets/abc`)).status).toBe(400);
  });

  it("returns a safe 500 without leaking internals (BR-39)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.ticket, "findFirst").mockRejectedValue(
      new Error('Invalid `prisma.ticket.findFirst()` at C:\\repo\\server\\src\\attachments.ts:120'),
    );

    const res = await agent.get(detailUrl(ownerId, ownedTicketId));

    expect(res.status).toBe(500);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/prisma/i);
    expect(serialized).not.toMatch(/\.ts:/);
    expect(res.body.error.stack).toBeUndefined();
  });
});
