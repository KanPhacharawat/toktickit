import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

// Superseded by the Lab 4 contract (docs/lab-04/api-spec.md §5, AC-37):
// { status, service } became { status, db, version, time }, plus a 503 path
// when the DB is unreachable. Full coverage lives in
// server/tests/lab-04/health.api.test.ts; this keeps the original basic
// sanity check green against the new shape.
describe("GET /api/health", () => {
  it("returns 200 with status ok and db up", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", db: "up" });
  });
});
