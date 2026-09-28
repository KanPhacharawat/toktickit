import { afterAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seedData.js";
import { TICKET_FIXTURES } from "../../prisma/seedTickets.js";
import { getPrisma } from "../../src/prisma.js";

// M-02 (tests.md §5) — the seed is idempotent for Tickets and Actions Taken
// too, and the fixtures cover every dashboard metric with both a zero and a
// non-zero value (AC-38, DoD §10).

const prisma = getPrisma();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("M-02 — Lab 4 seed idempotency and coverage (AC-38)", () => {
  it("running the seed twice produces identical Ticket and Action Taken counts", async () => {
    const first = await seedDatabase(prisma);
    const ticketsAfterFirst = await prisma.ticket.count({
      where: { ticketNumber: { in: TICKET_FIXTURES.map((f) => f.ticketNumber) } },
    });
    const actionsAfterFirst = await prisma.actionTaken.count({
      where: { ticket: { ticketNumber: { in: TICKET_FIXTURES.map((f) => f.ticketNumber) } } },
    });

    const second = await seedDatabase(prisma);
    const ticketsAfterSecond = await prisma.ticket.count({
      where: { ticketNumber: { in: TICKET_FIXTURES.map((f) => f.ticketNumber) } },
    });
    const actionsAfterSecond = await prisma.actionTaken.count({
      where: { ticket: { ticketNumber: { in: TICKET_FIXTURES.map((f) => f.ticketNumber) } } },
    });

    expect(first.tickets).toBe(TICKET_FIXTURES.length);
    expect(second.tickets).toBe(TICKET_FIXTURES.length);
    expect(ticketsAfterSecond).toBe(ticketsAfterFirst);
    expect(actionsAfterSecond).toBe(actionsAfterFirst);
  }, 60_000);

  it("covers all 8 TicketStatus values and all 4 priority levels", async () => {
    const statuses = new Set(TICKET_FIXTURES.map((f) => f.currentStatus));
    const priorities = new Set(TICKET_FIXTURES.map((f) => f.itPriority));

    expect([...statuses].sort()).toEqual(
      [
        "New",
        "Open",
        "InProgress",
        "WaitingForRequester",
        "Resolved",
        "Closed",
        "Reopened",
        "Cancelled",
      ].sort(),
    );
    expect([...priorities].sort()).toEqual(["LOW", "MEDIUM", "HIGH", "URGENT"].sort());
  });

  it("includes both assigned and unassigned Tickets", () => {
    const assigned = TICKET_FIXTURES.filter((f) => f.ticketOwnerEmail).length;
    const unassigned = TICKET_FIXTURES.filter((f) => !f.ticketOwnerEmail).length;
    expect(assigned).toBeGreaterThan(0);
    expect(unassigned).toBeGreaterThan(0);
  });

  it("includes Tickets with zero, one, and many (>=2) Actions Taken", () => {
    const counts = TICKET_FIXTURES.map((f) => f.actions.length);
    expect(counts.some((n) => n === 0)).toBe(true);
    expect(counts.some((n) => n === 1)).toBe(true);
    expect(counts.some((n) => n >= 2)).toBe(true);
  });

  it("includes a Planned action, a Cancelled action, and a non-owner performer", () => {
    const allActions = TICKET_FIXTURES.flatMap((f) => f.actions);
    expect(allActions.some((a) => a.status === "Planned")).toBe(true);
    expect(allActions.some((a) => a.status === "Cancelled")).toBe(true);

    const nonOwnerPerformed = TICKET_FIXTURES.some(
      (f) => f.ticketOwnerEmail && f.actions.some((a) => a.performedByEmail !== f.ticketOwnerEmail),
    );
    expect(nonOwnerPerformed).toBe(true);
  });

  it("leaves one Requester (Requester E) with zero Tickets for the empty-dashboard state", async () => {
    await seedDatabase(prisma);
    const requesterE = await prisma.user.findUniqueOrThrow({
      where: { email: "requester-e@example.com" },
    });
    const requesterEUsedInFixtures = TICKET_FIXTURES.some(
      (f) => f.requesterEmail === "requester-e@example.com",
    );
    const ticketCount = await prisma.ticket.count({ where: { requesterId: requesterE.id } });

    expect(requesterEUsedInFixtures).toBe(false);
    expect(ticketCount).toBe(0);
  }, 60_000);
});
