import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { getPrisma } from "./prisma.js";
import { ticketsRouter } from "./tickets.js";
import { attachmentsRouter } from "./attachments.js";
import { authRouter } from "./auth/routes.js";
import { bcryptCost } from "./auth/credentials.js";
// getPrisma() is your lazy database handle. Call it INSIDE a route when you
// need the DB (Issue 4). It is intentionally unused until then.

// Lab 3 BR-12 — refuse to start with a weakened bcrypt cost.
bcryptCost();

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

// Lab 3 BR-17 — the session cookie only travels with credentialed requests,
// which browsers allow for one exact origin, never `*`.
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

// A malformed JSON body gets the documented envelope instead of Express's
// default HTML error page (api-spec.md §1.1).
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if ((err as { type?: string }).type === "entity.parse.failed") {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "The request body is not valid JSON.",
      },
    });
  }
  return next(err);
});

// Lab 3 — login, logout, current user, change password.
app.use(authRouter);

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
    const requesters = await getPrisma().user.findMany({
      // Inactive and soft-removed Requesters never reach the selector (AC-03).
      // Lab 3: Development Requesters now live in `User`; only the Requester
      // role belongs in this Lab 2 selector until it is removed.
      where: { role: "Requester", isActive: true, deletedAt: null },
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
app.use(attachmentsRouter);

export default app;
