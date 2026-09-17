import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions, Response } from "express";
import { getPrisma } from "../prisma.js";

// Server-side sessions — Lab 3 BR-17, BR-18, BR-19 (api-spec.md §1.2).

export const SESSION_COOKIE = "toktickit_session";

/** BR-18 — default absolute lifetime. */
export const DEFAULT_SESSION_TTL_HOURS = 8;

const HOUR_MS = 60 * 60 * 1000;

export function sessionTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const hours = Number(env.SESSION_TTL_HOURS);
  return (Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_SESSION_TTL_HOURS) * HOUR_MS;
}

/** BR-17 — 32 random bytes, sent to the browser only inside the cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** BR-17 — only this hash is stored, never the token itself. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(createdAt: Date, env: NodeJS.ProcessEnv = process.env): Date {
  return new Date(createdAt.getTime() + sessionTtlMs(env));
}

/** BR-18 / BR-19 — a session counts only while unrevoked and unexpired. */
export function isSessionUsable(
  session: { expiresAt: Date; revokedAt: Date | null },
  now: Date = new Date(),
): boolean {
  return session.revokedAt === null && session.expiresAt.getTime() > now.getTime();
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.COOKIE_SECURE === "true",
  };
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: sessionTtlMs() });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

/** Reads one cookie without pulling in a parser dependency. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return value ? decodeURIComponent(value) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Creates a session row and returns the token for the cookie. */
export async function createSession(userId: number) {
  const token = generateSessionToken();
  const now = new Date();
  const session = await getPrisma().session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId,
      createdAt: now,
      expiresAt: sessionExpiry(now),
    },
    select: { id: true, expiresAt: true },
  });
  return { token, session };
}

/** The user fields every authenticated request carries (BR-20). */
export const AUTH_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  mustChangePassword: true,
  isActive: true,
  deletedAt: true,
} as const;

/**
 * Resolves a cookie token to its live session and user. A session belonging to
 * a user who is now inactive is revoked on the spot (BR-15).
 */
export async function resolveSession(token: string) {
  const session = await getPrisma().session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: AUTH_USER_SELECT },
    },
  });

  if (!session || !isSessionUsable(session)) return null;

  if (!session.user.isActive || session.user.deletedAt !== null) {
    await revokeSessionById(session.id);
    return null;
  }

  return { sessionId: session.id, user: session.user };
}

export async function revokeSessionById(sessionId: number) {
  await getPrisma().session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** BR-21 — a password change signs the user out everywhere else. */
export async function revokeOtherSessions(userId: number, keepSessionId: number) {
  await getPrisma().session.updateMany({
    where: { userId, revokedAt: null, id: { not: keepSessionId } },
    data: { revokedAt: new Date() },
  });
}
