import bcrypt from "bcryptjs";

// Credential rules — Lab 3 BR-11, BR-12, BR-13.
//
// The client mirrors these rules for its live checklist, but this module is
// the authoritative layer: nothing is hashed or stored without passing it.

/** BR-11 — the longest email accepted. */
export const EMAIL_MAX = 254;

/** BR-13 — password length bounds (bcrypt reads at most 72 bytes). */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const PASSWORD_MAX_BYTES = 72;

/** BR-12 — bcrypt cost. Tests may lower it, but never below this floor. */
export const DEFAULT_BCRYPT_COST = 12;
export const MIN_BCRYPT_COST = 10;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** BR-11 — trimmed and lower-cased before validation, storage, and lookup. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** BR-11 — `local@domain.tld`, at most 254 characters. Expects a normalized value. */
export function isValidEmail(email: string): boolean {
  return email.length > 0 && email.length <= EMAIL_MAX && EMAIL_PATTERN.test(email);
}

export const PASSWORD_MESSAGES = {
  length: `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`,
  composition:
    "Password must include upper and lower case letters, a number, and a special character.",
  email: "Password must not be your email address.",
} as const;

/**
 * BR-13 — returns the first rule a new or initial password breaks, or null.
 * Passwords are never trimmed: surrounding spaces are part of the secret.
 */
export function passwordRuleError(password: string, email: string): string | null {
  const characters = [...password].length;
  if (
    characters < PASSWORD_MIN ||
    characters > PASSWORD_MAX ||
    Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES
  ) {
    return PASSWORD_MESSAGES.length;
  }

  const hasUpper = /\p{Lu}/u.test(password);
  const hasLower = /\p{Ll}/u.test(password);
  const hasDigit = /\p{Nd}/u.test(password);
  const hasSpecial = /[^\p{L}\p{Nd}]/u.test(password);
  if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
    return PASSWORD_MESSAGES.composition;
  }

  if (password.toLowerCase() === normalizeEmail(email)) {
    return PASSWORD_MESSAGES.email;
  }

  return null;
}

/**
 * BR-12 — the configured cost. A value below the floor is a configuration
 * error, so it fails loudly instead of silently weakening every hash.
 */
export function bcryptCost(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.BCRYPT_COST;
  if (raw === undefined || raw === "") return DEFAULT_BCRYPT_COST;

  const cost = Number(raw);
  if (!Number.isInteger(cost) || cost < MIN_BCRYPT_COST) {
    throw new Error(
      `BCRYPT_COST must be an integer of at least ${MIN_BCRYPT_COST}.`,
    );
  }
  return cost;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, bcryptCost());
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let dummyHash: Promise<string> | null = null;

/**
 * BR-14 — a hash to compare against when the email is unknown or has no
 * password, so those requests cost the same bcrypt work as a real account and
 * response timing does not reveal whether an account exists.
 */
export function timingSafeDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash("toktickit-no-such-account", bcryptCost());
  return dummyHash;
}
