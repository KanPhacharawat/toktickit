import type { PrismaClient, UserRole } from "@prisma/client";
import { hashPassword } from "../src/auth/credentials.js";

// Seed data (Lab 3 specification.md §7.8, BR-59).
//
// Every step is an upsert keyed on a natural unique column, so running the
// seed repeatedly never creates duplicates. Seeded accounts are development
// fixtures: each run resets them to the documented password and flags, so
// tests and demos always start from the same state. Users not listed here
// (for example, accounts an Administrator creates) are never touched.

/**
 * The shared local-development password for every seeded account. It meets
 * BR-13 and is documented in the README. Never use it outside local dev.
 */
export const DEV_PASSWORD = "TokTickIT-Dev1!";

export const CATEGORY_NAMES = [
  "Account and Access",
  "Hardware",
  "Software",
  "Network",
];

export const RELATED_SYSTEM_NAMES = [
  "Campus Wi-Fi",
  "VPN",
  "Email and Calendar",
  "Corporate Laptop",
  "Student Information System",
  "Printing Service",
  "File Storage",
];

export interface SeedAccount {
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  department?: string;
}

export const SEED_ACCOUNTS: SeedAccount[] = [
  // Requester A–E and Inactive Requester are the Lab 2 Development Requesters,
  // migrated into `User`. D and E demonstrate a migrated Requester receiving
  // an initial password that must be changed at first login (BR-58).
  { name: "Requester A", email: "requester-a@example.com", role: "Requester", isActive: true, mustChangePassword: false, department: "Finance" },
  { name: "Requester B", email: "requester-b@example.com", role: "Requester", isActive: true, mustChangePassword: false, department: "Human Resources" },
  { name: "Requester C", email: "requester-c@example.com", role: "Requester", isActive: true, mustChangePassword: false, department: "Registrar" },
  { name: "Requester D", email: "requester-d@example.com", role: "Requester", isActive: true, mustChangePassword: true, department: "Library" },
  { name: "Requester E", email: "requester-e@example.com", role: "Requester", isActive: true, mustChangePassword: true, department: "Facilities" },
  { name: "Inactive Requester", email: "inactive-requester@example.com", role: "Requester", isActive: false, mustChangePassword: false, department: "Archived" },

  { name: "IT Staff 1", email: "itstaff-1@example.com", role: "ITStaff", isActive: true, mustChangePassword: false },
  { name: "IT Staff 2", email: "itstaff-2@example.com", role: "ITStaff", isActive: true, mustChangePassword: false },
  { name: "IT Staff 3", email: "itstaff-3@example.com", role: "ITStaff", isActive: true, mustChangePassword: false },
  { name: "Inactive IT Staff", email: "inactive-itstaff@example.com", role: "ITStaff", isActive: false, mustChangePassword: false },

  { name: "Administrator", email: "admin@example.com", role: "Administrator", isActive: true, mustChangePassword: false },
  { name: "Inactive Administrator", email: "inactive-admin@example.com", role: "Administrator", isActive: false, mustChangePassword: false },
];

export async function seedDatabase(prisma: PrismaClient) {
  for (const [index, name] of CATEGORY_NAMES.entries()) {
    await prisma.category.upsert({
      where: { name },
      update: { isActive: true, sortOrder: index, deletedAt: null },
      create: { name, isActive: true, sortOrder: index },
    });
  }

  for (const [index, name] of RELATED_SYSTEM_NAMES.entries()) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: { isActive: true, sortOrder: index, deletedAt: null },
      create: { name, isActive: true, sortOrder: index },
    });
  }

  for (const account of SEED_ACCOUNTS) {
    // BR-12 — hashed per account, never stored in plain text.
    const passwordHash = await hashPassword(DEV_PASSWORD);
    const fields = {
      name: account.name,
      role: account.role,
      isActive: account.isActive,
      mustChangePassword: account.mustChangePassword,
      department: account.department ?? null,
      passwordHash,
      deletedAt: null,
    };

    await prisma.user.upsert({
      where: { email: account.email },
      update: fields,
      create: { email: account.email, ...fields },
    });
  }

  return {
    categories: CATEGORY_NAMES.length,
    relatedSystems: RELATED_SYSTEM_NAMES.length,
    accounts: SEED_ACCOUNTS.length,
  };
}
