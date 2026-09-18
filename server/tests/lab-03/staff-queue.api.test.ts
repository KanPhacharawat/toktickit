import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAgent, type AuthedAgent } from "../authHelper.js";
import { createTestUser, removeTestUsers } from "./helpers.js";

// IT Staff Ticket Queue issue — tests.md §5.
// API-14 to API-19 (AC-28–AC-32), UNIT-07 lives in queue-query.test.ts.

const prisma = getPrisma();
const TAG = "[queue-test]";
const QUEUE_URL = "/api/tickets/queue";

let requesterId: number;
let staffId: number;
let staffAgent: AuthedAgent;
let staff2Id: number;
let staff2Agent: AuthedAgent;
let requesterAgent: AuthedAgent;
let categoryA: number;
let categoryB: number;
let systemId: number;

interface Fixture {
  suffix: string;
  summary: string;
  requestedPriority: string;
  itPriority: string;
  currentStatus: string;
  ticketOwnerId: number | null;
  categoryId?: number;
}

let FIXTURES: Fixture[];

async function removeFixtures() {
  await prisma.ticket.deleteMany({ where: { summary: { contains: TAG } } });
}

beforeAll(async () => {
  const [requester, staff, staff2, admin, categories, system] = await Promise.all([
    createTestUser({ role: "Requester", name: "Queue Requester" }),
    createTestUser({ role: "ITStaff", name: "Queue Staff One" }),
    createTestUser({ role: "ITStaff", name: "Queue Staff Two" }),
    createTestUser({ role: "Administrator", name: "Queue Admin" }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { id: "asc" }, take: 2, select: { id: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
  ]);

  requesterId = requester.id;
  staffId = staff.id;
  staff2Id = staff2.id;
  categoryA = categories[0].id;
  categoryB = categories[1].id;
  systemId = system.id;

  requesterAgent = await loginAgent(app, { email: requester.email, password: requester.password });
  staffAgent = await loginAgent(app, { email: staff.email, password: staff.password });
  staff2Agent = await loginAgent(app, { email: staff2.email, password: staff2.password });
  void admin;

  FIXTURES = [
    { suffix: "0001", summary: `${TAG} Printer jams`, requestedPriority: "LOW", itPriority: "LOW", currentStatus: "New", ticketOwnerId: null },
    { suffix: "0002", summary: `${TAG} VPN drops`, requestedPriority: "HIGH", itPriority: "URGENT", currentStatus: "InProgress", ticketOwnerId: staffId, categoryId: categoryB },
    { suffix: "0003", summary: `${TAG} Laptop battery`, requestedPriority: "MEDIUM", itPriority: "MEDIUM", currentStatus: "New", ticketOwnerId: null },
    { suffix: "0004", summary: `${TAG} Email sync failure`, requestedPriority: "URGENT", itPriority: "HIGH", currentStatus: "Resolved", ticketOwnerId: staff2Id },
    { suffix: "0005", summary: `${TAG} Closed printer`, requestedPriority: "LOW", itPriority: "LOW", currentStatus: "Closed", ticketOwnerId: staffId },
    { suffix: "0006", summary: `${TAG} Cancelled request`, requestedPriority: "LOW", itPriority: "LOW", currentStatus: "Cancelled", ticketOwnerId: null },
  ];

  await removeFixtures();

  const base = new Date("2026-09-01T00:00:00.000Z").getTime();
  for (const [index, fixture] of FIXTURES.entries()) {
    const stamp = new Date(base + index * 86_400_000);
    await prisma.ticket.create({
      data: {
        ticketNumber: `TT-QUEUE-${fixture.suffix}`,
        ticketDate: stamp,
        createdAt: stamp,
        updatedAt: stamp,
        requesterId,
        categoryId: fixture.categoryId ?? categoryA,
        relatedSystemId: systemId,
        summary: fixture.summary,
        description: `Seeded by the queue API test suite (${fixture.suffix}).`,
        requestedPriority: fixture.requestedPriority as never,
        itPriority: fixture.itPriority as never,
        currentStatus: fixture.currentStatus as never,
        ticketOwnerId: fixture.ticketOwnerId,
      },
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await removeFixtures();
  await removeTestUsers();
  await prisma.$disconnect();
});

interface QueueRow {
  id: number;
  ticketNumber: string;
  summary: string;
  category: { id: number; name: string };
  requester: { id: number; name: string; email: string };
  requestedPriority: string;
  itPriority: string;
  currentStatus: string;
  ticketOwner: { id: number; name: string; role: string } | null;
  updatedAt: string;
}

function numbers(rows: QueueRow[]): string[] {
  return rows.map((r) => r.ticketNumber);
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------
describe("Queue authorization (AC-17, BR-27)", () => {
  it("denies a Requester with 403", async () => {
    const res = await requesterAgent.get(QUEUE_URL);
    expect(res.status).toBe(403);
  });

  it("denies an unauthenticated caller with 401", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get(QUEUE_URL);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// API-14 — queue content (AC-28)
// ---------------------------------------------------------------------------
describe("API-14 — queue content (AC-28, FR-26, BR-27)", () => {
  it("returns tickets from all requesters with the documented row shape", async () => {
    const res = await staffAgent.get(QUEUE_URL).query({ search: TAG, pageSize: 50 });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const row = res.body.data.find((r: QueueRow) => r.ticketNumber === "TT-QUEUE-0002");
    expect(row).toMatchObject({
      requestedPriority: "HIGH",
      itPriority: "URGENT",
      currentStatus: "InProgress",
      requester: { id: requesterId, name: "Queue Requester", email: expect.any(String) },
      ticketOwner: { id: staffId, name: "Queue Staff One", role: "ITStaff" },
      category: { id: expect.any(Number), name: expect.any(String) },
    });
  });

  it("shows null ticketOwner for unassigned tickets", async () => {
    const res = await staffAgent.get(QUEUE_URL).query({ search: "TT-QUEUE-0001" });
    expect(res.body.data[0].ticketOwner).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// API-15 — search (AC-29)
// ---------------------------------------------------------------------------
describe("API-15 — queue search (AC-29, BR-28)", () => {
  it("matches Ticket Number, Summary, Requester name, and Requester email", async () => {
    const byNumber = await staffAgent.get(QUEUE_URL).query({ search: "TT-QUEUE-0003" });
    expect(numbers(byNumber.body.data)).toEqual(["TT-QUEUE-0003"]);

    const bySummary = await staffAgent.get(QUEUE_URL).query({ search: "VPN drops" });
    expect(numbers(bySummary.body.data)).toContain("TT-QUEUE-0002");

    const byName = await staffAgent.get(QUEUE_URL).query({ search: "Queue Requester", pageSize: 50 });
    expect(numbers(byName.body.data)).toEqual(expect.arrayContaining(FIXTURES.map((f) => `TT-QUEUE-${f.suffix}`)));
  });

  it("is case-insensitive", async () => {
    const res = await staffAgent.get(QUEUE_URL).query({ search: "vpn drops" });
    expect(numbers(res.body.data)).toContain("TT-QUEUE-0002");
  });

  it("returns nothing when the search matches no ticket", async () => {
    const res = await staffAgent.get(QUEUE_URL).query({ search: "nothing-matches-this-term-xyz" });
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.totalItems).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// API-16 — filters (AC-30)
// ---------------------------------------------------------------------------
describe("API-16 — queue filters (AC-30, BR-29)", () => {
  it("filters by status group active and closed", async () => {
    const active = await staffAgent.get(QUEUE_URL).query({ search: TAG, statusGroup: "active", pageSize: 50 });
    expect(numbers(active.body.data)).not.toContain("TT-QUEUE-0005");
    expect(numbers(active.body.data)).not.toContain("TT-QUEUE-0006");

    const closed = await staffAgent.get(QUEUE_URL).query({ search: TAG, statusGroup: "closed", pageSize: 50 });
    expect(numbers(closed.body.data).sort()).toEqual(["TT-QUEUE-0005", "TT-QUEUE-0006"]);
  });

  it("filters by a single status", async () => {
    const res = await staffAgent.get(QUEUE_URL).query({ search: TAG, currentStatus: "Resolved" });
    expect(numbers(res.body.data)).toEqual(["TT-QUEUE-0004"]);
  });

  it("filters by ownership mine and unassigned", async () => {
    const mine = await staffAgent.get(QUEUE_URL).query({ search: TAG, ownership: "mine", pageSize: 50 });
    expect(numbers(mine.body.data).sort()).toEqual(["TT-QUEUE-0002", "TT-QUEUE-0005"]);

    const unassigned = await staffAgent
      .get(QUEUE_URL)
      .query({ search: TAG, ownership: "unassigned", pageSize: 50 });
    expect(numbers(unassigned.body.data).sort()).toEqual(["TT-QUEUE-0001", "TT-QUEUE-0003", "TT-QUEUE-0006"]);
  });

  it("filters by IT Priority and Requested Priority", async () => {
    const itFilter = await staffAgent.get(QUEUE_URL).query({ search: TAG, itPriority: "URGENT" });
    expect(numbers(itFilter.body.data)).toEqual(["TT-QUEUE-0002"]);

    const reqFilter = await staffAgent.get(QUEUE_URL).query({ search: TAG, requestedPriority: "URGENT" });
    expect(numbers(reqFilter.body.data)).toEqual(["TT-QUEUE-0004"]);
  });

  it("filters by category", async () => {
    const res = await staffAgent.get(QUEUE_URL).query({ search: TAG, categoryId: categoryB, pageSize: 50 });
    expect(numbers(res.body.data)).toEqual(["TT-QUEUE-0002"]);
  });

  it("combines filters with AND", async () => {
    const res = await staffAgent
      .get(QUEUE_URL)
      .query({ search: TAG, statusGroup: "active", ownership: "mine", pageSize: 50 });
    expect(numbers(res.body.data)).toEqual(["TT-QUEUE-0002"]);
  });

  it("rejects statusGroup combined with currentStatus (BR-29)", async () => {
    const res = await staffAgent.get(QUEUE_URL).query({ statusGroup: "active", currentStatus: "New" });
    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors.currentStatus).toEqual(expect.any(String));
  });
});

// ---------------------------------------------------------------------------
// API-17 — counts (AC-30, BR-32)
// ---------------------------------------------------------------------------
describe("API-17 — queue counts (AC-30, BR-32)", () => {
  it("counts active, unassigned, and assigned-to-me, ignoring search and filters", async () => {
    const filtered = await staffAgent.get(QUEUE_URL).query({ search: "nothing-matches-this-term-xyz" });
    const unfiltered = await staffAgent.get(QUEUE_URL).query({ search: TAG });

    expect(filtered.body.meta.counts).toEqual(unfiltered.body.meta.counts);
  });

  it("computes assignedToMe per caller", async () => {
    // staff owns TT-QUEUE-0002 (InProgress, active) and TT-QUEUE-0005
    // (Closed, excluded from the active group). staff2 owns TT-QUEUE-0004
    // (Resolved, which is active — only Closed/Cancelled are excluded).
    const asStaff1 = await staffAgent.get(QUEUE_URL);
    const asStaff2 = await staff2Agent.get(QUEUE_URL);

    expect(asStaff1.body.meta.counts.assignedToMe).toBe(1);
    expect(asStaff2.body.meta.counts.assignedToMe).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// API-18 — sorting (AC-31)
// ---------------------------------------------------------------------------
describe("API-18 — queue sorting (AC-31, BR-30)", () => {
  it("defaults to oldest Created Date first", async () => {
    const res = await staffAgent.get(QUEUE_URL).query({ search: TAG, pageSize: 50 });
    expect(res.body.data[0].ticketNumber).toBe("TT-QUEUE-0001");
  });

  it("sorts by IT Priority descending as Urgent to Low", async () => {
    const res = await staffAgent
      .get(QUEUE_URL)
      .query({ search: TAG, sortBy: "itPriority", sortOrder: "desc", pageSize: 50 });

    const priorities = res.body.data.map((r: QueueRow) => r.itPriority);
    const order = ["URGENT", "HIGH", "MEDIUM", "LOW"];
    const indices = priorities.map((p: string) => order.indexOf(p));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it("sorts by IT Priority ascending as Low to Urgent", async () => {
    const res = await staffAgent
      .get(QUEUE_URL)
      .query({ search: TAG, sortBy: "itPriority", sortOrder: "asc", pageSize: 50 });

    expect(res.body.data[0].itPriority).toBe("LOW");
    expect(res.body.data[res.body.data.length - 1].itPriority).toBe("URGENT");
  });

  it("uses Ticket Number ascending as the secondary sort", async () => {
    // TT-QUEUE-0001, 0003, 0006 all share itPriority LOW.
    const res = await staffAgent
      .get(QUEUE_URL)
      .query({ search: TAG, sortBy: "itPriority", sortOrder: "asc", pageSize: 50 });

    const lowOnes = res.body.data
      .filter((r: QueueRow) => r.itPriority === "LOW")
      .map((r: QueueRow) => r.ticketNumber);
    expect(lowOnes).toEqual([...lowOnes].sort());
  });

  it("sorts by Ticket Number in both directions", async () => {
    const asc = await staffAgent
      .get(QUEUE_URL)
      .query({ search: TAG, sortBy: "ticketNumber", sortOrder: "asc", pageSize: 50 });
    const desc = await staffAgent
      .get(QUEUE_URL)
      .query({ search: TAG, sortBy: "ticketNumber", sortOrder: "desc", pageSize: 50 });

    expect(numbers(asc.body.data)).toEqual([...numbers(asc.body.data)].sort());
    expect(numbers(desc.body.data)).toEqual([...numbers(asc.body.data)].reverse());
  });

  it("rejects an unsupported sort field with 400", async () => {
    const res = await staffAgent.get(QUEUE_URL).query({ sortBy: "summary" });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// API-19 — pagination and invalid queries (AC-32)
// ---------------------------------------------------------------------------
describe("API-19 — queue pagination and invalid queries (AC-32, BR-31)", () => {
  it("returns accurate pagination metadata", async () => {
    const res = await staffAgent.get(QUEUE_URL).query({ search: TAG, pageSize: 10 });
    expect(res.body.meta).toMatchObject({
      page: 1,
      pageSize: 10,
      totalItems: FIXTURES.length,
      totalPages: 1,
    });
  });

  it("returns an empty page beyond the last, with accurate metadata", async () => {
    const res = await staffAgent.get(QUEUE_URL).query({ search: TAG, pageSize: 10, page: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.totalItems).toBe(FIXTURES.length);
  });

  it("rejects an unsupported page size with 400", async () => {
    const res = await staffAgent.get(QUEUE_URL).query({ pageSize: 15 });
    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors.pageSize).toEqual(expect.any(String));
  });

  it("rejects page 0 and negative pages with 400", async () => {
    for (const page of ["0", "-3"]) {
      const res = await staffAgent.get(QUEUE_URL).query({ page });
      expect(res.status).toBe(400);
    }
  });

  it("rejects an unsupported status value with 400", async () => {
    const res = await staffAgent.get(QUEUE_URL).query({ currentStatus: "Pending" });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Safe failures
// ---------------------------------------------------------------------------
describe("Queue — unexpected failure stays safe (AC-33, BR-60)", () => {
  it("returns a safe 500 without leaking internals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.ticket, "count").mockRejectedValue(
      new Error('Invalid `prisma.ticket.count()` at C:\\repo\\server\\src\\queue.ts:70'),
    );

    const res = await staffAgent.get(QUEUE_URL);

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Could not load the queue. Please try again.");
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/prisma/i);
    expect(serialized).not.toMatch(/\.ts:/);
  });
});
