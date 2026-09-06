import express, { Request, Response } from "express";
import cors from "cors";
import { getPrisma } from "./prisma.js";
import { ticketsRouter } from "./tickets.js";
// getPrisma() is your lazy database handle. Call it INSIDE a route when you
// need the DB (Issue 4). It is intentionally unused until then.

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors()); // already wired: lets the Vite dev server call this API
app.use(express.json());

// ---------------------------------------------------------------------------
// Issue 2 — API health check
// Make the test in tests/lab-01/health.test.ts pass.
// It must return HTTP 200 with JSON: { status: "ok", service: "TokTickIT API" }
// ---------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  // TODO(Issue 2): replace this stub with the required 200 response.
  res.status(200).json({
    status: "ok",
    service: "TokTickIT API",
  });
});

// ---------------------------------------------------------------------------
// Issue 4 — Category list
// Add:  GET /api/categories
//   -> read categories from PostgreSQL via getPrisma().category.findMany(...)
//   -> return each { id, name } in a predictable (id) order
//   -> on failure, respond 500 with a safe message (no internal details)
// TODO(Issue 4): implement the route here.
// ---------------------------------------------------------------------------
app.get("/api/categories", async (_req: Request, res: Response) => {
  try {
    const categories = await getPrisma().category.findMany({
      // FR-30 — only active Categories are selectable on Create Ticket.
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    res.status(200).json(categories);
  } catch (err) {
    console.error("GET /api/categories failed:", err);
    res.status(500).json({
      error: "Failed to load categories",
    });
  }
});

// ---------------------------------------------------------------------------
// Lab 2 — Development Requester selection
// GET /api/development-requesters
//   -> FR-32/BR-05: active Development Requesters only.
//   -> The selected Requester is the Lab 2 testing identity (BR-04). It is
//      NOT authentication; Lab 3 replaces it with a real signed-in user.
// ---------------------------------------------------------------------------
app.get("/api/development-requesters", async (_req: Request, res: Response) => {
  try {
    const requesters = await getPrisma().developmentRequester.findMany({
      // Inactive and soft-removed Requesters never reach the selector (AC-03).
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, email: true, department: true },
      orderBy: { id: "asc" },
    });
    res.status(200).json({ data: requesters });
  } catch (err) {
    console.error("GET /api/development-requesters failed:", err);
    // BR-39 — safe message only, no internal details.
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to load development requesters.",
      },
    });
  }
});

// Lab 2 — Create Ticket and its reference data.
app.use(ticketsRouter);

export default app;
