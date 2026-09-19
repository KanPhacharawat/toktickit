import { describe, expect, it } from "vitest";
import {
  generateSessionToken,
  hashSessionToken,
  isSessionUsable,
  readCookie,
  sessionExpiry,
  sessionTtlMs,
} from "../../src/auth/session.js";

// UNIT-04 (tests.md §2) — session token and expiry, no database needed.

describe("UNIT-04 — session token and expiry (BR-17, BR-18, AC-14)", () => {
  it("generates 32 random bytes as base64url", () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(generateSessionToken()).not.toBe(token);
  });

  it("stores a SHA-256 hash that is not the token", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashSessionToken(token)).toBe(hash);
  });

  it("expires 8 hours after creation by default", () => {
    const createdAt = new Date("2026-09-20T00:00:00.000Z");
    expect(sessionTtlMs({})).toBe(8 * 60 * 60 * 1000);
    expect(sessionExpiry(createdAt, {}).toISOString()).toBe("2026-09-20T08:00:00.000Z");
    expect(sessionTtlMs({ SESSION_TTL_HOURS: "2" })).toBe(2 * 60 * 60 * 1000);
  });

  it("treats expired and revoked sessions as unusable", () => {
    const now = new Date("2026-09-20T08:00:00.000Z");
    const later = new Date("2026-09-20T09:00:00.000Z");
    const earlier = new Date("2026-09-20T07:00:00.000Z");

    expect(isSessionUsable({ expiresAt: later, revokedAt: null }, now)).toBe(true);
    expect(isSessionUsable({ expiresAt: earlier, revokedAt: null }, now)).toBe(false);
    expect(isSessionUsable({ expiresAt: now, revokedAt: null }, now)).toBe(false);
    expect(isSessionUsable({ expiresAt: later, revokedAt: earlier }, now)).toBe(false);
  });

  it("reads the session cookie from a Cookie header", () => {
    expect(readCookie("a=1; toktickit_session=abc%2Ddef; b=2", "toktickit_session")).toBe("abc-def");
    expect(readCookie("a=1", "toktickit_session")).toBeNull();
    expect(readCookie(undefined, "toktickit_session")).toBeNull();
    expect(readCookie("toktickit_session=", "toktickit_session")).toBeNull();
  });
});
