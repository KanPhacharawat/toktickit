import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// Integration test: needs the database migrated and seeded first.
//   npx prisma migrate dev
//   npm run prisma:seed
const EXPECTED_NAMES = [
  "Account and Access",
  "Hardware",
  "Software",
  "Network",
];

describe("GET /api/categories", () => {
  // Prisma keeps a connection pool open, which stops Node from exiting.
  afterAll(async () => {
    await getPrisma().$disconnect();
  });

  it("returns the four seeded categories in id order", async () => {
    const res = await request(app).get("/api/categories");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(EXPECTED_NAMES.length);

    // Predictable order.
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(
      EXPECTED_NAMES,
    );

    const ids = res.body.map((c: { id: number }) => c.id);
    expect([...ids].sort((a: number, b: number) => a - b)).toEqual(ids);

    // Exactly { id, name } — toEqual fails if createdAt leaks through.
    expect(res.body[0]).toEqual({
      id: expect.any(Number),
      name: "Account and Access",
    });
  });
});
