import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { DEV_PASSWORD, SEED_ACCOUNTS, seedDatabase } from "../../prisma/seedData.js";
import { app } from "../../src/app.js";
import { hashPassword, verifyPassword } from "../../src/auth/credentials.js";
import { resetLoginThrottle } from "../../src/auth/loginThrottle.js";
import { getPrisma } from "../../src/prisma.js";
import { createTestUser, removeTestUsers } from "./helpers.js";

// MIG-03 (tests.md §2) — the seed is idempotent and resets its own accounts.

const prisma = getPrisma();
const seededEmails = SEED_ACCOUNTS.map((a) => a.email);

afterAll(async () => {
  await removeTestUsers();
  await prisma.$disconnect();
});

describe("MIG-03 — seed idempotency (AC-58, BR-59)", () => {
  it("creates each account once and meets the required role counts", async () => {
    await seedDatabase(prisma);
    await seedDatabase(prisma);

    const users = await prisma.user.findMany({ where: { email: { in: seededEmails } } });
    expect(users).toHaveLength(SEED_ACCOUNTS.length);

    const count = (role: string, isActive: boolean) =>
      users.filter((u) => u.role === role && u.isActive === isActive).length;

    expect(count("Requester", true)).toBeGreaterThanOrEqual(4);
    expect(count("Requester", false)).toBeGreaterThanOrEqual(1);
    expect(count("ITStaff", true)).toBeGreaterThanOrEqual(3);
    expect(count("ITStaff", false)).toBeGreaterThanOrEqual(1);
    expect(count("Administrator", true)).toBeGreaterThanOrEqual(1);

    expect(await prisma.category.count()).toBe(4);
  }, 60_000);

  it("resets seeded accounts to their documented password and flags", async () => {
    await prisma.user.update({
      where: { email: "requester-a@example.com" },
      data: { passwordHash: await hashPassword("Changed-By-Test1!"), mustChangePassword: true, isActive: false },
    });

    await seedDatabase(prisma);

    const a = await prisma.user.findUniqueOrThrow({ where: { email: "requester-a@example.com" } });
    expect(a).toMatchObject({ role: "Requester", isActive: true, mustChangePassword: false });
    expect(a.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword(DEV_PASSWORD, a.passwordHash!)).toBe(true);

    const d = await prisma.user.findUniqueOrThrow({ where: { email: "requester-d@example.com" } });
    expect(d.mustChangePassword).toBe(true);
  }, 60_000);

  it("never stores the development password in plain text", async () => {
    const users = await prisma.user.findMany({ where: { email: { in: seededEmails } } });
    for (const user of users) {
      expect(user.passwordHash).not.toBe(DEV_PASSWORD);
      expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    }
  });

  it("leaves users that are not part of the seed untouched", async () => {
    const outsider = await createTestUser({ role: "ITStaff", mustChangePassword: true, name: "Outsider" });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: outsider.id } });

    await seedDatabase(prisma);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: outsider.id } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after).toMatchObject({ name: "Outsider", role: "ITStaff", mustChangePassword: true });
  }, 60_000);

  it("lets the documented credentials sign in", async () => {
    resetLoginThrottle();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "itstaff-1@example.com", password: DEV_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ role: "ITStaff", mustChangePassword: false });
  });
});
