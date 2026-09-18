import { Router, type Request, type Response } from "express";
import { getPrisma } from "./prisma.js";
import { protect } from "./auth/middleware.js";
import { normalizeThreadBody } from "./threadContent.js";
import { requireOwnedTicket, TERMINAL_STATUSES } from "./attachments.js";

// Public Comments and "Problem Appears Resolved" for Requesters
// (api-spec.md §10, §12). Internal Notes and the staff-facing thread routes
// arrive with the IT Staff Ticket Operations issue.

export const commentsRouter = Router();

function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return res.status(status).json({ error: { code, message, ...extra } });
}

function internalError(res: Response, message: string) {
  return fail(res, 500, "INTERNAL_ERROR", message);
}

/** api-spec.md §3.3 — the ThreadEntry shape shared by comments and notes. */
function toThreadEntry(entry: {
  id: number;
  body: string;
  createdAt: Date;
  author: { id: number; name: string; role: string };
}) {
  return {
    id: entry.id,
    body: entry.body,
    author: entry.author,
    createdAt: entry.createdAt,
  };
}

// ---------------------------------------------------------------------------
// GET /api/tickets/:ticketId/public-comments (§10.1). Requester (own) only
// for now; IT Staff and Administrators are added with their own issue.
// ---------------------------------------------------------------------------
commentsRouter.get(
  "/api/tickets/:ticketId/public-comments",
  ...protect("Requester"),
  async (req: Request, res: Response) => {
    try {
      const owned = await requireOwnedTicket(req, res);
      if (!owned.ok) return;

      const comments = await getPrisma().publicComment.findMany({
        where: { ticketId: owned.ticketId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { author: { select: { id: true, name: true, role: true } } },
      });

      return res.status(200).json({ data: comments.map(toThreadEntry) });
    } catch (err) {
      console.error("GET public comments failed:", err);
      return internalError(res, "Could not load comments. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/tickets/:ticketId/public-comments (§10.2). Requester (own).
// ---------------------------------------------------------------------------
commentsRouter.post(
  "/api/tickets/:ticketId/public-comments",
  ...protect("Requester"),
  async (req: Request, res: Response) => {
    try {
      const owned = await requireOwnedTicket(req, res);
      if (!owned.ok) return;

      // BR-41 — no new Public Comments on a terminal Ticket.
      if (TERMINAL_STATUSES.has(owned.currentStatus)) {
        return fail(
          res,
          409,
          "TICKET_CLOSED",
          "This ticket is closed and cannot accept new comments.",
        );
      }

      const { body, error } = normalizeThreadBody(
        (req.body as { body?: unknown } | undefined)?.body,
        "Comment",
      );
      if (!body) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fieldErrors: { body: error },
        });
      }

      const comment = await getPrisma().publicComment.create({
        data: { ticketId: owned.ticketId, authorId: req.auth!.user.id, body },
        include: { author: { select: { id: true, name: true, role: true } } },
      });

      // BR-47 — a Public Comment updates the Ticket's activity timestamp.
      const ticket = await getPrisma().ticket.update({
        where: { id: owned.ticketId },
        data: { updatedAt: new Date() },
        select: { updatedAt: true },
      });

      return res.status(201).json({
        data: toThreadEntry(comment),
        meta: { ticketUpdatedAt: ticket.updatedAt },
      });
    } catch (err) {
      console.error("POST public comment failed:", err);
      return internalError(res, "Could not post the comment. Please try again.");
    }
  },
);

/** BR-48 — statuses from which "Problem Appears Resolved" may be reported. */
const RESOLUTION_ELIGIBLE_STATUSES = new Set([
  "New",
  "Open",
  "InProgress",
  "WaitingForRequester",
  "Reopened",
]);

// ---------------------------------------------------------------------------
// POST /api/tickets/:ticketId/problem-resolved (§12.1). Requester (own).
// ---------------------------------------------------------------------------
commentsRouter.post(
  "/api/tickets/:ticketId/problem-resolved",
  ...protect("Requester"),
  async (req: Request, res: Response) => {
    try {
      const owned = await requireOwnedTicket(req, res);
      if (!owned.ok) return;

      if (TERMINAL_STATUSES.has(owned.currentStatus)) {
        return fail(
          res,
          409,
          "TICKET_CLOSED",
          "This ticket is closed and cannot report a resolution.",
        );
      }

      const rawNote = (req.body as { note?: unknown } | undefined)?.note;
      let note = "";
      if (rawNote !== undefined && rawNote !== null && rawNote !== "") {
        if (typeof rawNote !== "string") {
          return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
            fieldErrors: { note: "Note must be text." },
          });
        }
        const normalized = normalizeThreadBody(rawNote, "Note");
        if (!normalized.body) {
          return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
            fieldErrors: { note: normalized.error },
          });
        }
        note = normalized.body;
      }

      const prisma = getPrisma();

      const current = await prisma.ticket.findUniqueOrThrow({
        where: { id: owned.ticketId },
        select: { currentStatus: true, problemAppearsResolvedAt: true },
      });

      if (current.currentStatus === "Resolved") {
        return fail(
          res,
          409,
          "ACTION_NOT_ALLOWED_FOR_STATUS",
          "This ticket is already resolved.",
        );
      }
      if (!RESOLUTION_ELIGIBLE_STATUSES.has(current.currentStatus)) {
        return fail(
          res,
          409,
          "ACTION_NOT_ALLOWED_FOR_STATUS",
          "This ticket cannot report a resolution right now.",
        );
      }
      if (current.problemAppearsResolvedAt !== null) {
        return fail(
          res,
          409,
          "ALREADY_REPORTED_RESOLVED",
          "The problem has already been reported as resolved.",
        );
      }

      const body = note
        ? `Problem appears resolved.\n\n${note}`
        : "Problem appears resolved.";

      const [comment, ticket] = await prisma.$transaction(async (tx) => {
        const createdComment = await tx.publicComment.create({
          data: { ticketId: owned.ticketId, authorId: req.auth!.user.id, body },
          include: { author: { select: { id: true, name: true, role: true } } },
        });
        const updatedTicket = await tx.ticket.update({
          where: { id: owned.ticketId },
          data: { problemAppearsResolvedAt: new Date() },
          select: { problemAppearsResolvedAt: true, currentStatus: true, updatedAt: true },
        });
        return [createdComment, updatedTicket];
      });

      return res.status(200).json({
        data: {
          problemAppearsResolvedAt: ticket.problemAppearsResolvedAt,
          currentStatus: ticket.currentStatus,
          publicComment: toThreadEntry(comment),
        },
        meta: { ticketUpdatedAt: ticket.updatedAt },
      });
    } catch (err) {
      console.error("POST problem-resolved failed:", err);
      return internalError(res, "Could not send the report. Please try again.");
    }
  },
);

export default commentsRouter;
