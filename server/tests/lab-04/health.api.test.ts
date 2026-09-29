import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// GET /api/health — docs/lab-04/tests.md A-08, api-spec.md §5, AC-37.

const prisma = getPrisma();

afterEach(() => vi.restoreAllMocks());

describe("GET /api/health", () => {
  it("returns 200 { status: ok, db: up } with a version and time when the DB is reachable", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", db: "up", version: "lab4" });
    expect(typeof res.body.time).toBe("string");
    expect(Number.isNaN(Date.parse(res.body.time))).toBe(false);
  });

  it("returns 503 { status: degraded, db: down } with no internals leaked when the DB is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma, "$queryRaw").mockRejectedValue(
      new Error(
        'Connection refused at C:\\repo\\server\\src\\prisma.ts:12 (postgresql://toktickit:secret@localhost:5432/toktickit)',
      ),
    );

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "degraded", db: "down" });

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/postgresql:/i);
    expect(serialized).not.toMatch(/\.ts:/);
    expect(serialized).not.toMatch(/secret/i);
  });

  it("requires no authentication", async () => {
    // No cookie/agent set up at all — a bare request must still succeed.
    const res = await request(app).get("/api/health");
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
