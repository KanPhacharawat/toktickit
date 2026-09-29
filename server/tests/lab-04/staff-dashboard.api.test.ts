import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { OPEN_LIKE_STATUSES } from "../../src/ticketListQuery.js";
import { loginAgent, type AuthedAgent } from "../authHelper.js";
import { createTestUser, removeTestUsers } from "../lab-03/helpers.js";

// Staff / Administrator Dashboard — specification.md §4.3/§5.4, api-spec.md
// §4.2/§4.3. tests.md A-04 (FR-19, FR-20, BR-33–BR-44, AC-24, AC-29) plus the
// AC-25 drill-down equality and AC-27 authorization checks.

const prisma = getPrisma();
const TAG = "[staff-dashboard-test]";

const OPEN_LIKE = OPEN_LIKE_STATUSES;

let requesterId: number;
let requesterAgent: AuthedAgent;
let staffId: number;
let staffAgent: AuthedAgent;
let adminAgent: AuthedAgent;
let categoryId: number;
let systemId: number;

async function removeFixtures() {
  await prisma.actionTaken.deleteMany({ where: { ticket: { summary: { contains: TAG } } } });
  await prisma.ticket.deleteMany({ where: { summary: { contains: TAG } } });
}

async function createTicket(overrides: {
  summary: string;
  currentStatus?: string;
  itPriority?: string;
  ticketOwnerId?: number | null;
}) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TT-SDASH-${Math.random().toString(36).slice(2, 10)}`,
      requesterId,
      categoryId,
      relatedSystemId: systemId,
      summary: `${TAG} ${overrides.summary}`,
      description: "Created by the staff dashboard test suite.",
      requestedPriority: "MEDIUM",
      itPriority: (overrides.itPriority ?? "MEDIUM") as never,
      currentStatus: (overrides.currentStatus ?? "New") as never,
      ticketOwnerId: overrides.ticketOwnerId ?? null,
    },
    select: { id: true },
  });
  return ticket;
}

function drillDownParams(drillDown: string): string {
  return drillDown.split("?")[1] ?? "";
}

beforeAll(async () => {
  const [requester, staff, admin, category, system] = await Promise.all([
    createTestUser({ role: "Requester", name: "Staff Dashboard Requester" }),
    createTestUser({ role: "ITStaff", name: "Staff Dashboard Staff" }),
    createTestUser({ role: "Administrator", name: "Staff Dashboard Admin" }),
    prisma.category.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
  ]);

  requesterId = requester.id;
  staffId = staff.id;
  categoryId = category.id;
  systemId = system.id;

  [requesterAgent, staffAgent, adminAgent] = await Promise.all([
    loginAgent(app, { email: requester.email, password: requester.password }),
    loginAgent(app, { email: staff.email, password: staff.password }),
    loginAgent(app, { email: admin.email, password: admin.password }),
  ]);

  // A deliberate, known slice of data so every metric this suite checks is
  // guaranteed to have at least one matching row, on top of whatever seed
  // data and earlier suites' fixtures are already in the shared database.
  await Promise.all([
    createTicket({ summary: "new 1" }),
    createTicket({ summary: "open 1", currentStatus: "Open" }),
    createTicket({ summary: "reopened 1", currentStatus: "Reopened" }),
    createTicket({ summary: "in progress 1", currentStatus: "InProgress", ticketOwnerId: staffId }),
    createTicket({ summary: "waiting 1", currentStatus: "WaitingForRequester" }),
    createTicket({ summary: "unassigned open 1", currentStatus: "Open" }),
    createTicket({ summary: "mine assigned 1", currentStatus: "InProgress", ticketOwnerId: staffId }),
    createTicket({ summary: "urgent 1", currentStatus: "New", itPriority: "URGENT" }),
    createTicket({ summary: "high 1", currentStatus: "Open", itPriority: "HIGH" }),
  ]);

  const followUpTicket = await createTicket({
    summary: "follow-up owner",
    currentStatus: "InProgress",
    ticketOwnerId: staffId,
  });
  await prisma.actionTaken.create({
    data: {
      ticketId: followUpTicket.id,
      actionAt: new Date(),
      description: "Fix applied, needs a check-in.",
      status: "Completed",
      result: "Working for now.",
      followUpRequired: true,
      followUpNote: "Check again next week.",
      performedById: staffId,
      createdById: staffId,
      clientRequestId: `${Math.random()}`,
    },
  });
});

afterAll(async () => {
  await removeFixtures();
  await removeTestUsers();
  await prisma.$disconnect();
});

describe("GET /api/dashboard/staff — metric values match the documented query (AC-24)", () => {
  it("new, open, inProgress, waitingForRequester match independent counts", async () => {
    const [expectedNew, expectedOpen, expectedInProgress, expectedWaiting] = await Promise.all([
      prisma.ticket.count({ where: { deletedAt: null, currentStatus: "New" } }),
      prisma.ticket.count({ where: { deletedAt: null, currentStatus: { in: ["Open", "Reopened"] } } }),
      prisma.ticket.count({ where: { deletedAt: null, currentStatus: "InProgress" } }),
      prisma.ticket.count({ where: { deletedAt: null, currentStatus: "WaitingForRequester" } }),
    ]);

    const res = await staffAgent.get("/api/dashboard/staff");
    expect(res.status).toBe(200);
    expect(res.body.timeZone).toBe("Asia/Bangkok");

    const byKey = (key: string) => res.body.metrics.find((m: { key: string }) => m.key === key).value;
    expect(byKey("new")).toBe(expectedNew);
    expect(byKey("open")).toBe(expectedOpen);
    expect(byKey("inProgress")).toBe(expectedInProgress);
    expect(byKey("waitingForRequester")).toBe(expectedWaiting);
  });

  it("myAssigned and secondary (unassigned, myOpenFollowUps) match independent counts", async () => {
    const [expectedMyAssigned, expectedUnassigned, expectedFollowUps] = await Promise.all([
      prisma.ticket.count({
        where: { deletedAt: null, currentStatus: { in: OPEN_LIKE }, ticketOwnerId: staffId },
      }),
      prisma.ticket.count({
        where: { deletedAt: null, currentStatus: { in: OPEN_LIKE }, ticketOwnerId: null },
      }),
      prisma.actionTaken.count({
        where: {
          performedById: staffId,
          status: "Completed",
          followUpRequired: true,
          ticket: { currentStatus: { in: OPEN_LIKE }, deletedAt: null },
        },
      }),
    ]);

    const res = await staffAgent.get("/api/dashboard/staff");
    const myAssigned = res.body.metrics.find((m: { key: string }) => m.key === "myAssigned").value;
    const unassigned = res.body.secondary.find((m: { key: string }) => m.key === "unassigned").value;
    const myOpenFollowUps = res.body.secondary.find((m: { key: string }) => m.key === "myOpenFollowUps").value;

    expect(myAssigned).toBe(expectedMyAssigned);
    expect(unassigned).toBe(expectedUnassigned);
    expect(myOpenFollowUps).toBe(expectedFollowUps);
  });

  it("byPriority is zero-filled: all 4 IT Priority levels always present", async () => {
    const res = await staffAgent.get("/api/dashboard/staff");
    expect(res.body.byPriority).toHaveLength(4);
    expect(res.body.byPriority.map((p: { priority: string }) => p.priority)).toEqual([
      "LOW",
      "MEDIUM",
      "HIGH",
      "URGENT",
    ]);
    for (const p of res.body.byPriority) {
      expect(typeof p.value).toBe("number");
      expect(p.value).toBeGreaterThanOrEqual(0);
    }

    const expectedUrgent = await prisma.ticket.count({
      where: { deletedAt: null, currentStatus: { in: OPEN_LIKE }, itPriority: "URGENT" },
    });
    const urgent = res.body.byPriority.find((p: { priority: string }) => p.priority === "URGENT");
    expect(urgent.value).toBe(expectedUrgent);
    expect(urgent.value).toBeGreaterThan(0);
  });
});

describe("GET /api/dashboard/staff — drill-down equality (AC-25)", () => {
  it("every metric, secondary entry, and byPriority entry equals its drill-down list total", async () => {
    const res = await staffAgent.get("/api/dashboard/staff");
    expect(res.status).toBe(200);

    const allEntries = [...res.body.metrics, ...res.body.secondary, ...res.body.byPriority];
    for (const entry of allEntries) {
      const list = await staffAgent.get(`/api/tickets/queue?${drillDownParams(entry.drillDown)}`);
      expect(list.status, entry.drillDown).toBe(200);
      expect(list.body.meta.totalItems, `${entry.key ?? entry.priority}: ${entry.drillDown}`).toBe(
        entry.value,
      );
    }
  });

  it("caps urgentTickets and recentTickets at 5 — never a full collection", async () => {
    const res = await staffAgent.get("/api/dashboard/staff");
    expect(res.body.urgentTickets.length).toBeLessThanOrEqual(5);
    expect(res.body.recentTickets.length).toBeLessThanOrEqual(5);
  });

  it("urgentTickets only contains HIGH/URGENT open-like tickets", async () => {
    const res = await staffAgent.get("/api/dashboard/staff");
    for (const t of res.body.urgentTickets) {
      expect(["HIGH", "URGENT"]).toContain(t.itPriority);
      expect(OPEN_LIKE).toContain(t.currentStatus);
    }
  });
});

describe("GET /api/dashboard/admin — staff data + user counts (AC-29)", () => {
  it("returns the same metrics as /staff plus a users block, matching independent counts", async () => {
    const [staffRes, adminRes] = await Promise.all([
      staffAgent.get("/api/dashboard/staff"),
      adminAgent.get("/api/dashboard/admin"),
    ]);
    expect(adminRes.status).toBe(200);

    // Same shape of metrics as staff (values may differ by a hair if a
    // request lands a moment apart, so compare keys/labels, not values).
    expect(adminRes.body.metrics.map((m: { key: string }) => m.key)).toEqual(
      staffRes.body.metrics.map((m: { key: string }) => m.key),
    );

    const [expectedActiveRequesters, expectedActiveStaff, expectedActiveAdmins, expectedInactive] =
      await Promise.all([
        prisma.user.count({ where: { deletedAt: null, isActive: true, role: "Requester" } }),
        prisma.user.count({ where: { deletedAt: null, isActive: true, role: "ITStaff" } }),
        prisma.user.count({ where: { deletedAt: null, isActive: true, role: "Administrator" } }),
        prisma.user.count({ where: { deletedAt: null, isActive: false } }),
      ]);

    expect(adminRes.body.users).toEqual({
      active: {
        Requester: expectedActiveRequesters,
        ITStaff: expectedActiveStaff,
        Administrator: expectedActiveAdmins,
      },
      inactive: expectedInactive,
    });
  });

  it("the users.active.Requester count equals the /admin/users drill-down total", async () => {
    const res = await adminAgent.get("/api/dashboard/admin");
    const list = await adminAgent.get("/api/admin/users?role=Requester&active=true");
    expect(list.status).toBe(200);
    expect(list.body.meta.totalItems).toBe(res.body.users.active.Requester);
  });
});

describe("Dashboard authorization (AC-27)", () => {
  it("returns 403 for a Requester on /staff and /admin", async () => {
    expect((await requesterAgent.get("/api/dashboard/staff")).status).toBe(403);
    expect((await requesterAgent.get("/api/dashboard/admin")).status).toBe(403);
  });

  it("returns 403 for IT Staff on /admin", async () => {
    expect((await staffAgent.get("/api/dashboard/admin")).status).toBe(403);
  });
});

describe("Error responses never leak internals", () => {
  it("every triggered error is the documented { error: { code, message } } envelope only", async () => {
    const responses = [
      await requesterAgent.get("/api/dashboard/staff"),
      await staffAgent.get("/api/dashboard/admin"),
    ];
    for (const res of responses) {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.error).toBeDefined();
      expect(typeof res.body.error.code).toBe("string");
      expect(typeof res.body.error.message).toBe("string");
    }
  });
});
