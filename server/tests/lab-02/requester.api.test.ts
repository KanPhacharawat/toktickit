import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// API-01 — integration test: needs the database migrated and seeded first.
//   npx prisma migrate dev
//   npm run prisma:seed
describe("GET /api/development-requesters", () => {
  afterAll(async () => {
    await getPrisma().$disconnect();
  });

  it("returns active requesters in the documented envelope", async () => {
    const res = await request(app).get("/api/development-requesters");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // The seed provides at least four active requesters.
    expect(res.body.data.length).toBeGreaterThanOrEqual(4);

    expect(res.body.data[0]).toMatchObject({
      id: expect.any(Number),
      name: expect.any(String),
      email: expect.any(String),
    });
  });

  it("excludes inactive requesters (AC-03)", async () => {
    const prisma = getPrisma();

    const inactive = await prisma.developmentRequester.findMany({
      where: { isActive: false },
      select: { id: true },
    });
    // The seed includes an inactive requester so this assertion is meaningful.
    expect(inactive.length).toBeGreaterThan(0);

    const res = await request(app).get("/api/development-requesters");
    const returnedIds = res.body.data.map((r: { id: number }) => r.id);

    for (const { id } of inactive) {
      expect(returnedIds).not.toContain(id);
    }
  });

  it("returns every active requester and nothing else", async () => {
    const activeIds = (
      await getPrisma().developmentRequester.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true },
        orderBy: { id: "asc" },
      })
    ).map((r) => r.id);

    const res = await request(app).get("/api/development-requesters");

    expect(res.body.data.map((r: { id: number }) => r.id)).toEqual(activeIds);
  });

  it("does not leak internal fields", async () => {
    const res = await request(app).get("/api/development-requesters");

    // Only the documented display fields are exposed.
    expect(Object.keys(res.body.data[0]).sort()).toEqual([
      "department",
      "email",
      "id",
      "name",
    ]);
  });
});
