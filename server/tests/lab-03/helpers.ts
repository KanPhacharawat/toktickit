import { randomUUID } from "node:crypto";
import type { UserRole } from "@prisma/client";
import type { Response } from "supertest";
import { hashPassword } from "../../src/auth/credentials.js";
import { SESSION_COOKIE } from "../../src/auth/session.js";
import { getPrisma } from "../../src/prisma.js";

// Shared fixtures for the Lab 3 suites (tests.md §1.2).

/** A password that satisfies BR-13, for fixtures. */
export const TEST_PASSWORD = "Fixture-Pass1!";

export interface TestUser {
  id: number;
  email: string;
  password: string;
}

const created = new Set<string>();

/** Creates a user with a unique `@toktickit.test` email, removed by `removeTestUsers`. */
export async function createTestUser(
  options: {
    role?: UserRole;
    isActive?: boolean;
    mustChangePassword?: boolean;
    password?: string | null;
    name?: string;
  } = {},
): Promise<TestUser> {
  const email = `test-${randomUUID()}@toktickit.test`;
  const password = options.password === undefined ? TEST_PASSWORD : options.password;

  const user = await getPrisma().user.create({
    data: {
      name: options.name ?? "Test User",
      email,
      role: options.role ?? "Requester",
      isActive: options.isActive ?? true,
      mustChangePassword: options.mustChangePassword ?? false,
      passwordHash: password === null ? null : await hashPassword(password),
    },
    select: { id: true },
  });

  created.add(email);
  return { id: user.id, email, password: password ?? "" };
}

export async function removeTestUsers() {
  if (created.size === 0) return;
  // Sessions cascade with their user.
  await getPrisma().user.deleteMany({ where: { email: { in: [...created] } } });
  created.clear();
}

/** The raw session token from a response's Set-Cookie header, if any. */
export function sessionTokenFrom(res: Response): string | null {
  const header = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = header?.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return null;
  const value = cookie.slice(SESSION_COOKIE.length + 1).split(";")[0];
  return value ? decodeURIComponent(value) : null;
}

/** The full Set-Cookie line for the session cookie, if any. */
export function sessionCookieLine(res: Response): string | undefined {
  const header = res.headers["set-cookie"] as unknown as string[] | undefined;
  return header?.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
}

export function cookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
}
