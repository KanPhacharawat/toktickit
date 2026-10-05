import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// M-03 (tests.md §5) — rollback.sql on a scratch database: migrate → seed →
// rollback → migrate again (DoD §10 "rollback tested on a scratch database").
//
// Uses its own disposable database (MIGRATION_TEST_DATABASE_URL), same as
// migration.test.ts, so this never touches real data.

const SERVER_DIR = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS_DIR = path.join(SERVER_DIR, "prisma", "migrations");
const LAB4_MIGRATION = "20261001100000_lab4_actions_taken_workflow";
const ROLLBACK_SQL = path.join(MIGRATIONS_DIR, LAB4_MIGRATION, "rollback.sql");

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

async function resetScratchDatabase() {
  await scratch.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
  await scratch.$executeRawUnsafe(`CREATE SCHEMA public`);
}

async function query<T>(sql: string): Promise<T[]> {
  return scratch.$queryRawUnsafe<T[]>(sql);
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${name}'`,
  );
  return rows.length > 0;
}

describe("M-03 — rollback.sql on a scratch database", () => {
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

    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "toktickit-lab4-rollback-"));
    await fs.copyFile(
      path.join(SERVER_DIR, "prisma", "schema.prisma"),
      path.join(workDir, "schema.prisma"),
    );
    await fs.mkdir(path.join(workDir, "migrations"));
    await fs.copyFile(
      path.join(MIGRATIONS_DIR, "migration_lock.toml"),
      path.join(workDir, "migrations", "migration_lock.toml"),
    );
    const all = (await fs.readdir(MIGRATIONS_DIR)).filter((name) => name !== "migration_lock.toml");
    for (const name of all) {
      await fs.cp(path.join(MIGRATIONS_DIR, name), path.join(workDir, "migrations", name), {
        recursive: true,
      });
    }
  }, 60_000);

  afterAll(async () => {
    if (scratch) {
      await resetScratchDatabase().catch(() => undefined);
      await scratch.$disconnect();
    }
    if (workDir) await fs.rm(workDir, { recursive: true, force: true });
  });

  it("migrates, seeds, rolls back, and migrates again cleanly", async () => {
    // 1. migrate — full history, including the Lab 4 migration.
    await migrateDeploy();
    expect(await tableExists("ActionTaken")).toBe(true);
    expect(await tableExists("TicketStatusHistory")).toBe(true);

    // 2. seed — a minimal fixture standing in for `npm run prisma:seed`.
    await scratch.category.create({ data: { id: 1, name: "Hardware" } });
    await scratch.relatedSystem.create({ data: { id: 1, name: "VPN" } });
    const user = await scratch.user.create({
      data: { name: "Rollback Tester", email: "rollback@example.com", role: "ITStaff" },
    });
    const ticket = await scratch.ticket.create({
      data: {
        ticketNumber: "TT-20261001-0001",
        requesterId: user.id,
        categoryId: 1,
        relatedSystemId: 1,
        summary: "Rollback fixture ticket",
        description: "Created only to prove rollback preserves Lab 1-3 tables.",
        requestedPriority: "LOW",
        itPriority: "LOW",
      },
    });
    await scratch.actionTaken.create({
      data: {
        ticketId: ticket.id,
        actionAt: new Date(),
        description: "Fixture action.",
        performedById: user.id,
        createdById: user.id,
      },
    });

    // 3. rollback — run rollback.sql by hand, the same way an operator would
    // (with psql). Prisma's driver cannot execute a multi-statement script in
    // one call, so split it into individual statements, still inside one
    // transaction, exactly as the file's own BEGIN/COMMIT intends.
    const rollbackSql = await fs.readFile(ROLLBACK_SQL, "utf8");
    const statements = rollbackSql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !/^(BEGIN|COMMIT)$/i.test(s));

    await scratch.$transaction(statements.map((sql) => scratch.$executeRawUnsafe(sql)));

    expect(await tableExists("ActionTaken")).toBe(false);
    expect(await tableExists("TicketStatusHistory")).toBe(false);
    // Lab 1-3 tables and their rows survive the rollback untouched.
    expect(await tableExists("Ticket")).toBe(true);
    expect(await tableExists("User")).toBe(true);
    const [{ n: ticketsAfterRollback }] = await query<{ n: bigint }>(
      `SELECT count(*)::bigint AS n FROM "Ticket"`,
    );
    expect(Number(ticketsAfterRollback)).toBe(1);

    // Tell Prisma's migration history the Lab 4 migration is no longer
    // applied, so `migrate deploy` will re-run it instead of skipping it.
    // `prisma migrate resolve --rolled-back` only accepts a migration that
    // Prisma itself marked as failed; here the migration succeeded and was
    // rolled back by hand afterwards, so the equivalent step is removing its
    // own row from the migration history table, exactly as the tool does
    // internally for a `--rolled-back` resolution.
    await scratch.$executeRawUnsafe(
      `DELETE FROM "_prisma_migrations" WHERE migration_name = '${LAB4_MIGRATION}'`,
    );

    // 4. migrate again — re-applies cleanly, existing rows untouched.
    await migrateDeploy();
    scratch = new PrismaClient({ datasourceUrl: migrationUrl });
    expect(await tableExists("ActionTaken")).toBe(true);
    expect(await tableExists("TicketStatusHistory")).toBe(true);
    const [{ n: ticketsAfterRemigrate }] = await query<{ n: bigint }>(
      `SELECT count(*)::bigint AS n FROM "Ticket"`,
    );
    expect(Number(ticketsAfterRemigrate)).toBe(1);
  }, 180_000);
});
