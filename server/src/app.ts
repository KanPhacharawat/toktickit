import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { getPrisma } from "./prisma.js";
import { ticketsRouter } from "./tickets.js";
import { attachmentsRouter } from "./attachments.js";
import { commentsRouter } from "./comments.js";
import { queueRouter } from "./queue.js";
import { staffOperationsRouter } from "./staffOperations.js";
import { authRouter } from "./auth/routes.js";
import { bcryptCost } from "./auth/credentials.js";
import { protect } from "./auth/middleware.js";
// getPrisma() is your lazy database handle. Call it INSIDE a route when you
// need the DB (Issue 4). It is intentionally unused until then.

// Lab 3 BR-12 — refuse to start with a weakened bcrypt cost.
bcryptCost();

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

// Lab 3 BR-17 / api-spec §1.3 — the session cookie only travels with
// credentialed requests, and only this one origin is ever allowed. A custom
// origin function (rather than a static string) means a foreign Origin gets
// no Access-Control-Allow-Origin header at all, instead of a mismatched one:
// `*` is never returned either way.
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
app.use(
  cors({
    origin(origin, callback) {
      // No Origin header at all (server-to-server calls, curl, same-origin
      // requests) is not a cross-origin browser request, so it is allowed.
      if (!origin || origin === CLIENT_ORIGIN) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  }),
);
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
//
// Lab 3 — any authenticated, gated role may read reference data (matrix §5.1
// "Categories, Related Systems": Yes for every role), so `protect()` takes no
// role argument.
// ---------------------------------------------------------------------------
app.get("/api/categories", ...protect(), async (_req: Request, res: Response) => {
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
// Lab 3 FR-19 / AC-19 — the Development Requester selector and its API are
// fully removed. GET /api/development-requesters now falls through to the
// unmatched-route 404 below, exactly like any other unknown /api route.
// ---------------------------------------------------------------------------

app.use(ticketsRouter);
// Lab 3 — queueRouter's literal "/api/tickets/queue" must be registered
// before attachmentsRouter's "/api/tickets/:ticketId", or Express would try
// to treat "queue" as a ticket id and never reach this route.
app.use(queueRouter);
app.use(staffOperationsRouter);
app.use(attachmentsRouter);
app.use(commentsRouter);

// api-spec.md §1.1 — any unmatched /api route, including a removed Lab 2
// one, answers the documented envelope instead of Express's default HTML.
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Resource not found." },
  });
});

export default app;
