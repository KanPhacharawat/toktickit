import { Router, type Request, type Response } from "express";
import { getPrisma } from "./prisma.js";
import { protect } from "./auth/middleware.js";
import { normalizeThreadBody } from "./threadContent.js";
import { fail, internalError, resolveTicketAccess } from "./ticketAccess.js";
import { isTerminal } from "./statusTransitions.js";

// Public Comments (§10), Internal Notes (§11), and "Problem Appears
// Resolved" (§12).

export const commentsRouter = Router();

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
// GET /api/tickets/:ticketId/public-comments (§10.1). Requester (own), IT
// Staff, Administrator (any).
// ---------------------------------------------------------------------------
commentsRouter.get(
  "/api/tickets/:ticketId/public-comments",
  ...protect("Requester", "ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      const comments = await getPrisma().publicComment.findMany({
        where: { ticketId: access.ticketId },
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
// POST /api/tickets/:ticketId/public-comments (§10.2). Requester (own), IT
// Staff, Administrator (any); not on a terminal Ticket.
// ---------------------------------------------------------------------------
commentsRouter.post(
  "/api/tickets/:ticketId/public-comments",
  ...protect("Requester", "ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      // BR-41 — no new Public Comments on a terminal Ticket.
      if (isTerminal(access.currentStatus)) {
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
        data: { ticketId: access.ticketId, authorId: req.auth!.user.id, body },
        include: { author: { select: { id: true, name: true, role: true } } },
      });

      // BR-47 — a Public Comment updates the Ticket's activity timestamp.
      const ticket = await getPrisma().ticket.update({
        where: { id: access.ticketId },
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

// ---------------------------------------------------------------------------
// GET /api/tickets/:ticketId/internal-notes (§11.1). IT Staff, Administrator
// only — a Requester gets 403 for any ticketId, before any lookup (BR-09).
// ---------------------------------------------------------------------------
commentsRouter.get(
  "/api/tickets/:ticketId/internal-notes",
  ...protect("ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      const notes = await getPrisma().internalNote.findMany({
        where: { ticketId: access.ticketId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { author: { select: { id: true, name: true, role: true } } },
      });

      return res.status(200).json({ data: notes.map(toThreadEntry) });
    } catch (err) {
      console.error("GET internal notes failed:", err);
      return internalError(res, "Could not load notes. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/tickets/:ticketId/internal-notes (§11.2). IT Staff,
// Administrator only. Allowed on every status, including Closed and
// Cancelled (BR-44), and never updates the Ticket's updatedAt (BR-47).
// ---------------------------------------------------------------------------
commentsRouter.post(
  "/api/tickets/:ticketId/internal-notes",
  ...protect("ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      const { body, error } = normalizeThreadBody(
        (req.body as { body?: unknown } | undefined)?.body,
        "Note",
      );
      if (!body) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fieldErrors: { body: error },
        });
      }

      const note = await getPrisma().internalNote.create({
        data: { ticketId: access.ticketId, authorId: req.auth!.user.id, body },
        include: { author: { select: { id: true, name: true, role: true } } },
      });

      return res.status(201).json({ data: toThreadEntry(note) });
    } catch (err) {
      console.error("POST internal note failed:", err);
      return internalError(res, "Could not post the note. Please try again.");
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
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      if (isTerminal(access.currentStatus)) {
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
        where: { id: access.ticketId },
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
          data: { ticketId: access.ticketId, authorId: req.auth!.user.id, body },
          include: { author: { select: { id: true, name: true, role: true } } },
        });
        const updatedTicket = await tx.ticket.update({
          where: { id: access.ticketId },
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
