import { describe, expect, it } from "vitest";
import {
  PASSWORD_MESSAGES,
  bcryptCost,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  passwordRuleError,
  verifyPassword,
} from "../../src/auth/credentials.js";

// UNIT-01 – UNIT-03 (tests.md §2) — no database needed.

const EMAIL = "someone@example.com";

/** Pads a valid core ("Aa1!") to an exact character count. */
function passwordOfLength(length: number): string {
  return "Aa1!" + "x".repeat(length - 4);
}

describe("UNIT-01 — password rules and boundaries (BR-13, AC-09)", () => {
  it("rejects 7 characters and accepts 8", () => {
    expect(passwordRuleError(passwordOfLength(7), EMAIL)).toBe(PASSWORD_MESSAGES.length);
    expect(passwordRuleError(passwordOfLength(8), EMAIL)).toBeNull();
  });

  it("accepts 72 characters and rejects 73", () => {
    expect(passwordRuleError(passwordOfLength(72), EMAIL)).toBeNull();
    expect(passwordRuleError(passwordOfLength(73), EMAIL)).toBe(PASSWORD_MESSAGES.length);
  });

  it("rejects more than 72 UTF-8 bytes even under 72 characters", () => {
    // "é" is two bytes: 4 + 40 × 2 = 84 bytes in 44 characters.
    const multibyte = "Aa1!" + "é".repeat(40);
    expect([...multibyte].length).toBeLessThan(72);
    expect(passwordRuleError(multibyte, EMAIL)).toBe(PASSWORD_MESSAGES.length);
  });

  it.each([
    ["no uppercase letter", "aaaa1111!"],
    ["no lowercase letter", "AAAA1111!"],
    ["no digit", "Aaaaaaaa!"],
    ["no special character", "Aaaaaaa11"],
  ])("rejects a password with %s", (_label, password) => {
    expect(passwordRuleError(password, EMAIL)).toBe(PASSWORD_MESSAGES.composition);
  });

  it("rejects a password equal to the email in any case", () => {
    const email = "Ab1!cd@example.com";
    expect(passwordRuleError("ab1!CD@EXAMPLE.COM", email)).toBe(PASSWORD_MESSAGES.email);
  });

  it("does not trim: surrounding spaces count as special characters", () => {
    expect(passwordRuleError(" Abcdef1 ", EMAIL)).toBeNull();
  });
});

describe("UNIT-02 — password hashing (BR-12, AC-15)", () => {
  it("produces a bcrypt hash that verifies only the right password", async () => {
    const hash = await hashPassword("Correct-Pass1!");

    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(hash).not.toContain("Correct-Pass1!");
    expect(await verifyPassword("Correct-Pass1!", hash)).toBe(true);
    expect(await verifyPassword("Wrong-Pass1!", hash)).toBe(false);
  });

  it("salts every hash, so the same password hashes differently", async () => {
    const [first, second] = await Promise.all([
      hashPassword("Same-Pass1!"),
      hashPassword("Same-Pass1!"),
    ]);
    expect(first).not.toBe(second);
  });

  it("defaults to cost 12 and refuses a cost below 10", () => {
    expect(bcryptCost({})).toBe(12);
    expect(bcryptCost({ BCRYPT_COST: "10" })).toBe(10);
    expect(() => bcryptCost({ BCRYPT_COST: "9" })).toThrow(/at least 10/);
    expect(() => bcryptCost({ BCRYPT_COST: "abc" })).toThrow();
  });

  it("uses the configured cost in the stored hash", async () => {
    // vitest.config.ts sets BCRYPT_COST=10 for the test run.
    expect(await hashPassword("Cost-Pass1!")).toMatch(/^\$2[aby]\$10\$/);
  });
});

describe("UNIT-03 — email normalization and format (BR-11, AC-48)", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail("  Requester-A@Example.COM ")).toBe("requester-a@example.com");
  });

  it.each([
    ["missing @", "requester.example.com"],
    ["missing domain dot", "requester@example"],
    ["empty local part", "@example.com"],
    ["contains a space", "req uester@example.com"],
    ["empty", ""],
  ])("rejects an email with %s", (_label, email) => {
    expect(isValidEmail(email)).toBe(false);
  });

  it("accepts 254 characters and rejects 255", () => {
    const domain = "@example.com";
    const at254 = "a".repeat(254 - domain.length) + domain;
    expect(isValidEmail(at254)).toBe(true);
    expect(isValidEmail("a" + at254)).toBe(false);
  });
});
