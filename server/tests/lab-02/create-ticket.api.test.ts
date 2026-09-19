import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAgent, type AuthedAgent } from "../authHelper.js";
import { createTestUser, removeTestUsers } from "../lab-03/helpers.js";
import {
  formatTicketNumber,
  nextSequence,
  parseTicketNumberSequence,
  ticketNumberPrefixFor,
} from "../../src/ticketNumber.js";
import {
  validateCreateTicketBody,
  SUMMARY_MIN,
  SUMMARY_MAX,
  DESCRIPTION_MIN,
  DESCRIPTION_MAX,
} from "../../src/ticketValidation.js";

// Integration test: needs the database migrated and seeded first.
//   npx prisma migrate deploy
//   npm run prisma:seed
const prisma = getPrisma();

let requesterId: number;
let categoryId: number;
let relatedSystemId: number;
// Lab 3 BR-03 — the caller's own session id is the Ticket's owner. `agent`
// signs in as the fixture Requester, so `requesterId` above always matches.
let agent: AuthedAgent;
let otherAgent: AuthedAgent;
let staffAgent: AuthedAgent;

/** Marks rows this suite creates so cleanup never touches other data. */
const SUMMARY_TAG = "[api-test]";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    categoryId,
    relatedSystemId,
    summary: `${SUMMARY_TAG} Laptop battery drains quickly`,
    description:
      "The laptop battery reaches zero within approximately one hour of use.",
    requestedPriority: "MEDIUM",
    ...overrides,
  };
}

/** Each test needs content unique enough to dodge duplicate protection. */
function uniqueBody(overrides: Record<string, unknown> = {}) {
  return validBody({
    summary: `${SUMMARY_TAG} ${Math.random().toString(36).slice(2)} issue`,
    ...overrides,
  });
}

beforeAll(async () => {
  const [requester, other, staff, category, relatedSystem] = await Promise.all([
    createTestUser({ role: "Requester" }),
    createTestUser({ role: "Requester" }),
    createTestUser({ role: "ITStaff" }),
    prisma.category.findFirstOrThrow({
      where: { isActive: true },
      select: { id: true },
    }),
    prisma.relatedSystem.findFirstOrThrow({
      where: { isActive: true },
      select: { id: true },
    }),
  ]);

  requesterId = requester.id;
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;

  agent = await loginAgent(app, { email: requester.email, password: requester.password });
  otherAgent = await loginAgent(app, { email: other.email, password: other.password });
  staffAgent = await loginAgent(app, { email: staff.email, password: staff.password });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await prisma.ticket.deleteMany({
    where: { summary: { contains: SUMMARY_TAG } },
  });
});

afterAll(async () => {
  await removeTestUsers();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// UNIT-01 — Ticket Number generation
// ---------------------------------------------------------------------------
describe("UNIT-01 — ticket number generation (BR-01, AC-05)", () => {
  it("formats numbers as TT-YYYYMMDD-NNNN", () => {
    expect(formatTicketNumber(new Date(2026, 8, 5), 1)).toBe(
      "TT-20260905-0001",
    );
    expect(formatTicketNumber(new Date(2026, 11, 31), 42)).toBe(
      "TT-20261231-0042",
    );
  });

  it("starts at 1 each day and increments from the latest number", () => {
    expect(nextSequence(null)).toBe(1);
    expect(nextSequence("TT-20260905-0001")).toBe(2);
    expect(nextSequence("TT-20260905-0099")).toBe(100);
  });

  it("ignores values that do not match the documented format", () => {
    expect(parseTicketNumberSequence("nonsense")).toBeNull();
    expect(nextSequence("nonsense")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// UNIT-02 / UNIT-03 — validation unit coverage
// ---------------------------------------------------------------------------
describe("UNIT-02 / UNIT-03 — summary and description validation (BR-11, BR-12, AC-07)", () => {
  const base = {
    categoryId: 1,
    relatedSystemId: 1,
    summary: "Valid summary",
    description: "A description that is comfortably long enough.",
    requestedPriority: "LOW",
  };

  it("accepts a valid body and trims text (FR-12)", () => {
    const { input, fieldErrors } = validateCreateTicketBody({
      ...base,
      summary: "   Padded summary   ",
      description: "   A description that is long enough.   ",
    });

    expect(fieldErrors).toEqual({});
    expect(input?.summary).toBe("Padded summary");
    expect(input?.description).toBe("A description that is long enough.");
  });

  it("rejects a summary that is empty, too short, or too long (BR-11)", () => {
    expect(
      validateCreateTicketBody({ ...base, summary: "   " }).fieldErrors.summary,
    ).toBeDefined();
    expect(
      validateCreateTicketBody({ ...base, summary: "a".repeat(SUMMARY_MIN - 1) })
        .fieldErrors.summary,
    ).toBeDefined();
    expect(
      validateCreateTicketBody({ ...base, summary: "a".repeat(SUMMARY_MAX + 1) })
        .fieldErrors.summary,
    ).toBeDefined();
    // Boundaries are valid.
    expect(
      validateCreateTicketBody({ ...base, summary: "a".repeat(SUMMARY_MIN) })
        .fieldErrors.summary,
    ).toBeUndefined();
    expect(
      validateCreateTicketBody({ ...base, summary: "a".repeat(SUMMARY_MAX) })
        .fieldErrors.summary,
    ).toBeUndefined();
  });

  it("rejects a description that is empty, too short, or too long (BR-12)", () => {
    expect(
      validateCreateTicketBody({ ...base, description: "  " }).fieldErrors
        .description,
    ).toBeDefined();
    expect(
      validateCreateTicketBody({
        ...base,
        description: "a".repeat(DESCRIPTION_MIN - 1),
      }).fieldErrors.description,
    ).toBeDefined();
    expect(
      validateCreateTicketBody({
        ...base,
        description: "a".repeat(DESCRIPTION_MAX + 1),
      }).fieldErrors.description,
    ).toBeDefined();
    expect(
      validateCreateTicketBody({
        ...base,
        description: "a".repeat(DESCRIPTION_MAX),
      }).fieldErrors.description,
    ).toBeUndefined();
  });

  it("rejects an unknown priority (BR-15)", () => {
    expect(
      validateCreateTicketBody({ ...base, requestedPriority: "CRITICAL" })
        .fieldErrors.requestedPriority,
    ).toBeDefined();
  });

  it("rejects non-object bodies", () => {
    expect(validateCreateTicketBody(null).fieldErrors).not.toEqual({});
    expect(validateCreateTicketBody("string").fieldErrors).not.toEqual({});
    expect(validateCreateTicketBody([]).fieldErrors).not.toEqual({});
  });
});

// ---------------------------------------------------------------------------
// API-02 / API-03 — successful creation
// ---------------------------------------------------------------------------
describe("API-02 / API-03 — valid ticket creation and backend defaults (AC-05, AC-06)", () => {
  it("returns 201 and saves exactly one ticket (AC-05)", async () => {
    const before = await prisma.ticket.count();
    const res = await agent.post("/api/tickets").send(uniqueBody());

    expect(res.status).toBe(201);
    expect(await prisma.ticket.count()).toBe(before + 1);
  });

  it("generates a unique ticket number in the documented format (BR-01)", async () => {
    const res = await agent.post("/api/tickets").send(uniqueBody());

    expect(res.body.data.ticketNumber).toMatch(/^TT-\d{8}-\d{4,}$/);

    const stored = await prisma.ticket.findUnique({
      where: { ticketNumber: res.body.data.ticketNumber },
    });
    expect(stored).not.toBeNull();
  });

  it("issues increasing ticket numbers for consecutive tickets", async () => {
    const first = await agent.post("/api/tickets").send(uniqueBody());
    const second = await agent.post("/api/tickets").send(uniqueBody());

    const prefix = ticketNumberPrefixFor(new Date());
    expect(first.body.data.ticketNumber.startsWith(prefix)).toBe(true);
    expect(second.body.data.ticketNumber).not.toBe(
      first.body.data.ticketNumber,
    );
    expect(
      parseTicketNumberSequence(second.body.data.ticketNumber)!,
    ).toBeGreaterThan(parseTicketNumberSequence(first.body.data.ticketNumber)!);
  });

  it("sets Current Status to New and a backend Ticket Date (AC-06)", async () => {
    const sentAt = Date.now();
    const res = await agent.post("/api/tickets").send(uniqueBody());

    expect(res.body.data.currentStatus).toBe("New");

    const ticketDate = new Date(res.body.data.ticketDate).getTime();
    // Generated server-side at creation, not supplied by the client (BR-03).
    expect(ticketDate).toBeGreaterThanOrEqual(sentAt - 60_000);
    expect(ticketDate).toBeLessThanOrEqual(Date.now() + 60_000);
  });

  it("ignores client-supplied ticketNumber, ticketDate, and status", async () => {
    const res = await agent
      .post("/api/tickets")
      .send(
        uniqueBody({
          ticketNumber: "HACKED-0001",
          ticketDate: "1999-01-01T00:00:00.000Z",
          currentStatus: "Closed",
          id: 999999,
        }),
      );

    expect(res.status).toBe(201);
    expect(res.body.data.ticketNumber).not.toBe("HACKED-0001");
    expect(res.body.data.currentStatus).toBe("New");
    expect(new Date(res.body.data.ticketDate).getFullYear()).toBeGreaterThan(
      2000,
    );
  });

  it("associates the ticket with the authenticated requester, ignoring a spoofed requesterId (BR-03, AC-03)", async () => {
    const res = await agent
      .post("/api/tickets")
      .send(uniqueBody({ requesterId: 999999 }));

    expect(res.status).toBe(201);
    expect(res.body.data.requester.id).toBe(requesterId);

    const stored = await prisma.ticket.findUnique({
      where: { id: res.body.data.id },
      select: { requesterId: true },
    });
    expect(stored?.requesterId).toBe(requesterId);
  });

  it("associates the ticket with the chosen category and related system", async () => {
    const res = await agent.post("/api/tickets").send(uniqueBody());

    expect(res.body.data.category.id).toBe(categoryId);
    expect(res.body.data.relatedSystem.id).toBe(relatedSystemId);
    expect(res.body.data.category.name).toEqual(expect.any(String));
    expect(res.body.data.relatedSystem.name).toEqual(expect.any(String));
  });

  it("sets IT Priority to a copy of Requested Priority (BR-37)", async () => {
    const res = await agent.post("/api/tickets").send(uniqueBody({ requestedPriority: "HIGH" }));

    const stored = await prisma.ticket.findUniqueOrThrow({
      where: { id: res.body.data.id },
      select: { itPriority: true, requestedPriority: true, ticketOwnerId: true },
    });
    expect(stored.itPriority).toBe("HIGH");
    expect(stored.requestedPriority).toBe("HIGH");
    // BR-33 — new Tickets are unassigned.
    expect(stored.ticketOwnerId).toBeNull();
  });

  it("persists trimmed text (FR-12)", async () => {
    const summary = `${SUMMARY_TAG} Whitespace around the summary`;
    const res = await agent
      .post("/api/tickets")
      .send(
        validBody({
          summary: `   ${summary}   `,
          description: "   Description with padding that is long enough.   ",
        }),
      );

    expect(res.body.data.summary).toBe(summary);
    expect(res.body.data.description).toBe(
      "Description with padding that is long enough.",
    );
  });
});

// ---------------------------------------------------------------------------
// API-04 — validation failures (AC-08)
// ---------------------------------------------------------------------------
describe("API-04 — invalid ticket request (AC-08)", () => {
  async function expectRejected(
    body: Record<string, unknown>,
    field: string,
  ): Promise<void> {
    const before = await prisma.ticket.count();
    const res = await agent.post("/api/tickets").send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fieldErrors[field]).toEqual(expect.any(String));
    // Nothing is saved when validation fails.
    expect(await prisma.ticket.count()).toBe(before);
  }

  it("rejects a missing summary", () =>
    expectRejected(uniqueBody({ summary: undefined }), "summary"));

  it("rejects a whitespace-only summary", () =>
    expectRejected(uniqueBody({ summary: "     " }), "summary"));

  it("rejects a too-short summary", () =>
    expectRejected(uniqueBody({ summary: "abc" }), "summary"));

  it("rejects a too-long summary", () =>
    expectRejected(uniqueBody({ summary: "a".repeat(SUMMARY_MAX + 1) }), "summary"));

  it("rejects a missing description", () =>
    expectRejected(uniqueBody({ description: undefined }), "description"));

  it("rejects a too-short description", () =>
    expectRejected(uniqueBody({ description: "short" }), "description"));

  it("rejects a too-long description", () =>
    expectRejected(
      uniqueBody({ description: "a".repeat(DESCRIPTION_MAX + 1) }),
      "description",
    ));

  it("rejects an invalid priority", () =>
    expectRejected(uniqueBody({ requestedPriority: "CRITICAL" }), "requestedPriority"));

  it("rejects a missing priority", () =>
    expectRejected(uniqueBody({ requestedPriority: undefined }), "requestedPriority"));

  it("rejects a nonexistent category (BR-17)", () =>
    expectRejected(uniqueBody({ categoryId: 999999 }), "categoryId"));

  it("rejects a nonexistent related system (BR-17)", () =>
    expectRejected(uniqueBody({ relatedSystemId: 999999 }), "relatedSystemId"));

  it("rejects an empty body", async () => {
    const res = await agent.post("/api/tickets").send({});
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fieldErrors).length).toBeGreaterThan(0);
  });

  it("reports every invalid field at once", async () => {
    const res = await agent
      .post("/api/tickets")
      .send({ summary: "no", description: "no", requestedPriority: "NOPE" });

    const fields = Object.keys(res.body.error.fieldErrors);
    expect(fields).toEqual(
      expect.arrayContaining([
        "summary",
        "description",
        "requestedPriority",
        "categoryId",
        "relatedSystemId",
      ]),
    );
  });

  it("rejects IT Staff and Administrators creating a ticket (AC-20)", async () => {
    const before = await prisma.ticket.count();
    const res = await staffAgent.post("/api/tickets").send(uniqueBody());

    expect(res.status).toBe(403);
    expect(await prisma.ticket.count()).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// API-05 — duplicate submission (AC-09, BR-18)
// ---------------------------------------------------------------------------
describe("API-05 — duplicate submission (AC-09)", () => {
  it("does not create a second ticket for a repeated identical submission", async () => {
    const body = uniqueBody();

    const first = await agent.post("/api/tickets").send(body);
    expect(first.status).toBe(201);

    const before = await prisma.ticket.count();
    const second = await agent.post("/api/tickets").send(body);

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("DUPLICATE_SUBMISSION");
    expect(await prisma.ticket.count()).toBe(before);
  });

  it("points the caller at the ticket their action already created", async () => {
    const body = uniqueBody();
    const first = await agent.post("/api/tickets").send(body);
    const second = await agent.post("/api/tickets").send(body);

    expect(second.body.error.ticketNumber).toBe(first.body.data.ticketNumber);
  });

  it("still allows a genuinely different ticket from the same requester", async () => {
    await agent.post("/api/tickets").send(uniqueBody());
    const other = await agent.post("/api/tickets").send(uniqueBody());

    expect(other.status).toBe(201);
  });

  it("does not block an identical summary from a different requester's session", async () => {
    const body = uniqueBody();
    await agent.post("/api/tickets").send(body);

    const fromOther = await otherAgent.post("/api/tickets").send(body);

    expect(fromOther.status).toBe(201);
  });

  it("creates exactly one ticket when two identical requests are sent together", async () => {
    const body = uniqueBody();
    const before = await prisma.ticket.count();

    const results = await Promise.all([
      agent.post("/api/tickets").send(body),
      agent.post("/api/tickets").send(body),
    ]);

    // Exactly one ticket may be created from one user action (BR-18). The
    // loser of the race is rejected as a duplicate, not silently accepted.
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    expect(await prisma.ticket.count()).toBe(before + 1);
  });
});

// ---------------------------------------------------------------------------
// AC-23 / BR-39 — unexpected errors stay safe
// ---------------------------------------------------------------------------
describe("API-02 — unexpected failure stays safe (AC-23)", () => {
  it("returns a safe 500 without leaking internals", async () => {
    // Silence the deliberate console.error this test provokes.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.category, "findFirst").mockRejectedValue(
      new Error(
        'Invalid `prisma.ticket.create()` at C:\\repo\\server\\src\\tickets.ts:120',
      ),
    );

    const res = await agent.post("/api/tickets").send(uniqueBody());

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe(
      "Could not create the ticket. Please try again.",
    );

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/prisma/i);
    expect(serialized).not.toMatch(/\.ts:/);
    expect(serialized).not.toMatch(/[A-Z]:\\\\|\/repo\//);
    expect(res.body.error.stack).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Reference data for the Create Ticket form
// ---------------------------------------------------------------------------
describe("GET /api/related-systems", () => {
  it("returns active related systems in the documented envelope", async () => {
    const res = await agent.get("/api/related-systems");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(6);
    expect(res.body.data[0]).toEqual({
      id: expect.any(Number),
      name: expect.any(String),
    });
  });

  it("excludes inactive related systems", async () => {
    const inactive = await prisma.relatedSystem.findMany({
      where: { OR: [{ isActive: false }, { NOT: { deletedAt: null } }] },
      select: { id: true },
    });

    const res = await agent.get("/api/related-systems");
    const ids = res.body.data.map((s: { id: number }) => s.id);

    for (const { id } of inactive) expect(ids).not.toContain(id);
  });
});
