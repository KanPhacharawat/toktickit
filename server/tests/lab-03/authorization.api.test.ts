import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app, CLIENT_ORIGIN } from "../../src/app.js";
import { resetLoginThrottle } from "../../src/auth/loginThrottle.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAgent, type AuthedAgent } from "../authHelper.js";
import { createTestUser, removeTestUsers } from "./helpers.js";

// UNIT-06, SEC-03, SEC-04, SEC-07, SEC-09, SEC-12, SEC-14, SEC-15 (tests.md
// §3), scoped to the routes that exist after this issue: every currently
// protected route requires a session (BR-08 step 1), a completed password
// change (step 2), and — where the matrix restricts it — the right role
// (step 3). Ownership rewiring (BR-03), the routes new roles will use later
// (queue, admin, staff-facing ticket detail), and Lab 2 route removal
// (FR-19) are out of scope here; they arrive with their own issues.

const prisma = getPrisma();

/**
 * Every currently protected route, in api-spec.md §16 terms adapted to what
 * exists today. `role: "any"` means every authenticated, gated role may call
 * it (matrix §5.1 "Categories, Related Systems"); `role: "Requester"` means
 * only that role may.
 */
const PROTECTED_ROUTES: Array<{
  name: string;
  method: "get" | "post" | "patch" | "delete";
  path: string;
  // "any": every role. "Requester" / "Staff": exclusive to that side.
  // "shared": Requester (own) or Staff (any), with a different response
  // shape per side — covered by its own dedicated test file, not the
  // allow/deny matrix below, but still checked for 401/403-gate.
  role: "any" | "Requester" | "Staff" | "shared";
}> = [
  { name: "categories", method: "get", path: "/api/categories", role: "any" },
  { name: "related systems", method: "get", path: "/api/related-systems", role: "any" },
  { name: "create ticket", method: "post", path: "/api/tickets", role: "Requester" },
  { name: "my tickets", method: "get", path: "/api/tickets/mine", role: "Requester" },
  { name: "attachment upload", method: "post", path: "/api/tickets/1/attachments", role: "Requester" },
  { name: "attachment removal", method: "delete", path: "/api/tickets/1/attachments/1", role: "Requester" },
  { name: "problem resolved", method: "post", path: "/api/tickets/1/problem-resolved", role: "Requester" },
  { name: "ticket detail", method: "get", path: "/api/tickets/1", role: "shared" },
  { name: "attachment list", method: "get", path: "/api/tickets/1/attachments", role: "shared" },
  { name: "attachment download", method: "get", path: "/api/tickets/1/attachments/1", role: "shared" },
  { name: "public comments list", method: "get", path: "/api/tickets/1/public-comments", role: "shared" },
  { name: "public comments post", method: "post", path: "/api/tickets/1/public-comments", role: "shared" },
  { name: "assignable users", method: "get", path: "/api/users/assignable", role: "Staff" },
  { name: "claim", method: "post", path: "/api/tickets/1/claim", role: "Staff" },
  { name: "owner", method: "patch", path: "/api/tickets/1/owner", role: "Staff" },
  { name: "it priority", method: "patch", path: "/api/tickets/1/it-priority", role: "Staff" },
  { name: "status", method: "patch", path: "/api/tickets/1/status", role: "Staff" },
  { name: "internal notes list", method: "get", path: "/api/tickets/1/internal-notes", role: "Staff" },
  { name: "internal notes post", method: "post", path: "/api/tickets/1/internal-notes", role: "Staff" },
];

/** Structural interface both `request(app)` and an authenticated agent satisfy. */
interface RouteCaller {
  get(url: string): request.Test;
  post(url: string): request.Test;
  patch(url: string): request.Test;
  delete(url: string): request.Test;
}

function call(caller: RouteCaller, route: (typeof PROTECTED_ROUTES)[number]) {
  return caller[route.method](route.path);
}

beforeAll(() => {
  resetLoginThrottle();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await removeTestUsers();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
describe("SEC-03 — unauthenticated access matrix (AC-16, FR-17)", () => {
  it.each(PROTECTED_ROUTES)("rejects $name with 401 and no data", async (route) => {
    const res = await call(request(app), route);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Please sign in to continue." },
    });
    // The 401 response clears whatever cookie the browser sent (BR-08 step 1).
    const cookie = (res.headers["set-cookie"] as unknown as string[] | undefined)?.[0];
    expect(cookie).toMatch(/toktickit_session=;/);
  });
});

// ---------------------------------------------------------------------------
describe("SEC-04 — password-change gate matrix (AC-02, BR-02)", () => {
  // One session, reused for every route: it is the gate's behavior under
  // test, not per-user setup, and a Requester is the role every one of
  // these routes would otherwise permit — so a rejection here can only be
  // the gate (BR-08: the gate precedes the role check).
  let agent: AuthedAgent;

  beforeAll(async () => {
    const user = await createTestUser({ role: "Requester", mustChangePassword: true });
    agent = await loginAgent(app, { email: user.email, password: user.password });
  });

  it.each(PROTECTED_ROUTES)(
    "rejects $name with 403 PASSWORD_CHANGE_REQUIRED",
    async (route) => {
      const res = await call(agent, route);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: {
          code: "PASSWORD_CHANGE_REQUIRED",
          message: "Change your password before continuing.",
        },
      });
    },
  );

  it("still allows the three auth routes while a change is required", async () => {
    expect((await agent.get("/api/auth/me")).status).toBe(200);
    expect(
      (
        await agent
          .post("/api/auth/change-password")
          .send({ currentPassword: "wrong", newPassword: "Whatever-Pass1!" })
      ).status,
    ).toBe(400); // rejected on content, not on the gate
    expect((await agent.post("/api/auth/logout")).status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
describe("SEC-07 — role-restricted routes (AC-17, AC-20, AC-45, BR-05, BR-07, BR-25)", () => {
  const requesterOnly = PROTECTED_ROUTES.filter((r) => r.role === "Requester");
  const staffOnly = PROTECTED_ROUTES.filter((r) => r.role === "Staff");
  const anyRole = PROTECTED_ROUTES.filter((r) => r.role === "any");

  it.each(["ITStaff", "Administrator"] as const)(
    "denies %s every Requester-only route with 403, unchanged in the database",
    async (role) => {
      const user = await createTestUser({ role });
      const agent = await loginAgent(app, { email: user.email, password: user.password });
      const ticketsBefore = await prisma.ticket.count();

      for (const route of requesterOnly) {
        const res = await call(agent, route);
        expect(res.status, `${role} on ${route.name}`).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      }

      expect(await prisma.ticket.count()).toBe(ticketsBefore);
    },
  );

  it("denies a Requester every Staff-only route with 403 (AC-17)", async () => {
    const user = await createTestUser({ role: "Requester" });
    const agent = await loginAgent(app, { email: user.email, password: user.password });

    for (const route of staffOnly) {
      const res = await call(agent, route);
      expect(res.status, `Requester on ${route.name}`).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
  });

  it.each(["Requester", "ITStaff", "Administrator"] as const)(
    "lets %s use every any-role route",
    async (role) => {
      const user = await createTestUser({ role });
      const agent = await loginAgent(app, { email: user.email, password: user.password });

      for (const route of anyRole) {
        const res = await call(agent, route);
        expect(res.status, `${role} on ${route.name}`).toBe(200);
      }
    },
  );

  it("lets a Requester use the Requester-only routes (positive case)", async () => {
    const user = await createTestUser({ role: "Requester" });
    const agent = await loginAgent(app, { email: user.email, password: user.password });

    const res = await agent.get("/api/tickets/mine");
    expect(res.status).toBe(200);
  });

  it("confirms the rejected account really was authenticated (a role rejection, not an auth failure)", async () => {
    // Sanity check on the fixture matrix itself: an ITStaff account is a
    // valid, active, gated session — so every 403 above is a role
    // rejection, not a 401 in disguise.
    const user = await createTestUser({ role: "ITStaff" });
    const agent = await loginAgent(app, { email: user.email, password: user.password });
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBe("ITStaff");
  });
});

// ---------------------------------------------------------------------------
describe("SEC-09 — check-order leaks (BR-08)", () => {
  // Internal Notes is Staff-exclusive, so a Requester is genuinely the
  // "wrong role" here (ticket detail and the other Requester routes are now
  // shared with Staff and can't demonstrate this case).
  const malformedPath = "/api/tickets/abc/internal-notes";

  it("unauthenticated + invalid id → 401, not 400", async () => {
    const res = await request(app).get(malformedPath);
    expect(res.status).toBe(401);
  });

  it("gate + invalid id → 403 PASSWORD_CHANGE_REQUIRED, not 400", async () => {
    const user = await createTestUser({ role: "ITStaff", mustChangePassword: true });
    const agent = await loginAgent(app, { email: user.email, password: user.password });

    const res = await agent.get(malformedPath);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("wrong role + invalid id → 403 FORBIDDEN, not 400", async () => {
    const user = await createTestUser({ role: "Requester" });
    const agent = await loginAgent(app, { email: user.email, password: user.password });

    const res = await agent.get(malformedPath);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("correct role + invalid id → 400 (the handler's own validation runs last)", async () => {
    const user = await createTestUser({ role: "ITStaff" });
    const agent = await loginAgent(app, { email: user.email, password: user.password });

    const res = await agent.get(malformedPath);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe("SEC-12 — role read per request (BR-22)", () => {
  it("reflects a role change on the very next request, without a new login", async () => {
    const user = await createTestUser({ role: "ITStaff" });
    const agent = await loginAgent(app, { email: user.email, password: user.password });

    expect((await agent.get("/api/tickets/mine")).status).toBe(403);

    // No admin endpoint exists yet to do this through the API (that arrives
    // with the Administrator user management issue); the mechanism under
    // test — role read fresh from the database every request — is the same
    // either way.
    await prisma.user.update({ where: { id: user.id }, data: { role: "Requester" } });

    expect((await agent.get("/api/tickets/mine")).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe("SEC-11 — removed Lab 2 routes (AC-19, FR-19)", () => {
  it("returns 404 for the removed Development Requester selector route", async () => {
    const user = await createTestUser({ role: "Requester" });
    const agent = await loginAgent(app, { email: user.email, password: user.password });

    expect((await agent.get("/api/development-requesters")).status).toBe(404);
    expect((await request(app).get("/api/development-requesters")).status).toBe(404);
  });

  it("returns 404 for the removed requesterId-scoped routes", async () => {
    const user = await createTestUser({ role: "Requester" });
    const agent = await loginAgent(app, { email: user.email, password: user.password });

    expect((await agent.get("/api/requesters/1/tickets")).status).toBe(404);
    expect((await agent.get("/api/requesters/1/tickets/1")).status).toBe(404);
    expect((await agent.get("/api/tickets?requesterId=1")).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe("SEC-14 — safe errors from the auth middleware itself (AC-59, BR-60)", () => {
  it("returns a safe 500 when session resolution fails unexpectedly", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = await createTestUser({ role: "Requester" });
    const agent = await loginAgent(app, { email: user.email, password: user.password });

    vi.spyOn(prisma.session, "findUnique").mockRejectedValue(
      new Error('Invalid `prisma.session.findUnique()` at C:\\repo\\server\\src\\auth\\session.ts:99'),
    );

    const res = await agent.get("/api/categories");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Could not verify your session. Please try again.",
      },
    });
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/prisma/i);
    expect(serialized).not.toMatch(/\.ts:/);
  });
});

// ---------------------------------------------------------------------------
describe("SEC-15 — CORS and cookie CSRF posture (BR-17)", () => {
  it("returns the exact configured origin with credentials for an allowed Origin", async () => {
    const res = await request(app).get("/api/health").set("Origin", CLIENT_ORIGIN);

    expect(res.headers["access-control-allow-origin"]).toBe(CLIENT_ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("returns no allow-origin header for a foreign Origin", async () => {
    const res = await request(app).get("/api/health").set("Origin", "http://evil.example.com");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("never returns a wildcard origin", async () => {
    for (const origin of [CLIENT_ORIGIN, "http://evil.example.com", "http://localhost:5174"]) {
      const res = await request(app).get("/api/health").set("Origin", origin);
      expect(res.headers["access-control-allow-origin"]).not.toBe("*");
    }
  });

  it("sets the session cookie as HttpOnly with SameSite=Lax", async () => {
    const user = await createTestUser();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: user.password });

    const cookie = (res.headers["set-cookie"] as unknown as string[])[0];
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });
});
