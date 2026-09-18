import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAgent, type AuthedAgent } from "../authHelper.js";
import { createTestUser, removeTestUsers } from "./helpers.js";

// Administrator User Management issue — tests.md §7.
// API-36 to API-44.

const prisma = getPrisma();
const TAG = "admin-mgmt-test";

let admin1Id: number;
let admin1Agent: AuthedAgent;
let admin2Id: number;
let staffId: number;
let staffAgent: AuthedAgent;
let requesterAgent: AuthedAgent;

function uniqueEmail() {
  return `${TAG}-${Math.random().toString(36).slice(2, 10)}@toktickit.test`;
}

async function removeFixtureUsers() {
  await prisma.user.deleteMany({ where: { email: { contains: TAG } } });
}

beforeAll(async () => {
  await removeFixtureUsers();

  const [admin1, admin2, staff, requester] = await Promise.all([
    createTestUser({ role: "Administrator", name: "Ops Admin One" }),
    createTestUser({ role: "Administrator", name: "Ops Admin Two" }),
    createTestUser({ role: "ITStaff", name: "Ops Staff" }),
    createTestUser({ role: "Requester", name: "Ops Requester" }),
  ]);

  admin1Id = admin1.id;
  admin2Id = admin2.id;
  staffId = staff.id;

  admin1Agent = await loginAgent(app, { email: admin1.email, password: admin1.password });
  staffAgent = await loginAgent(app, { email: staff.email, password: staff.password });
  requesterAgent = await loginAgent(app, { email: requester.email, password: requester.password });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await prisma.user.deleteMany({ where: { email: { contains: TAG } } });
});

afterAll(async () => {
  await removeFixtureUsers();
  await removeTestUsers();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------
describe("Admin user management authorization (AC-55, BR-49)", () => {
  it("denies IT Staff and Requesters with 403 before any lookup", async () => {
    for (const agent of [staffAgent, requesterAgent]) {
      expect((await agent.get("/api/admin/users")).status).toBe(403);
      expect((await agent.post("/api/admin/users").send({})).status).toBe(403);
      expect((await agent.get(`/api/admin/users/${staffId}`)).status).toBe(403);
      expect((await agent.patch(`/api/admin/users/${staffId}`).send({})).status).toBe(403);
      expect(
        (await agent.post(`/api/admin/users/${staffId}/initial-password`).send({})).status,
      ).toBe(403);
    }
  });

  it("denies an unauthenticated caller with 401", async () => {
    const { default: request } = await import("supertest");
    expect((await request(app).get("/api/admin/users")).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// API-36 — list, search, role filter (AC-46, BR-56)
// ---------------------------------------------------------------------------
describe("API-36 — user list, search, role filter (AC-46, BR-56)", () => {
  it("searches by partial name or email, case-insensitively", async () => {
    const target = await createTestUser({ name: `${TAG} Findable Person` });

    const byName = await admin1Agent.get("/api/admin/users").query({ search: "findable" });
    expect(byName.body.data.map((u: { id: number }) => u.id)).toContain(target.id);

    const byEmail = await admin1Agent
      .get("/api/admin/users")
      .query({ search: target.email.toUpperCase() });
    expect(byEmail.body.data.map((u: { id: number }) => u.id)).toContain(target.id);
  });

  it("filters by role", async () => {
    const res = await admin1Agent.get("/api/admin/users").query({ role: "Administrator" });
    expect(res.body.data.every((u: { role: string }) => u.role === "Administrator")).toBe(true);
    expect(res.body.data.map((u: { id: number }) => u.id)).toContain(admin1Id);
  });

  it("sorts by name then id, and reports totalItems without pagination", async () => {
    const res = await admin1Agent.get("/api/admin/users").query({ role: "Administrator" });
    const names = res.body.data.map((u: { name: string }) => u.name);
    expect(names).toEqual([...names].sort());
    expect(res.body.meta.totalItems).toBe(res.body.data.length);
  });

  it("ignores page and sortBy parameters", async () => {
    const res = await admin1Agent.get("/api/admin/users").query({ page: 99, sortBy: "email" });
    expect(res.status).toBe(200);
  });

  it("rejects an invalid or repeated role with 400", async () => {
    expect((await admin1Agent.get("/api/admin/users").query({ role: "SuperUser" })).status).toBe(400);
    // Repeated query keys arrive as an array, which is not a valid single role.
    const repeated = await admin1Agent
      .get("/api/admin/users")
      .query({ role: ["Requester", "ITStaff"] });
    expect(repeated.status).toBe(400);
  });

  it("never includes passwordHash in the response", async () => {
    const res = await admin1Agent.get("/api/admin/users");
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i);
  });
});

// ---------------------------------------------------------------------------
// API-37 — create user (AC-47, BR-50)
// ---------------------------------------------------------------------------
describe("API-37 — create user (AC-47, BR-50)", () => {
  it("creates a user forced to change the password at first login", async () => {
    const email = uniqueEmail();
    const res = await admin1Agent.post("/api/admin/users").send({
      name: "New Staff",
      email,
      role: "ITStaff",
      isActive: true,
      initialPassword: "Temp-Pass-9!",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.mustChangePassword).toBe(true);
    expect(res.body.data.email).toBe(email.toLowerCase());

    // A separate agent: logging in through admin1Agent itself would replace
    // admin1's own session cookie with the new user's.
    const { default: request } = await import("supertest");
    const login = await request(app).post("/api/auth/login").send({ email, password: "Temp-Pass-9!" });
    expect(login.status).toBe(200);
    expect(login.body.data.user.mustChangePassword).toBe(true);
  });

  it("stores only a bcrypt hash", async () => {
    const email = uniqueEmail();
    await admin1Agent.post("/api/admin/users").send({
      name: "Hash Check",
      email,
      role: "Requester",
      initialPassword: "Temp-Pass-9!",
    });
    const stored = await prisma.user.findUniqueOrThrow({
      where: { email: email.toLowerCase() },
      select: { passwordHash: true },
    });
    expect(stored.passwordHash).toMatch(/^\$2/);
  });
});

// ---------------------------------------------------------------------------
// API-38 — duplicate email (AC-48, BR-11)
// ---------------------------------------------------------------------------
describe("API-38 — duplicate email (AC-48, BR-11)", () => {
  it("rejects a different-case duplicate with 409 EMAIL_ALREADY_IN_USE", async () => {
    const email = uniqueEmail();
    await admin1Agent
      .post("/api/admin/users")
      .send({ name: "Original", email, role: "Requester", initialPassword: "Temp-Pass-9!" });

    const res = await admin1Agent.post("/api/admin/users").send({
      name: "Duplicate",
      email: ` ${email.toUpperCase()} `,
      role: "Requester",
      initialPassword: "Temp-Pass-9!",
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_ALREADY_IN_USE");
    expect(res.body.error.fieldErrors.email).toEqual(expect.any(String));
  });

  it("rejects a duplicate email on edit too", async () => {
    const existing = await createTestUser({ name: `${TAG} Existing` });
    const other = await createTestUser({ name: `${TAG} Other` });

    const res = await admin1Agent.patch(`/api/admin/users/${other.id}`).send({ email: existing.email });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_ALREADY_IN_USE");
  });

  it("lets exactly one side win a simultaneous duplicate create", async () => {
    const email = uniqueEmail();
    const body = { name: "Racer", email, role: "Requester", initialPassword: "Temp-Pass-9!" };
    const [a, b] = await Promise.all([
      admin1Agent.post("/api/admin/users").send(body),
      admin1Agent.post("/api/admin/users").send(body),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
  });
});

// ---------------------------------------------------------------------------
// API-39 — invalid input and role (AC-49, BR-50)
// ---------------------------------------------------------------------------
describe("API-39 — invalid input and role (AC-49, BR-50)", () => {
  it("rejects invalid role, multiple roles, missing role, short name, bad email with 400", async () => {
    const before = await prisma.user.count();
    for (const body of [
      { name: "X", email: uniqueEmail(), role: "SuperUser", initialPassword: "Temp-Pass-9!" },
      { name: "Valid Name", email: uniqueEmail(), role: ["ITStaff"], initialPassword: "Temp-Pass-9!" },
      { name: "Valid Name", email: uniqueEmail(), initialPassword: "Temp-Pass-9!" },
      { name: "A", email: uniqueEmail(), role: "Requester", initialPassword: "Temp-Pass-9!" },
      { name: "Valid Name", email: "not-an-email", role: "Requester", initialPassword: "Temp-Pass-9!" },
      { name: "Valid Name", email: uniqueEmail(), role: "Requester", initialPassword: "weak" },
    ]) {
      const res = await admin1Agent.post("/api/admin/users").send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await prisma.user.count()).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// API-40 — edit user (AC-50, BR-51)
// ---------------------------------------------------------------------------
describe("API-40 — edit user (AC-50, BR-51)", () => {
  it("updates name, email, role, and isActive", async () => {
    const target = await createTestUser({ name: `${TAG} Editable`, role: "Requester" });
    const newEmail = uniqueEmail();

    const res = await admin1Agent
      .patch(`/api/admin/users/${target.id}`)
      .send({ name: "Renamed Person", email: newEmail, role: "ITStaff", isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: "Renamed Person",
      email: newEmail.toLowerCase(),
      role: "ITStaff",
      isActive: false,
    });
  });

  it("applies a role change from the user's very next request", async () => {
    const target = await createTestUser({ role: "ITStaff" });
    const agent = await loginAgent(app, { email: target.email, password: target.password });

    expect((await agent.get("/api/tickets/mine")).status).toBe(403);
    await admin1Agent.patch(`/api/admin/users/${target.id}`).send({ role: "Requester" });
    expect((await agent.get("/api/tickets/mine")).status).toBe(200);
  });

  it("returns unassignedTicketCount 0 and sessionsRevoked false when resending the same values", async () => {
    const target = await createTestUser({ name: `${TAG} NoOp`, role: "Requester", isActive: true });

    const res = await admin1Agent
      .patch(`/api/admin/users/${target.id}`)
      .send({ name: `${TAG} NoOp`, isActive: true });

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ unassignedTicketCount: 0, sessionsRevoked: false });
  });

  it("rejects an empty body with 400", async () => {
    const target = await createTestUser();
    expect((await admin1Agent.patch(`/api/admin/users/${target.id}`).send({})).status).toBe(400);
  });

  it("returns 404 for a nonexistent user", async () => {
    expect(
      (await admin1Agent.patch("/api/admin/users/99999999").send({ name: "Valid Name" })).status,
    ).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// API-41 — new initial password (AC-51, BR-55)
// ---------------------------------------------------------------------------
describe("API-41 — new initial password (AC-51, BR-55)", () => {
  it("ends the target's live session and requires a change at next login", async () => {
    const target = await createTestUser({ role: "Requester", mustChangePassword: false });
    const targetAgent = await loginAgent(app, { email: target.email, password: target.password });
    expect((await targetAgent.get("/api/auth/me")).status).toBe(200);

    const res = await admin1Agent
      .post(`/api/admin/users/${target.id}/initial-password`)
      .send({ initialPassword: "New-Temp-Pass1!" });
    expect(res.status).toBe(200);
    expect(res.body.data.mustChangePassword).toBe(true);
    expect(res.body.meta.sessionsRevoked).toBe(true);

    expect((await targetAgent.get("/api/auth/me")).status).toBe(401);

    const login = await targetAgent
      .post("/api/auth/login")
      .send({ email: target.email, password: "New-Temp-Pass1!" });
    expect(login.status).toBe(200);
    expect(login.body.data.user.mustChangePassword).toBe(true);
  });

  it("rejects a weak password with 400", async () => {
    const target = await createTestUser();
    const res = await admin1Agent
      .post(`/api/admin/users/${target.id}/initial-password`)
      .send({ initialPassword: "weak" });
    expect(res.status).toBe(400);
  });

  it("works for an inactive user", async () => {
    const target = await createTestUser({ isActive: false });
    const res = await admin1Agent
      .post(`/api/admin/users/${target.id}/initial-password`)
      .send({ initialPassword: "New-Temp-Pass1!" });
    expect(res.status).toBe(200);
  });

  it("revokes the caller's own session when the target is themselves", async () => {
    const selfAdmin = await createTestUser({ role: "Administrator", mustChangePassword: false });
    const selfAgent = await loginAgent(app, { email: selfAdmin.email, password: selfAdmin.password });

    const res = await selfAgent
      .post(`/api/admin/users/${selfAdmin.id}/initial-password`)
      .send({ initialPassword: "New-Temp-Pass1!" });
    expect(res.status).toBe(200);

    expect((await selfAgent.get("/api/auth/me")).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// API-42 — no self-deactivation (AC-52, BR-53)
// ---------------------------------------------------------------------------
describe("API-42 — no self-deactivation (AC-52, BR-53)", () => {
  it("blocks an Administrator deactivating their own account", async () => {
    const res = await admin1Agent.patch(`/api/admin/users/${admin1Id}`).send({ isActive: false });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SELF_DEACTIVATION_BLOCKED");

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: admin1Id } });
    expect(stored.isActive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// API-43 — last active administrator (AC-53, BR-54)
// ---------------------------------------------------------------------------
describe("API-43 — last active administrator (AC-53, BR-54)", () => {
  /**
   * The dev database already has other active Administrators (the shared
   * fixtures, and possibly seeded ones), so "the sole active administrator"
   * has to be staged: every other active admin is deactivated for the
   * duration of `fn`, then restored — without ever making a request through
   * an agent whose own account is temporarily inactive, which would revoke
   * that agent's session for good (BR-15).
   */
  async function withOnlyActiveAdmin(keepId: number, fn: () => Promise<void>) {
    const others = await prisma.user.findMany({
      where: { role: "Administrator", isActive: true, id: { not: keepId } },
      select: { id: true },
    });
    const otherIds = others.map((o) => o.id);
    await prisma.user.updateMany({ where: { id: { in: otherIds } }, data: { isActive: false } });
    try {
      await fn();
    } finally {
      await prisma.user.updateMany({ where: { id: { in: otherIds } }, data: { isActive: true } });
    }
  }

  it("blocks demoting the sole active administrator, but succeeds with a second one active", async () => {
    const solo = await createTestUser({ role: "Administrator", name: `${TAG} Solo Admin` });
    const soloAgent = await loginAgent(app, { email: solo.email, password: solo.password });

    await withOnlyActiveAdmin(solo.id, async () => {
      const blocked = await soloAgent.patch(`/api/admin/users/${solo.id}`).send({ role: "ITStaff" });
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe("LAST_ACTIVE_ADMINISTRATOR");

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: solo.id } });
      expect(stored.role).toBe("Administrator");
    });

    // Other administrators are active again, so this now succeeds.
    const ok = await admin1Agent.patch(`/api/admin/users/${solo.id}`).send({ role: "ITStaff" });
    expect(ok.status).toBe(200);
  });

  it("does not count an inactive administrator", async () => {
    const solo = await createTestUser({ role: "Administrator", name: `${TAG} Solo Two` });
    await createTestUser({ role: "Administrator", isActive: false, name: `${TAG} Inactive Admin` });
    const soloAgent = await loginAgent(app, { email: solo.email, password: solo.password });

    await withOnlyActiveAdmin(solo.id, async () => {
      // A role change, not a deactivation, so BR-53's self-deactivation
      // check does not short-circuit before the last-admin check runs.
      const res = await soloAgent.patch(`/api/admin/users/${solo.id}`).send({ role: "ITStaff" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("LAST_ACTIVE_ADMINISTRATOR");
    });
  });

  it("lets a different administrator deactivate a target while another stays active", async () => {
    // With a caller distinct from the target, the caller itself always
    // remains an active administrator afterwards, so this must succeed —
    // deactivation only trips BR-54 in the self-service case, which BR-53's
    // absolute self-deactivation ban (API-42) already forecloses.
    const target = await createTestUser({ role: "Administrator", name: `${TAG} Solo Four` });
    const res = await admin1Agent.patch(`/api/admin/users/${target.id}`).send({ isActive: false });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// API-44 — deactivation and demotion effects (AC-54, BR-36, BR-52)
// ---------------------------------------------------------------------------
describe("API-44 — deactivation and demotion effects (AC-54, BR-36, BR-52)", () => {
  async function createOwnedTicket(ownerId: number, requesterId: number, status: string) {
    const [category, system] = await Promise.all([
      prisma.category.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
      prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
    ]);
    return prisma.ticket.create({
      data: {
        ticketNumber: `TT-ADMIN-${Math.random().toString(36).slice(2, 10)}`,
        requesterId,
        categoryId: category.id,
        relatedSystemId: system.id,
        summary: `${TAG} owned ticket`,
        description: "Created by the admin user management test suite.",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: status as never,
        ticketOwnerId: ownerId,
      },
      select: { id: true },
    });
  }

  afterEach(async () => {
    await prisma.ticket.deleteMany({ where: { summary: { contains: TAG } } });
  });

  it("deactivating revokes sessions, blocks login, and unassigns active tickets but not closed ones", async () => {
    const requester = await createTestUser({ role: "Requester", name: `${TAG} Ticket Requester` });
    const targetStaff = await createTestUser({ role: "ITStaff", mustChangePassword: false, name: `${TAG} Deactivated` });
    const targetAgent = await loginAgent(app, { email: targetStaff.email, password: targetStaff.password });

    const activeTicket = await createOwnedTicket(targetStaff.id, requester.id, "New");
    const closedTicket = await createOwnedTicket(targetStaff.id, requester.id, "Closed");

    const res = await admin1Agent.patch(`/api/admin/users/${targetStaff.id}`).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.meta.unassignedTicketCount).toBe(1);
    expect(res.body.meta.sessionsRevoked).toBe(true);

    expect((await targetAgent.get("/api/auth/me")).status).toBe(401);

    const login = await targetAgent
      .post("/api/auth/login")
      .send({ email: targetStaff.email, password: targetStaff.password });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("ACCOUNT_INACTIVE");

    const activeAfter = await prisma.ticket.findUniqueOrThrow({ where: { id: activeTicket.id } });
    expect(activeAfter.ticketOwnerId).toBeNull();
    const closedAfter = await prisma.ticket.findUniqueOrThrow({ where: { id: closedTicket.id } });
    expect(closedAfter.ticketOwnerId).toBe(targetStaff.id);

    const list = await admin1Agent.get("/api/admin/users").query({ search: targetStaff.email });
    expect(list.body.data[0]).toMatchObject({ isActive: false });
  });

  it("demoting to Requester also unassigns active tickets", async () => {
    const requester = await createTestUser({ role: "Requester", name: `${TAG} Demote Requester` });
    const targetStaff = await createTestUser({ role: "ITStaff", name: `${TAG} Demoted` });
    const ticket = await createOwnedTicket(targetStaff.id, requester.id, "InProgress");

    const res = await admin1Agent.patch(`/api/admin/users/${targetStaff.id}`).send({ role: "Requester" });
    expect(res.status).toBe(200);
    expect(res.body.meta.unassignedTicketCount).toBe(1);

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(after.ticketOwnerId).toBeNull();
  });

  it("has no DELETE endpoint — always 404", async () => {
    const target = await createTestUser();
    const { default: request } = await import("supertest");
    const res = await request(app).delete(`/api/admin/users/${target.id}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Safe failures
// ---------------------------------------------------------------------------
describe("Admin user management — unexpected failures stay safe (BR-60)", () => {
  it("returns a safe 500 without leaking internals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.user, "findMany").mockRejectedValue(
      new Error('Invalid `prisma.user.findMany()` at C:\\repo\\server\\src\\adminUsers.ts:100'),
    );

    const res = await admin1Agent.get("/api/admin/users");
    expect(res.status).toBe(500);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/prisma/i);
    expect(serialized).not.toMatch(/\.ts:/);
  });
});
