import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import { resetLoginThrottle } from "../../src/auth/loginThrottle.js";
import { hashSessionToken } from "../../src/auth/session.js";
import { getPrisma } from "../../src/prisma.js";
import {
  TEST_PASSWORD,
  cookieHeader,
  createTestUser,
  removeTestUsers,
  sessionCookieLine,
  sessionTokenFrom,
} from "./helpers.js";

// API-01 – API-07, SEC-01, SEC-02 (tests.md §2). Integration tests against the
// migrated and seeded database:
//   npx prisma migrate deploy && npm run prisma:seed

const prisma = getPrisma();

function login(email: string, password: string) {
  return request(app).post("/api/auth/login").send({ email, password });
}

beforeEach(() => {
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
describe("API-01 — valid login (AC-01, BR-01)", () => {
  it("returns only the safe identity and sets the session cookie", async () => {
    const user = await createTestUser({ role: "ITStaff", name: "Login Staff" });

    const res = await login(`  ${user.email.toUpperCase()} `, user.password);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        user: {
          id: user.id,
          name: "Login Staff",
          email: user.email,
          role: "ITStaff",
          mustChangePassword: false,
        },
      },
    });

    const cookie = sessionCookieLine(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=28800/);
  });

  it("creates a session row holding only the token hash and records the login time", async () => {
    const user = await createTestUser();

    const res = await login(user.email, user.password);
    const token = sessionTokenFrom(res)!;

    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).toBe(hashSessionToken(token));
    expect(sessions[0].tokenHash).not.toBe(token);
    expect(sessions[0].revokedAt).toBeNull();

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.lastLoginAt).not.toBeNull();
  });

  it("revokes the browser's previous session when signing in again", async () => {
    const user = await createTestUser();
    const first = sessionTokenFrom(await login(user.email, user.password))!;

    const second = await request(app)
      .post("/api/auth/login")
      .set("Cookie", cookieHeader(first))
      .send({ email: user.email, password: user.password });
    expect(second.status).toBe(200);

    const old = await request(app).get("/api/auth/me").set("Cookie", cookieHeader(first));
    expect(old.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe("API-02 — invalid credentials and login input (AC-05, AC-08, BR-14)", () => {
  it("answers a wrong password, an unknown email, and a password-less account identically", async () => {
    const user = await createTestUser();
    const noPassword = await createTestUser({ password: null });

    const wrong = await login(user.email, "Wrong-Pass1!");
    const unknown = await login("nobody-here@toktickit.test", "Wrong-Pass1!");
    const unset = await login(noPassword.email, "Wrong-Pass1!");

    for (const res of [wrong, unknown, unset]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password. Please try again.",
        },
      });
      expect(sessionCookieLine(res)).toBeUndefined();
    }
  });

  it("rejects missing or non-string fields with 400 field errors", async () => {
    const empty = await request(app).post("/api/auth/login").send({});
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe("VALIDATION_ERROR");
    expect(empty.body.error.fieldErrors).toEqual({
      email: "Email is required.",
      password: "Password is required.",
    });

    const wrongTypes = await request(app)
      .post("/api/auth/login")
      .send({ email: 42, password: ["x"] });
    expect(wrongTypes.status).toBe(400);
  });

  it("does not count validation errors towards the throttle", async () => {
    const user = await createTestUser();
    for (let i = 0; i < 6; i++) {
      await request(app).post("/api/auth/login").send({ email: user.email });
    }
    expect((await login(user.email, user.password)).status).toBe(200);
  });

  it("answers a malformed JSON body with the error envelope", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------
describe("API-03 — inactive account (AC-06, BR-15)", () => {
  it("refuses the correct password with 403 and no account data or session", async () => {
    const user = await createTestUser({ isActive: false, name: "Inactive Person" });

    const res = await login(user.email, user.password);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: {
        code: "ACCOUNT_INACTIVE",
        message: "This account cannot sign in. Contact your administrator.",
      },
    });
    expect(JSON.stringify(res.body)).not.toContain("Inactive Person");
    expect(sessionCookieLine(res)).toBeUndefined();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("gives a wrong password the generic 401", async () => {
    const user = await createTestUser({ isActive: false });
    const res = await login(user.email, "Wrong-Pass1!");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

// ---------------------------------------------------------------------------
describe("API-04 — login throttling (AC-07, BR-16)", () => {
  it("returns 429 on the sixth attempt, even with the correct password", async () => {
    const user = await createTestUser();

    for (let i = 0; i < 5; i++) {
      expect((await login(user.email, "Wrong-Pass1!")).status).toBe(401);
    }

    const locked = await login(user.email, user.password);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("TOO_MANY_ATTEMPTS");
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(0);
    expect(sessionCookieLine(locked)).toBeUndefined();
  });

  it("throttles an unknown email the same way", async () => {
    const email = "throttle-unknown@toktickit.test";
    for (let i = 0; i < 5; i++) {
      expect((await login(email, "Wrong-Pass1!")).status).toBe(401);
    }
    expect((await login(email, "Wrong-Pass1!")).status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
describe("API-05 — mandatory password change and completion (AC-02, AC-10, BR-21)", () => {
  it("clears the flag, ends other sessions, and keeps the current one", async () => {
    const user = await createTestUser({ mustChangePassword: true });

    const first = await login(user.email, user.password);
    expect(first.body.data.user.mustChangePassword).toBe(true);
    const current = sessionTokenFrom(first)!;
    const other = sessionTokenFrom(await login(user.email, user.password))!;

    const change = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookieHeader(current))
      .send({ currentPassword: user.password, newPassword: "Brand-New-Pass2?" });

    expect(change.status).toBe(200);
    expect(change.body.data.user).toMatchObject({ id: user.id, mustChangePassword: false });

    const currentMe = await request(app).get("/api/auth/me").set("Cookie", cookieHeader(current));
    expect(currentMe.status).toBe(200);
    expect(currentMe.body.data.mustChangePassword).toBe(false);

    const otherMe = await request(app).get("/api/auth/me").set("Cookie", cookieHeader(other));
    expect(otherMe.status).toBe(401);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.passwordChangedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("API-06 — change-password validation and voluntary change (AC-09, AC-11, BR-13)", () => {
  async function signedIn() {
    const user = await createTestUser();
    const token = sessionTokenFrom(await login(user.email, user.password))!;
    const change = (body: object) =>
      request(app).post("/api/auth/change-password").set("Cookie", cookieHeader(token)).send(body);
    return { user, token, change };
  }

  it("requires both fields", async () => {
    const { change } = await signedIn();
    const res = await change({});
    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors).toEqual({
      currentPassword: "Current password is required.",
      newPassword: "New password is required.",
    });
  });

  it.each([
    ["7 characters", "Aa1!xyz", /8–72 characters/],
    ["73 characters", "Aa1!" + "x".repeat(69), /8–72 characters/],
    ["no uppercase", "lower-case-1!", /upper and lower case/],
    ["no special character", "NoSpecial123", /special character/],
  ])("rejects a new password with %s", async (_label, newPassword, message) => {
    const { user, change } = await signedIn();
    const res = await change({ currentPassword: user.password, newPassword });
    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors.newPassword).toMatch(message);
  });

  it("accepts exactly 8 and 72 characters", async () => {
    const eight = await signedIn();
    expect(
      (await eight.change({ currentPassword: eight.user.password, newPassword: "Aa1!wxyz" })).status,
    ).toBe(200);

    const seventyTwo = await signedIn();
    expect(
      (
        await seventyTwo.change({
          currentPassword: seventyTwo.user.password,
          newPassword: "Aa1!" + "x".repeat(68),
        })
      ).status,
    ).toBe(200);
  });

  it("rejects a new password equal to the email in a different case", async () => {
    const user = await createTestUser();
    // An email that also passes the composition rules once capitalised, so
    // the email rule is the one that fires.
    const email = `pw1-${user.id}@toktickit.test`;
    await prisma.user.update({ where: { id: user.id }, data: { email } });

    try {
      const token = sessionTokenFrom(await login(email, user.password))!;
      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Cookie", cookieHeader(token))
        .send({ currentPassword: user.password, newPassword: `Pw1-${user.id}@toktickit.test` });

      expect(res.status).toBe(400);
      expect(res.body.error.fieldErrors.newPassword).toBe("Password must not be your email address.");
    } finally {
      // Restore the tracked email so cleanup removes this user.
      await prisma.user.update({ where: { id: user.id }, data: { email: user.email } });
    }
  });

  it("treats a wrong current password as a 400 field error and keeps the session", async () => {
    const { token, change } = await signedIn();
    const res = await change({ currentPassword: "Not-The-Pass1!", newPassword: "Valid-New-Pass3#" });

    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors).toEqual({ currentPassword: "Current password is incorrect." });

    const me = await request(app).get("/api/auth/me").set("Cookie", cookieHeader(token));
    expect(me.status).toBe(200);
  });

  it("rejects a new password equal to the current one", async () => {
    const { user, change } = await signedIn();
    const res = await change({ currentPassword: user.password, newPassword: user.password });
    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors).toEqual({
      newPassword: "New password must be different from your current password.",
    });
  });

  it("makes the new password work and the old one fail after a voluntary change", async () => {
    const { user, change } = await signedIn();
    expect((await change({ currentPassword: user.password, newPassword: "Voluntary-Pass4$" })).status).toBe(200);

    expect((await login(user.email, user.password)).status).toBe(401);
    expect((await login(user.email, "Voluntary-Pass4$")).status).toBe(200);
  });

  it("requires a session", async () => {
    const res = await request(app)
      .post("/api/auth/change-password")
      .send({ currentPassword: TEST_PASSWORD, newPassword: "Whatever-Pass5%" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

// ---------------------------------------------------------------------------
describe("API-07 — current user, logout, and expiry (AC-12, AC-13, AC-14, BR-19, BR-20)", () => {
  it("returns exactly the five identity fields and ignores a client user id", async () => {
    const user = await createTestUser({ role: "Administrator", name: "Me Admin" });
    const other = await createTestUser({ name: "Someone Else" });
    const token = sessionTokenFrom(await login(user.email, user.password))!;

    const res = await request(app)
      .get(`/api/auth/me?userId=${other.id}`)
      .set("Cookie", cookieHeader(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        id: user.id,
        name: "Me Admin",
        email: user.email,
        role: "Administrator",
        mustChangePassword: false,
      },
    });
  });

  it("works while a password change is still required", async () => {
    const user = await createTestUser({ mustChangePassword: true });
    const token = sessionTokenFrom(await login(user.email, user.password))!;
    const res = await request(app).get("/api/auth/me").set("Cookie", cookieHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.mustChangePassword).toBe(true);
  });

  it("returns 401 without a session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Please sign in to continue." },
    });
  });

  it("logs out with 204, clears the cookie, and refuses the replayed token", async () => {
    const user = await createTestUser();
    const token = sessionTokenFrom(await login(user.email, user.password))!;

    const logout = await request(app).post("/api/auth/logout").set("Cookie", cookieHeader(token));
    expect(logout.status).toBe(204);
    expect(sessionCookieLine(logout)).toMatch(/Expires=Thu, 01 Jan 1970/);

    const replay = await request(app).get("/api/auth/me").set("Cookie", cookieHeader(token));
    expect(replay.status).toBe(401);

    const session = await prisma.session.findUniqueOrThrow({
      where: { tokenHash: hashSessionToken(token) },
    });
    expect(session.revokedAt).not.toBeNull();
  });

  it("logs out idempotently without a cookie", async () => {
    expect((await request(app).post("/api/auth/logout")).status).toBe(204);
    expect(
      (await request(app).post("/api/auth/logout").set("Cookie", cookieHeader("not-a-real-token"))).status,
    ).toBe(204);
  });

  it("refuses an expired session", async () => {
    const user = await createTestUser();
    const token = sessionTokenFrom(await login(user.email, user.password))!;

    await prisma.session.update({
      where: { tokenHash: hashSessionToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app).get("/api/auth/me").set("Cookie", cookieHeader(token));
    expect(res.status).toBe(401);
  });

  it("ends a live session once the user becomes inactive (BR-15)", async () => {
    const user = await createTestUser();
    const token = sessionTokenFrom(await login(user.email, user.password))!;

    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    const res = await request(app).get("/api/auth/me").set("Cookie", cookieHeader(token));
    expect(res.status).toBe(401);
    const session = await prisma.session.findUniqueOrThrow({
      where: { tokenHash: hashSessionToken(token) },
    });
    expect(session.revokedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("SEC-01 — secrets never exposed (AC-15, BR-12, BR-17)", () => {
  it("keeps passwords, hashes, and tokens out of responses and logs", async () => {
    const logged: string[] = [];
    for (const method of ["log", "error", "warn", "info"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(" "));
      });
    }

    const user = await createTestUser({ mustChangePassword: true });
    const loginRes = await login(user.email, user.password);
    const token = sessionTokenFrom(loginRes)!;
    const cookie = cookieHeader(token);

    const newPassword = "Secret-Rotated6^";
    const responses = [
      loginRes,
      await request(app).get("/api/auth/me").set("Cookie", cookie),
      await request(app)
        .post("/api/auth/change-password")
        .set("Cookie", cookie)
        .send({ currentPassword: user.password, newPassword }),
      await request(app).post("/api/auth/logout").set("Cookie", cookie),
    ];

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);

    const secrets = [user.password, newPassword, stored.passwordHash!, token];
    for (const res of responses) {
      const body = JSON.stringify(res.body ?? "");
      for (const secret of secrets) expect(body).not.toContain(secret);
      expect(body).not.toContain("passwordHash");
    }
    for (const line of logged) {
      for (const secret of secrets) expect(line).not.toContain(secret);
    }
  });
});

describe("SEC-02 — account-existence timing (BR-14)", () => {
  it("runs a bcrypt comparison for an unknown email too", async () => {
    const compare = vi.spyOn(bcrypt, "compare");

    await login("definitely-unknown@toktickit.test", "Wrong-Pass1!");

    expect(compare).toHaveBeenCalledTimes(1);
  });
});
