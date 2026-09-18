import type { UserRole } from "@prisma/client";
import { isValidEmail, normalizeEmail, passwordRuleError } from "./auth/credentials.js";

// Administrator User Management validation — specification.md §14.2, §14.4,
// BR-50, BR-51.

export const ROLES: readonly UserRole[] = ["Requester", "ITStaff", "Administrator"];

export const NAME_MIN = 2;
export const NAME_MAX = 100;

export type FieldErrors = Record<string, string>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** BR-50 — 2–100 characters after trimming. */
export function validateName(raw: unknown, fieldErrors: FieldErrors): string | undefined {
  if (typeof raw !== "string") {
    fieldErrors.name = "Name must be 2–100 characters.";
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
    fieldErrors.name = "Name must be 2–100 characters.";
    return undefined;
  }
  return trimmed;
}

/** BR-11 — trimmed, lower-cased, ≤254 characters, `local@domain.tld`. */
export function validateEmailField(raw: unknown, fieldErrors: FieldErrors): string | undefined {
  if (typeof raw !== "string") {
    fieldErrors.email = "Enter a valid email address.";
    return undefined;
  }
  const normalized = normalizeEmail(raw);
  if (!isValidEmail(normalized)) {
    fieldErrors.email = "Enter a valid email address.";
    return undefined;
  }
  return normalized;
}

/** BR-50 — exactly one of the three roles; arrays, null, and unknown values rejected. */
export function validateRole(raw: unknown, fieldErrors: FieldErrors): UserRole | undefined {
  if (typeof raw !== "string" || !(ROLES as readonly string[]).includes(raw)) {
    fieldErrors.role = "Select a role.";
    return undefined;
  }
  return raw as UserRole;
}

/** Optional boolean; defaults handled by the caller. */
export function validateIsActive(raw: unknown, fieldErrors: FieldErrors): boolean | undefined {
  if (typeof raw !== "boolean") {
    fieldErrors.isActive = "Active must be true or false.";
    return undefined;
  }
  return raw;
}

/** BR-13, checked against the target account's own (new) email. */
export function validateInitialPassword(
  raw: unknown,
  email: string,
  fieldErrors: FieldErrors,
  field = "initialPassword",
): string | undefined {
  if (typeof raw !== "string" || raw.length === 0) {
    fieldErrors[field] = "Initial password is required.";
    return undefined;
  }
  const ruleError = passwordRuleError(raw, email);
  if (ruleError) {
    fieldErrors[field] = ruleError;
    return undefined;
  }
  return raw;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  initialPassword: string;
}

const CREATE_FIELDS = new Set(["name", "email", "role", "isActive", "initialPassword"]);

export function validateCreateUserBody(
  body: unknown,
): { input?: CreateUserInput; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};

  if (!isPlainObject(body)) {
    return { fieldErrors: { body: "A JSON request body is required." } };
  }

  for (const key of Object.keys(body)) {
    if (!CREATE_FIELDS.has(key)) fieldErrors[key] = "This field cannot be set.";
  }

  const name = validateName(body.name, fieldErrors);
  const email = validateEmailField(body.email, fieldErrors);
  const role = validateRole(body.role, fieldErrors);
  const isActive = body.isActive === undefined ? true : validateIsActive(body.isActive, fieldErrors);
  const initialPassword = email
    ? validateInitialPassword(body.initialPassword, email, fieldErrors)
    : (() => {
        // Still validate shape even without a valid email to check against.
        if (typeof body.initialPassword !== "string" || body.initialPassword.length === 0) {
          fieldErrors.initialPassword = "Initial password is required.";
        }
        return undefined;
      })();

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  return {
    fieldErrors,
    input: {
      name: name!,
      email: email!,
      role: role!,
      isActive: isActive!,
      initialPassword: initialPassword!,
    },
  };
}

export interface EditUserInput {
  name?: string;
  email?: string;
  role?: UserRole;
  isActive?: boolean;
}

const EDIT_FIELDS = new Set(["name", "email", "role", "isActive"]);

export function validateEditUserBody(
  body: unknown,
): { input?: EditUserInput; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};

  if (!isPlainObject(body)) {
    return { fieldErrors: { body: "A JSON request body is required." } };
  }

  for (const key of Object.keys(body)) {
    if (!EDIT_FIELDS.has(key)) fieldErrors[key] = "This field cannot be set.";
  }

  if (Object.keys(body).length === 0) {
    return { fieldErrors: { body: "Provide at least one field to update." } };
  }

  const input: EditUserInput = {};
  if (body.name !== undefined) {
    const name = validateName(body.name, fieldErrors);
    if (name !== undefined) input.name = name;
  }
  if (body.email !== undefined) {
    const email = validateEmailField(body.email, fieldErrors);
    if (email !== undefined) input.email = email;
  }
  if (body.role !== undefined) {
    const role = validateRole(body.role, fieldErrors);
    if (role !== undefined) input.role = role;
  }
  if (body.isActive !== undefined) {
    const isActive = validateIsActive(body.isActive, fieldErrors);
    if (isActive !== undefined) input.isActive = isActive;
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  return { fieldErrors, input };
}

export function validateInitialPasswordBody(
  body: unknown,
  email: string,
): { initialPassword?: string; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  if (!isPlainObject(body)) {
    return { fieldErrors: { body: "A JSON request body is required." } };
  }
  for (const key of Object.keys(body)) {
    if (key !== "initialPassword") fieldErrors[key] = "This field cannot be set.";
  }
  const initialPassword = validateInitialPassword(body.initialPassword, email, fieldErrors);
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  return { fieldErrors, initialPassword };
}
