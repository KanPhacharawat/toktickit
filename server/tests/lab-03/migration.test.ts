import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { hashPassword } from "../../src/auth/credentials.js";
import { resetLoginThrottle } from "../../src/auth/loginThrottle.js";
import { getPrisma } from "../../src/prisma.js";
import { createTestUser, removeTestUsers } from "./helpers.js";

// MIG-01, MIG-02 (tests.md §2).
//
// MIG-01 replays the real migration history into a separate, disposable
// database (MIGRATION_TEST_DATABASE_URL): the Lab 1–2 migrations first, then
// Lab 2 fixture rows, then the Lab 3 migration — and checks that nothing from
// Lab 2 was lost.
//
// It deliberately uses its own database rather than a schema inside the main
// one: `npx prisma dev` shares a single session between connections, so a
// schema-scoped search_path would leak into the application's queries.

const SERVER_DIR = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS_DIR = path.join(SERVER_DIR, "prisma", "migrations");
// Every Lab 3 migration, in order. All of them run together, after the Lab 2
// fixture rows are inserted, so the migration history matches a real Lab 2
// database being upgraded.
const LAB3_MIGRATIONS = [
  "20260917150000_lab3_users_sessions",
  "20260918090000_lab3_ticket_ownership_and_threads",
];

/** A variable from the environment, or from server/.env as Prisma reads it. */
async function envValue(name: string): Promise<string> {
  if (process.env[name]) return process.env[name]!;
  const env = await fs.readFile(path.join(SERVER_DIR, ".env"), "utf8").catch(() => "");
  const match = env.match(new RegExp(`^${name}\\s*=\\s*"?([^"\\r\\n]+)"?`, "m"));
  if (!match) {
    throw new Error(
      `${name} is not configured. Add a disposable database URL to server/.env (see .env.example).`,
    );
  }
  return match[1];
}

let workDir: string;
let migrationUrl: string;
let scratch: PrismaClient;

/** Only one connection at a time: disconnect the client around the CLI. */
async function migrateDeploy() {
  await scratch.$disconnect();
  execSync(`npx prisma migrate deploy --schema "${path.join(workDir, "schema.prisma")}"`, {
    cwd: SERVER_DIR,
    env: { ...process.env, DATABASE_URL: migrationUrl },
    stdio: "pipe",
  });
}

async function copyMigration(name: string) {
  await fs.cp(path.join(MIGRATIONS_DIR, name), path.join(workDir, "migrations", name), {
    recursive: true,
  });
}

/** Empties the disposable database. */
async function resetScratchDatabase() {
  await scratch.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
  await scratch.$executeRawUnsafe(`CREATE SCHEMA public`);
}

async function query<T>(sql: string): Promise<T[]> {
  return scratch.$queryRawUnsafe<T[]>(sql);
}

describe("MIG-01 — Lab 3 migration on Lab 2 data (AC-56, BR-57, FR-50)", () => {
  beforeAll(async () => {
    migrationUrl = await envValue("MIGRATION_TEST_DATABASE_URL");
    const mainUrl = await envValue("DATABASE_URL");
    if (new URL(migrationUrl).host === new URL(mainUrl).host &&
        new URL(migrationUrl).pathname === new URL(mainUrl).pathname) {
      throw new Error("MIGRATION_TEST_DATABASE_URL must not be the application database.");
    }

    scratch = new PrismaClient({ datasourceUrl: migrationUrl });
    await resetScratchDatabase();

    // A private copy of the migration history that stops at Lab 2.
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "toktickit-migration-"));
    await fs.copyFile(path.join(SERVER_DIR, "prisma", "schema.prisma"), path.join(workDir, "schema.prisma"));
    await fs.mkdir(path.join(workDir, "migrations"));
    await fs.copyFile(
      path.join(MIGRATIONS_DIR, "migration_lock.toml"),
      path.join(workDir, "migrations", "migration_lock.toml"),
    );
    const lab2 = (await fs.readdir(MIGRATIONS_DIR)).filter(
      (name) => !LAB3_MIGRATIONS.includes(name) && name !== "migration_lock.toml",
    );
    for (const name of lab2) await copyMigration(name);
    await migrateDeploy();

    // Lab 2 data: two active Requesters (one with a messy email), one
    // inactive, a Ticket, and an Attachment.
    const fixtures = [
      `INSERT INTO "Category" (id, name) VALUES (1, 'Hardware')`,
      `INSERT INTO "RelatedSystem" (id, name) VALUES (1, 'VPN')`,
      `INSERT INTO "DevelopmentRequester" (id, name, email, department, "isActive") VALUES
         (7, 'Lab2 Alice', '  Alice.Lab2@Example.COM ', 'Finance', true),
         (8, 'Lab2 Bob', 'bob.lab2@example.com', NULL, true),
         (9, 'Lab2 Old', 'old.lab2@example.com', 'Archived', false)`,
      `SELECT setval('"DevelopmentRequester_id_seq"', 9)`,
      `INSERT INTO "Ticket" (id, "ticketNumber", "requesterId", "categoryId", "relatedSystemId",
                             summary, description, "requestedPriority", "currentStatus")
         VALUES (50, 'TT-20260901-0001', 8, 1, 1, 'VPN drops', 'The VPN drops every hour.', 'HIGH', 'New')`,
      `INSERT INTO "Attachment" (id, "ticketId", "originalFilename", "storageKey", "mimeType", "fileSize")
         VALUES (60, 50, 'screen.png', 'key-60.png', 'image/png', 1234)`,
    ];
    // One statement per call: Prisma raw queries are prepared statements.
    for (const sql of fixtures) await scratch.$queryRawUnsafe(sql);

    for (const name of LAB3_MIGRATIONS) await copyMigration(name);
    await migrateDeploy();
  }, 180_000);

  afterAll(async () => {
    if (scratch) {
      await resetScratchDatabase().catch(() => undefined);
      await scratch.$disconnect();
    }
    if (workDir) await fs.rm(workDir, { recursive: true, force: true });
  });

  it("renames the table instead of replacing it", async () => {
    const tables = await query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('DevelopmentRequester', 'User', 'Session')
      ORDER BY table_name`);
    expect(tables.map((t) => t.table_name)).toEqual(["Session", "User"]);
  });

  it("keeps every Requester id, name, department, and activation state", async () => {
    const users = await query<{
      id: number; name: string; email: string; department: string | null; isActive: boolean;
      role: string; passwordHash: string | null; mustChangePassword: boolean;
    }>(`SELECT id, name, email, department, "isActive", role::text AS role, "passwordHash", "mustChangePassword"
        FROM "User" ORDER BY id`);

    expect(users).toEqual([
      { id: 7, name: "Lab2 Alice", email: "alice.lab2@example.com", department: "Finance", isActive: true, role: "Requester", passwordHash: null, mustChangePassword: true },
      { id: 8, name: "Lab2 Bob", email: "bob.lab2@example.com", department: null, isActive: true, role: "Requester", passwordHash: null, mustChangePassword: true },
      { id: 9, name: "Lab2 Old", email: "old.lab2@example.com", department: "Archived", isActive: false, role: "Requester", passwordHash: null, mustChangePassword: true },
    ]);
  });

  it("keeps Tickets and Attachments pointing at the same Requester", async () => {
    const rows = await query<{ ticketNumber: string; name: string; attachments: number }>(`
      SELECT t."ticketNumber", u.name, (SELECT count(*)::int FROM "Attachment" a WHERE a."ticketId" = t.id) AS attachments
      FROM "Ticket" t JOIN "User" u ON u.id = t."requesterId"`);
    expect(rows).toEqual([{ ticketNumber: "TT-20260901-0001", name: "Lab2 Bob", attachments: 1 }]);
  });

  it("points the Ticket foreign key at User", async () => {
    const fks = await query<{ referenced: string }>(`
      SELECT confrelid::regclass::text AS referenced FROM pg_constraint
      WHERE conname = 'Ticket_requesterId_fkey'`);
    expect(fks).toHaveLength(1);
    expect(fks[0].referenced).toMatch(/"?User"?$/);
  });

  it("continues the id sequence after the migrated rows", async () => {
    const [inserted] = await query<{ id: number }>(`
      INSERT INTO "User" (name, email, "updatedAt") VALUES ('New Person', 'new.person@example.com', now())
      RETURNING id`);
    expect(inserted.id).toBe(10);
  });

  it("enforces unique emails and one valid role per user", async () => {
    await expect(
      scratch.$executeRawUnsafe(`INSERT INTO "User" (name, email, "updatedAt") VALUES ('Dup', 'bob.lab2@example.com', now())`),
    ).rejects.toThrow();
    await expect(
      scratch.$executeRawUnsafe(`UPDATE "User" SET role = 'SuperUser' WHERE id = 7`),
    ).rejects.toThrow();
  });
});

describe("MIG-02 — initial passwords for migrated Requesters (AC-57, BR-58)", () => {
  afterAll(async () => {
    await removeTestUsers();
    await getPrisma().$disconnect();
  });

  it("refuses a migrated Requester without a password, then gates them once one is issued", async () => {
    resetLoginThrottle();
    const migrated = await createTestUser({ password: null, mustChangePassword: true });

    const before = await request(app)
      .post("/api/auth/login")
      .send({ email: migrated.email, password: "Anything-Pass1!" });
    expect(before.status).toBe(401);
    expect(before.body.error.code).toBe("INVALID_CREDENTIALS");

    // Issued the way the seed script or an Administrator does it.
    await getPrisma().user.update({
      where: { id: migrated.id },
      data: { passwordHash: await hashPassword("Issued-Pass1!"), mustChangePassword: true },
    });

    const after = await request(app)
      .post("/api/auth/login")
      .send({ email: migrated.email, password: "Issued-Pass1!" });
    expect(after.status).toBe(200);
    expect(after.body.data.user.mustChangePassword).toBe(true);
  });
});
