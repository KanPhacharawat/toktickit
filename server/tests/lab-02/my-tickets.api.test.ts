import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import {
  parseTicketListQuery,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
} from "../../src/ticketListQuery.js";

// Integration test: needs the database migrated and seeded first.
//   npx prisma migrate dev
//   npm run prisma:seed
const prisma = getPrisma();

/** Marks every row this suite creates so cleanup never touches other data. */
const TAG = "[my-tickets-test]";

let ownerId: number;
let otherId: number;
let categoryA: number;
let categoryB: number;
let systemId: number;

interface ListRow {
  id: number;
  ticketNumber: string;
  summary: string;
  category: string;
  requestedPriority: string;
  currentStatus: string;
  updatedAt: string;
}

/** The tickets this suite works with, oldest updatedAt first. */
const FIXTURES = [
  { suffix: "0001", summary: `${TAG} Printer jams constantly`, priority: "LOW", status: "New" },
  { suffix: "0002", summary: `${TAG} VPN disconnects randomly`, priority: "HIGH", status: "InProgress" },
  { suffix: "0003", summary: `${TAG} Laptop battery drains`, priority: "MEDIUM", status: "New" },
  { suffix: "0004", summary: `${TAG} Email sync failure`, priority: "URGENT", status: "Resolved" },
  { suffix: "0005", summary: `${TAG} Printer offline again`, priority: "LOW", status: "New" },
] as const;

const listUrl = (requesterId: number) =>
  `/api/requesters/${requesterId}/tickets`;

/**
 * Dedicated fixture requesters, so this suite's absolute counts cannot be
 * disturbed by the seeded requesters' real tickets or by another suite.
 */
const OWNER_EMAIL = "my-tickets-owner@test.invalid";
const OTHER_EMAIL = "my-tickets-other@test.invalid";

async function removeFixtures() {
  await prisma.ticket.deleteMany({ where: { summary: { contains: TAG } } });
}

beforeAll(async () => {
  const [owner, other, categories, system] = await Promise.all([
    prisma.developmentRequester.upsert({
      where: { email: OWNER_EMAIL },
      update: { isActive: true, deletedAt: null },
      create: { name: "My Tickets Owner", email: OWNER_EMAIL, isActive: true },
      select: { id: true },
    }),
    prisma.developmentRequester.upsert({
      where: { email: OTHER_EMAIL },
      update: { isActive: true, deletedAt: null },
      create: { name: "My Tickets Other", email: OTHER_EMAIL, isActive: true },
      select: { id: true },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      take: 2,
      select: { id: true },
    }),
    prisma.relatedSystem.findFirstOrThrow({
      where: { isActive: true },
      select: { id: true },
    }),
  ]);

  expect(categories.length).toBeGreaterThanOrEqual(2);

  ownerId = owner.id;
  otherId = other.id;
  categoryA = categories[0].id;
  categoryB = categories[1].id;
  systemId = system.id;

  await removeFixtures();

  // Distinct, increasing updatedAt values so ordering assertions are exact.
  const base = new Date("2026-09-01T00:00:00.000Z").getTime();
  for (const [index, fixture] of FIXTURES.entries()) {
    const stamp = new Date(base + index * 86_400_000);
    await prisma.ticket.create({
      data: {
        ticketNumber: `TT-20260901-${fixture.suffix}`,
        ticketDate: stamp,
        createdAt: stamp,
        updatedAt: stamp,
        requesterId: ownerId,
        // Alternate categories so the category filter has something to cut.
        categoryId: index % 2 === 0 ? categoryA : categoryB,
        relatedSystemId: systemId,
        summary: fixture.summary,
        description: `Seeded by the My Tickets API test suite (${fixture.suffix}).`,
        requestedPriority: fixture.priority,
        currentStatus: fixture.status,
      },
    });
  }

  // One ticket owned by a different requester — it must never appear.
  await prisma.ticket.create({
    data: {
      ticketNumber: "TT-20260901-9999",
      requesterId: otherId,
      categoryId: categoryA,
      relatedSystemId: systemId,
      summary: `${TAG} Other requester ticket`,
      description: "Owned by a different requester; must stay invisible.",
      requestedPriority: "LOW",
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await removeFixtures();
  await prisma.developmentRequester.deleteMany({
    where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } },
  });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Query parsing — unit coverage (BR-25, BR-26)
// ---------------------------------------------------------------------------
describe("API-11 — ticket list query validation (BR-25, BR-26)", () => {
  it("applies the documented defaults (BR-24)", () => {
    const { query } = parseTicketListQuery({});
    expect(query).toMatchObject({
      sortBy: "updatedAt",
      sortOrder: "desc",
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      search: "",
      categoryId: null,
      requestedPriority: null,
      currentStatus: null,
    });
  });

  it("accepts every supported page size", () => {
    for (const size of PAGE_SIZES) {
      expect(parseTicketListQuery({ pageSize: String(size) }).query?.pageSize).toBe(size);
    }
  });

  it("rejects unsupported page sizes", () => {
    for (const bad of ["0", "5", "15", "100", "abc", "-10"]) {
      expect(parseTicketListQuery({ pageSize: bad }).fieldErrors.pageSize).toBeDefined();
    }
  });

  it("rejects invalid page numbers", () => {
    for (const bad of ["0", "-1", "1.5", "abc", ""]) {
      const result = parseTicketListQuery({ page: bad });
      // An empty string means "not supplied" and falls back to the default.
      if (bad === "") expect(result.query?.page).toBe(1);
      else expect(result.fieldErrors.page).toBeDefined();
    }
  });

  it("rejects unknown sort fields and orders", () => {
    expect(parseTicketListQuery({ sortBy: "summary" }).fieldErrors.sortBy).toBeDefined();
    expect(parseTicketListQuery({ sortOrder: "sideways" }).fieldErrors.sortOrder).toBeDefined();
  });

  it("rejects unknown filter values", () => {
    expect(
      parseTicketListQuery({ requestedPriority: "CRITICAL" }).fieldErrors.requestedPriority,
    ).toBeDefined();
    expect(
      parseTicketListQuery({ currentStatus: "Pending" }).fieldErrors.currentStatus,
    ).toBeDefined();
    expect(parseTicketListQuery({ categoryId: "abc" }).fieldErrors.categoryId).toBeDefined();
  });

  it("trims the search term", () => {
    expect(parseTicketListQuery({ search: "  printer  " }).query?.search).toBe("printer");
  });
});

// ---------------------------------------------------------------------------
// API-06 — ownership (AC-11)
// ---------------------------------------------------------------------------
describe("API-06 — requester ownership list (AC-11)", () => {
  it("returns only tickets owned by the requester", async () => {
    const res = await request(app).get(listUrl(ownerId)).query({ pageSize: 50 });

    expect(res.status).toBe(200);
    const numbers = res.body.data.map((t: ListRow) => t.ticketNumber);
    expect(numbers).toHaveLength(FIXTURES.length);
    expect(numbers).not.toContain("TT-20260901-9999");
  });

  it("does not leak the owner's tickets to another requester", async () => {
    const res = await request(app).get(listUrl(otherId)).query({ pageSize: 50 });

    const numbers = res.body.data.map((t: ListRow) => t.ticketNumber);
    expect(numbers).toContain("TT-20260901-9999");
    for (const fixture of FIXTURES) {
      expect(numbers).not.toContain(`TT-20260901-${fixture.suffix}`);
    }
  });

  it("returns an empty page for a requester with no tickets", async () => {
    const res = await request(app).get(listUrl(999999));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.totalItems).toBe(0);
  });

  it("rejects a non-numeric requester id", async () => {
    const res = await request(app).get("/api/requesters/abc/tickets");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns the documented row shape", async () => {
    const res = await request(app).get(listUrl(ownerId));

    expect(Object.keys(res.body.data[0]).sort()).toEqual([
      "category",
      "currentStatus",
      "id",
      "requestedPriority",
      "summary",
      "ticketNumber",
      "updatedAt",
    ]);
    // Category is the display name, not an object.
    expect(typeof res.body.data[0].category).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// API-08 — search (AC-13)
// ---------------------------------------------------------------------------
describe("API-08 — ticket search (AC-13)", () => {
  it("matches the ticket summary", async () => {
    const res = await request(app).get(listUrl(ownerId)).query({ search: "Printer" });

    const summaries = res.body.data.map((t: ListRow) => t.summary);
    expect(summaries).toHaveLength(2);
    expect(summaries.every((s: string) => /printer/i.test(s))).toBe(true);
  });

  it("matches the ticket number", async () => {
    const res = await request(app).get(listUrl(ownerId)).query({ search: "TT-20260901-0002" });

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].ticketNumber).toBe("TT-20260901-0002");
  });

  it("is case-insensitive", async () => {
    const lower = await request(app).get(listUrl(ownerId)).query({ search: "printer" });
    const upper = await request(app).get(listUrl(ownerId)).query({ search: "PRINTER" });

    expect(lower.body.meta.totalItems).toBe(upper.body.meta.totalItems);
    expect(upper.body.meta.totalItems).toBe(2);
  });

  it("stays inside the owner scope", async () => {
    // "Other requester ticket" exists, but not for this owner.
    const res = await request(app).get(listUrl(ownerId)).query({ search: "Other requester" });
    expect(res.body.data).toHaveLength(0);
  });

  it("returns an empty page when nothing matches (BR-27)", async () => {
    const res = await request(app)
      .get(listUrl(ownerId))
      .query({ search: "nothing-matches-this-term" });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.totalItems).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// API-09 — filters (AC-14)
// ---------------------------------------------------------------------------
describe("API-09 — ticket filters (AC-14)", () => {
  it("filters by requested priority", async () => {
    const res = await request(app).get(listUrl(ownerId)).query({ requestedPriority: "LOW" });

    expect(res.body.data).toHaveLength(2);
    expect(
      res.body.data.every((t: ListRow) => t.requestedPriority === "LOW"),
    ).toBe(true);
  });

  it("filters by current status", async () => {
    const res = await request(app).get(listUrl(ownerId)).query({ currentStatus: "New" });

    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.every((t: ListRow) => t.currentStatus === "New")).toBe(true);
  });

  it("filters by category", async () => {
    const res = await request(app).get(listUrl(ownerId)).query({ categoryId: categoryB });

    // Fixtures at odd indexes use category B.
    expect(res.body.data).toHaveLength(2);
  });

  it("combines filters and search", async () => {
    const res = await request(app)
      .get(listUrl(ownerId))
      .query({ search: "Printer", requestedPriority: "LOW" });

    expect(res.body.data).toHaveLength(2);
  });

  it("returns nothing when filters exclude every ticket", async () => {
    const res = await request(app)
      .get(listUrl(ownerId))
      .query({ requestedPriority: "URGENT", currentStatus: "New" });

    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.totalItems).toBe(0);
  });

  it("rejects an invalid filter value with 400", async () => {
    const res = await request(app)
      .get(listUrl(ownerId))
      .query({ requestedPriority: "CRITICAL" });

    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors.requestedPriority).toEqual(expect.any(String));
  });
});

// ---------------------------------------------------------------------------
// API-10 — sorting (AC-15)
// ---------------------------------------------------------------------------
describe("API-10 — ticket sorting (AC-15)", () => {
  it("defaults to last updated descending (BR-24)", async () => {
    const res = await request(app).get(listUrl(ownerId)).query({ pageSize: 50 });

    const updated = res.body.data.map((t: ListRow) => new Date(t.updatedAt).getTime());
    expect(updated).toEqual([...updated].sort((a, b) => b - a));
    // The newest fixture is 0005.
    expect(res.body.data[0].ticketNumber).toBe("TT-20260901-0005");
  });

  it("sorts by ticket number in both directions", async () => {
    const asc = await request(app)
      .get(listUrl(ownerId))
      .query({ sortBy: "ticketNumber", sortOrder: "asc", pageSize: 50 });
    const desc = await request(app)
      .get(listUrl(ownerId))
      .query({ sortBy: "ticketNumber", sortOrder: "desc", pageSize: 50 });

    const ascNumbers = asc.body.data.map((t: ListRow) => t.ticketNumber);
    expect(ascNumbers).toEqual([...ascNumbers].sort());
    expect(desc.body.data.map((t: ListRow) => t.ticketNumber)).toEqual(
      [...ascNumbers].reverse(),
    );
  });

  it("sorts by ticket date ascending", async () => {
    const res = await request(app)
      .get(listUrl(ownerId))
      .query({ sortBy: "ticketDate", sortOrder: "asc", pageSize: 50 });

    expect(res.body.data[0].ticketNumber).toBe("TT-20260901-0001");
  });

  it("applies ticket number descending as the secondary sort (BR-24)", async () => {
    // Two tickets share an updatedAt value, so only the secondary sort can
    // decide their order.
    const shared = new Date("2026-09-10T00:00:00.000Z");
    await prisma.ticket.updateMany({
      where: {
        ticketNumber: { in: ["TT-20260901-0001", "TT-20260901-0002"] },
      },
      data: { updatedAt: shared },
    });

    const res = await request(app).get(listUrl(ownerId)).query({ pageSize: 50 });
    const numbers = res.body.data.map((t: ListRow) => t.ticketNumber);

    expect(numbers[0]).toBe("TT-20260901-0002");
    expect(numbers[1]).toBe("TT-20260901-0001");

    // Restore the distinct timestamps for the remaining tests.
    const base = new Date("2026-09-01T00:00:00.000Z").getTime();
    await prisma.ticket.update({
      where: { ticketNumber: "TT-20260901-0001" },
      data: { updatedAt: new Date(base) },
    });
    await prisma.ticket.update({
      where: { ticketNumber: "TT-20260901-0002" },
      data: { updatedAt: new Date(base + 86_400_000) },
    });
  });

  it("rejects an unsupported sort field with 400", async () => {
    const res = await request(app).get(listUrl(ownerId)).query({ sortBy: "summary" });

    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors.sortBy).toEqual(expect.any(String));
  });

  it("rejects an unsupported sort order with 400", async () => {
    const res = await request(app).get(listUrl(ownerId)).query({ sortOrder: "sideways" });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// API-11 — pagination (AC-16)
// ---------------------------------------------------------------------------
describe("API-11 — pagination (AC-16)", () => {
  it("returns accurate pagination metadata", async () => {
    const res = await request(app).get(listUrl(ownerId)).query({ pageSize: 10 });

    expect(res.body.meta).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: FIXTURES.length,
      totalPages: 1,
    });
  });

  it("returns only the requested page", async () => {
    const first = await request(app)
      .get(listUrl(ownerId))
      .query({ pageSize: 10, page: 1, sortBy: "ticketNumber", sortOrder: "asc" });

    // pageSize 10 is the smallest supported size, so page through with it
    // against the five fixtures: everything lands on page 1.
    expect(first.body.data).toHaveLength(FIXTURES.length);
    expect(first.body.meta.totalPages).toBe(1);

    const second = await request(app)
      .get(listUrl(ownerId))
      .query({ pageSize: 10, page: 2, sortBy: "ticketNumber", sortOrder: "asc" });

    // A page beyond the end is valid and simply empty.
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual([]);
    expect(second.body.meta.page).toBe(2);
    expect(second.body.meta.totalItems).toBe(FIXTURES.length);
  });

  it("counts every match, not just the current page", async () => {
    const res = await request(app)
      .get(listUrl(ownerId))
      .query({ pageSize: 10, search: "Printer" });

    expect(res.body.meta.totalItems).toBe(2);
    expect(res.body.data).toHaveLength(2);
  });

  it("rejects an unsupported page size with 400 (BR-26)", async () => {
    const res = await request(app).get(listUrl(ownerId)).query({ pageSize: 15 });

    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors.pageSize).toEqual(expect.any(String));
  });

  it("rejects page 0 and negative pages with 400 (BR-26)", async () => {
    for (const page of ["0", "-3"]) {
      const res = await request(app).get(listUrl(ownerId)).query({ page });
      expect(res.status).toBe(400);
      expect(res.body.error.fieldErrors.page).toEqual(expect.any(String));
    }
  });
});

// ---------------------------------------------------------------------------
// The /api/tickets alias
// ---------------------------------------------------------------------------
describe("GET /api/tickets", () => {
  it("returns the same list when given a requesterId", async () => {
    const viaPath = await request(app).get(listUrl(ownerId)).query({ pageSize: 50 });
    const viaQuery = await request(app)
      .get("/api/tickets")
      .query({ requesterId: ownerId, pageSize: 50 });

    expect(viaQuery.status).toBe(200);
    expect(viaQuery.body).toEqual(viaPath.body);
  });

  it("requires a requester (BR-06)", async () => {
    const res = await request(app).get("/api/tickets");

    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors.requesterId).toEqual(expect.any(String));
  });

  it("honours filters and sorting like the documented route", async () => {
    const res = await request(app)
      .get("/api/tickets")
      .query({ requesterId: ownerId, search: "Printer", sortBy: "ticketNumber", sortOrder: "asc" });

    expect(res.body.data.map((t: ListRow) => t.ticketNumber)).toEqual([
      "TT-20260901-0001",
      "TT-20260901-0005",
    ]);
  });
});

// ---------------------------------------------------------------------------
// AC-23 / BR-39 — unexpected errors stay safe
// ---------------------------------------------------------------------------
describe("GET ticket list — unexpected failure", () => {
  it("returns a safe 500 without leaking internals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.ticket, "count").mockRejectedValue(
      new Error('Invalid `prisma.ticket.count()` at C:\\repo\\server\\src\\tickets.ts:88'),
    );

    const res = await request(app).get(listUrl(ownerId));

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Could not load tickets. Please try again.");

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/prisma/i);
    expect(serialized).not.toMatch(/\.ts:/);
    expect(res.body.error.stack).toBeUndefined();
  });
});
