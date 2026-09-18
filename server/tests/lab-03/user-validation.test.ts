import { describe, it, expect } from "vitest";
import {
  validateCreateUserBody,
  validateEditUserBody,
} from "../../src/adminUserValidation.js";

// UNIT-11 — user field validation (BR-50, BR-51, AC-49).

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "New Staff",
    email: "new.staff@example.com",
    role: "ITStaff",
    isActive: true,
    initialPassword: "Temp-Pass-9!",
    ...overrides,
  };
}

describe("UNIT-11 — create user validation (BR-50, AC-49)", () => {
  it("accepts a valid body", () => {
    const { input, fieldErrors } = validateCreateUserBody(validBody());
    expect(fieldErrors).toEqual({});
    expect(input).toMatchObject({ name: "New Staff", email: "new.staff@example.com", role: "ITStaff" });
  });

  it("rejects a 1-character name, accepts 2 and 100, rejects 101", () => {
    expect(validateCreateUserBody(validBody({ name: "A" })).fieldErrors.name).toBeDefined();
    expect(validateCreateUserBody(validBody({ name: "Al" })).fieldErrors.name).toBeUndefined();
    expect(validateCreateUserBody(validBody({ name: "a".repeat(100) })).fieldErrors.name).toBeUndefined();
    expect(validateCreateUserBody(validBody({ name: "a".repeat(101) })).fieldErrors.name).toBeDefined();
  });

  it("accepts each of the three roles", () => {
    for (const role of ["Requester", "ITStaff", "Administrator"]) {
      expect(validateCreateUserBody(validBody({ role })).fieldErrors.role).toBeUndefined();
    }
  });

  it("rejects SuperUser, arrays, null, and a missing role", () => {
    expect(validateCreateUserBody(validBody({ role: "SuperUser" })).fieldErrors.role).toBeDefined();
    expect(validateCreateUserBody(validBody({ role: ["ITStaff"] })).fieldErrors.role).toBeDefined();
    expect(validateCreateUserBody(validBody({ role: null })).fieldErrors.role).toBeDefined();
    expect(validateCreateUserBody(validBody({ role: undefined })).fieldErrors.role).toBeDefined();
  });

  it("rejects a non-boolean isActive", () => {
    expect(validateCreateUserBody(validBody({ isActive: "yes" })).fieldErrors.isActive).toBeDefined();
  });

  it("defaults isActive to true when omitted", () => {
    const body = validBody();
    delete (body as Record<string, unknown>).isActive;
    const { input } = validateCreateUserBody(body);
    expect(input?.isActive).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(validateCreateUserBody(validBody({ email: "not-an-email" })).fieldErrors.email).toBeDefined();
  });

  it("rejects a weak initial password", () => {
    expect(
      validateCreateUserBody(validBody({ initialPassword: "short" })).fieldErrors.initialPassword,
    ).toBeDefined();
  });

  it("rejects an initial password equal to the email", () => {
    expect(
      validateCreateUserBody(
        validBody({ email: "match@example.com", initialPassword: "match@example.com" }),
      ).fieldErrors.initialPassword,
    ).toBeDefined();
  });

  it("rejects unknown fields, e.g. passwordHash, mustChangePassword, id", () => {
    expect(validateCreateUserBody(validBody({ passwordHash: "x" })).fieldErrors.passwordHash).toBeDefined();
    expect(
      validateCreateUserBody(validBody({ mustChangePassword: false })).fieldErrors.mustChangePassword,
    ).toBeDefined();
    expect(validateCreateUserBody(validBody({ id: 5 })).fieldErrors.id).toBeDefined();
  });

  it("rejects a non-object body", () => {
    expect(validateCreateUserBody(null).fieldErrors).not.toEqual({});
    expect(validateCreateUserBody("string").fieldErrors).not.toEqual({});
    expect(validateCreateUserBody([]).fieldErrors).not.toEqual({});
  });
});

describe("UNIT-11 — edit user validation (BR-51)", () => {
  it("accepts a partial update", () => {
    const { input, fieldErrors } = validateEditUserBody({ name: "Renamed" });
    expect(fieldErrors).toEqual({});
    expect(input).toEqual({ name: "Renamed" });
  });

  it("rejects an empty body", () => {
    expect(validateEditUserBody({}).fieldErrors.body).toBeDefined();
  });

  it("rejects initialPassword or password on edit", () => {
    expect(
      validateEditUserBody({ name: "X", initialPassword: "Temp-Pass-9!" }).fieldErrors.initialPassword,
    ).toBeDefined();
    expect(validateEditUserBody({ name: "X", password: "hunter2" }).fieldErrors.password).toBeDefined();
  });

  it("validates each field with the same rules as create", () => {
    expect(validateEditUserBody({ name: "A" }).fieldErrors.name).toBeDefined();
    expect(validateEditUserBody({ email: "nope" }).fieldErrors.email).toBeDefined();
    expect(validateEditUserBody({ role: "SuperUser" }).fieldErrors.role).toBeDefined();
    expect(validateEditUserBody({ isActive: "yes" }).fieldErrors.isActive).toBeDefined();
  });
});
