import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// M-01 (tests.md §5) — `prisma migrate deploy` of the Lab 4 migration against
// a Lab 3-shaped database with existing data (AC-39).
//
// Mirrors lab-03/migration.test.ts: a disposable database
// (MIGRATION_TEST_DATABASE_URL) replays every migration up to and including
// Lab 3, inserts fixture rows that represent a real Lab 3 database, applies
// the Lab 4 migration on top, and checks nothing existing was lost.

const SERVER_DIR = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS_DIR = path.join(SERVER_DIR, "prisma", "migrations");
const LAB4_MIGRATION = "20261001100000_lab4_actions_taken_workflow";

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

async function resetScratchDatabase() {
  await scratch.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
  await scratch.$executeRawUnsafe(`CREATE SCHEMA public`);
}

async function query<T>(sql: string): Promise<T[]> {
  return scratch.$queryRawUnsafe<T[]>(sql);
}

describe("M-01 — Lab 4 migration on a Lab 3 database (AC-39)", () => {
  beforeAll(async () => {
    migrationUrl = await envValue("MIGRATION_TEST_DATABASE_URL");
    const mainUrl = await envValue("DATABASE_URL");
    if (
      new URL(migrationUrl).host === new URL(mainUrl).host &&
      new URL(migrationUrl).pathname === new URL(mainUrl).pathname
    ) {
      throw new Error("MIGRATION_TEST_DATABASE_URL must not be the application database.");
    }

    scratch = new PrismaClient({ datasourceUrl: migrationUrl });
    await resetScratchDatabase();

    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "toktickit-lab4-migration-"));
    await fs.copyFile(
      path.join(SERVER_DIR, "prisma", "schema.prisma"),
      path.join(workDir, "schema.prisma"),
    );
    await fs.mkdir(path.join(workDir, "migrations"));
    await fs.copyFile(
      path.join(MIGRATIONS_DIR, "migration_lock.toml"),
      path.join(workDir, "migrations", "migration_lock.toml"),
    );

    // Every migration up to and including Lab 3 — i.e. everything except the
    // Lab 4 migration under test.
    const preLab4 = (await fs.readdir(MIGRATIONS_DIR)).filter(
      (name) => name !== LAB4_MIGRATION && name !== "migration_lock.toml",
    );
    for (const name of preLab4) await copyMigration(name);
    await migrateDeploy();

    // A Lab 3-shaped database: Users (one Requester, one IT Staff Owner),
    // Tickets in both a legacy-open and a legacy-resolved/closed state,
    // an Attachment, a PublicComment, and an InternalNote.
    const fixtures = [
      `INSERT INTO "Category" (id, name) VALUES (1, 'Hardware')`,
      `INSERT INTO "RelatedSystem" (id, name) VALUES (1, 'VPN')`,
      `INSERT INTO "User" (id, name, email, role, "isActive", "mustChangePassword", "updatedAt") VALUES
         (1, 'Lab3 Requester', 'lab3.requester@example.com', 'Requester', true, false, now()),
         (2, 'Lab3 Staff', 'lab3.staff@example.com', 'ITStaff', true, false, now())`,
      `SELECT setval('"User_id_seq"', 2)`,
      `INSERT INTO "Ticket" (id, "ticketNumber", "requesterId", "categoryId", "relatedSystemId",
                             summary, description, "requestedPriority", "itPriority", "currentStatus",
                             "ticketOwnerId", "updatedAt")
         VALUES
           (100, 'TT-20260901-0001', 1, 1, 1, 'VPN drops', 'The VPN drops every hour.', 'HIGH', 'HIGH', 'InProgress', 2, now()),
           (101, 'TT-20260901-0002', 1, 1, 1, 'Old ticket already closed', 'This was resolved before Lab 4.', 'LOW', 'LOW', 'Closed', 2, now())`,
      `SELECT setval('"Ticket_id_seq"', 101)`,
      `INSERT INTO "Attachment" (id, "ticketId", "originalFilename", "storageKey", "mimeType", "fileSize")
         VALUES (200, 100, 'screen.png', 'key-200.png', 'image/png', 1234)`,
      `INSERT INTO "PublicComment" (id, "ticketId", "authorId", body) VALUES (300, 100, 1, 'Any update?')`,
      `INSERT INTO "InternalNote" (id, "ticketId", "authorId", body) VALUES (400, 100, 2, 'Escalated to network team.')`,
    ];
    for (const sql of fixtures) await scratch.$queryRawUnsafe(sql);

    await copyMigration(LAB4_MIGRATION);
    await migrateDeploy();
  }, 180_000);

  afterAll(async () => {
    if (scratch) {
      await resetScratchDatabase().catch(() => undefined);
      await scratch.$disconnect();
    }
    if (workDir) await fs.rm(workDir, { recursive: true, force: true });
  });

  it("preserves every existing User, Ticket, Attachment, PublicComment, and InternalNote row", async () => {
    const [users] = await query<{ n: bigint }>(`SELECT count(*)::bigint AS n FROM "User"`);
    const [tickets] = await query<{ n: bigint }>(`SELECT count(*)::bigint AS n FROM "Ticket"`);
    const [attachments] = await query<{ n: bigint }>(`SELECT count(*)::bigint AS n FROM "Attachment"`);
    const [comments] = await query<{ n: bigint }>(`SELECT count(*)::bigint AS n FROM "PublicComment"`);
    const [notes] = await query<{ n: bigint }>(`SELECT count(*)::bigint AS n FROM "InternalNote"`);

    expect(Number(users.n)).toBe(2);
    expect(Number(tickets.n)).toBe(2);
    expect(Number(attachments.n)).toBe(1);
    expect(Number(comments.n)).toBe(1);
    expect(Number(notes.n)).toBe(1);
  });

  it("keeps the original Ticket content untouched", async () => {
    const rows = await query<{ ticketNumber: string; summary: string; currentStatus: string }>(
      `SELECT "ticketNumber", summary, "currentStatus"::text AS "currentStatus" FROM "Ticket" ORDER BY id`,
    );
    expect(rows).toEqual([
      { ticketNumber: "TT-20260901-0001", summary: "VPN drops", currentStatus: "InProgress" },
      { ticketNumber: "TT-20260901-0002", summary: "Old ticket already closed", currentStatus: "Closed" },
    ]);
  });

  it("adds the new Ticket columns as nullable or defaulted, so no existing row is invalidated", async () => {
    const rows = await query<{
      id: number;
      version: number;
      resolvedAt: Date | null;
      closedAt: Date | null;
      resolutionSummary: string | null;
    }>(`SELECT id, version, "resolvedAt", "closedAt", "resolutionSummary" FROM "Ticket" ORDER BY id`);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.version).toBe(1);
  });

  it("backfills resolvedAt/closedAt/resolutionSummary only for legacy Resolved/Closed Tickets", async () => {
    const [inProgress] = await query<{ resolvedAt: Date | null; closedAt: Date | null }>(
      `SELECT "resolvedAt", "closedAt" FROM "Ticket" WHERE id = 100`,
    );
    expect(inProgress.resolvedAt).toBeNull();
    expect(inProgress.closedAt).toBeNull();

    const [closed] = await query<{
      resolvedAt: Date | null;
      closedAt: Date | null;
      resolutionSummary: string | null;
    }>(`SELECT "resolvedAt", "closedAt", "resolutionSummary" FROM "Ticket" WHERE id = 101`);
    expect(closed.resolvedAt).not.toBeNull();
    expect(closed.closedAt).not.toBeNull();
    expect(closed.resolutionSummary).toBe("Legacy ticket resolved before Lab 4");
  });

  it("inserts one initial TicketStatusHistory row per existing Ticket", async () => {
    const rows = await query<{
      ticketId: number;
      fromStatus: string | null;
      toStatus: string;
      actorId: number;
      reason: string;
    }>(
      `SELECT "ticketId", "fromStatus"::text AS "fromStatus", "toStatus"::text AS "toStatus", "actorId", reason
       FROM "TicketStatusHistory" ORDER BY "ticketId"`,
    );
    expect(rows).toEqual([
      { ticketId: 100, fromStatus: null, toStatus: "InProgress", actorId: 1, reason: "Backfill Lab 4" },
      { ticketId: 101, fromStatus: null, toStatus: "Closed", actorId: 1, reason: "Backfill Lab 4" },
    ]);
  });

  it("creates the ActionTaken table with its idempotency and ordering constraints", async () => {
    const [unique] = await query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE indexname = 'ActionTaken_ticketId_clientRequestId_key'`,
    );
    expect(unique).toBeDefined();

    const inserted = await scratch.actionTaken.create({
      data: {
        ticketId: 100,
        actionAt: new Date(),
        description: "Fixture action for the migration test.",
        status: "Completed",
        result: "Fixed.",
        performedById: 2,
        createdById: 2,
        clientRequestId: "migration-test-action-1",
      },
    });
    expect(inserted.version).toBe(1);

    await expect(
      scratch.actionTaken.create({
        data: {
          ticketId: 100,
          actionAt: new Date(),
          description: "Duplicate client request id.",
          status: "Completed",
          result: "Also fixed.",
          performedById: 2,
          createdById: 2,
          clientRequestId: "migration-test-action-1",
        },
      }),
    ).rejects.toThrow();
  });

  it("has no drift left after applying the Lab 4 migration", async () => {
    const status = execSync(
      `npx prisma migrate status --schema "${path.join(workDir, "schema.prisma")}"`,
      { cwd: SERVER_DIR, env: { ...process.env, DATABASE_URL: migrationUrl } },
    ).toString();
    expect(status).toMatch(/up to date/i);
  });
});
