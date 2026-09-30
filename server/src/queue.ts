import { Router, type Request, type Response } from "express";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { protect } from "./auth/middleware.js";
import {
  ACTIVE_STATUSES,
  buildQueueOrderBy,
  parseQueueQuery,
} from "./queueQuery.js";

export const queueRouter = Router();

function validationError(res: Response, fieldErrors: Record<string, string>) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "The request contains invalid data.",
      fieldErrors,
    },
  });
}

function internalError(res: Response, message: string) {
  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message } });
}

// ---------------------------------------------------------------------------
// GET /api/tickets/queue — the IT Staff Ticket Queue (api-spec.md §7.1).
//
// Lab 3 — IT Staff and Administrator only (matrix §5.1 "Ticket Queue").
// ---------------------------------------------------------------------------
queueRouter.get(
  "/api/tickets/queue",
  ...protect("ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    const { query, fieldErrors } = parseQueueQuery(req.query as Record<string, unknown>);
    if (!query) return validationError(res, fieldErrors);

    const callerId = req.auth!.user.id;
    const prisma = getPrisma();

    try {
      // BR-29 — filters combine with AND.
      const where: Prisma.TicketWhereInput = {
        deletedAt: null,
        ...(query.statusGroup === "active" ? { currentStatus: { in: ACTIVE_STATUSES } } : {}),
        ...(query.statusGroup === "closed" ? { currentStatus: { in: ["Closed", "Cancelled"] } } : {}),
        ...(query.currentStatus !== null ? { currentStatus: query.currentStatus } : {}),
        ...(query.ownership === "mine" ? { ticketOwnerId: callerId } : {}),
        ...(query.ownership === "unassigned" ? { ticketOwnerId: null } : {}),
        ...(query.itPriority !== null ? { itPriority: query.itPriority } : {}),
        ...(query.requestedPriority !== null
          ? { requestedPriority: query.requestedPriority }
          : {}),
        ...(query.categoryId !== null ? { categoryId: query.categoryId } : {}),
        // BR-28 — search matches Ticket Number, Summary, Requester name, or
        // Requester email, case-insensitive.
        ...(query.search
          ? {
              OR: [
                { ticketNumber: { contains: query.search, mode: "insensitive" as const } },
                { summary: { contains: query.search, mode: "insensitive" as const } },
                {
                  requester: {
                    name: { contains: query.search, mode: "insensitive" as const },
                  },
                },
                {
                  requester: {
                    email: { contains: query.search, mode: "insensitive" as const },
                  },
                },
              ],
            }
          : {}),
      };

      const [totalItems, tickets, counts] = await Promise.all([
        prisma.ticket.count({ where }),
        prisma.ticket.findMany({
          where,
          orderBy: buildQueueOrderBy(query.sortBy, query.sortOrder),
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: {
            id: true,
            ticketNumber: true,
            ticketDate: true,
            summary: true,
            requestedPriority: true,
            itPriority: true,
            currentStatus: true,
            problemAppearsResolvedAt: true,
            updatedAt: true,
            category: { select: { id: true, name: true } },
            requester: { select: { id: true, name: true, email: true } },
            ticketOwner: { select: { id: true, name: true, role: true } },
          },
        }),
        // BR-32 — counts ignore search and filters.
        prisma.$transaction([
          prisma.ticket.count({
            where: { deletedAt: null, currentStatus: { in: ACTIVE_STATUSES } },
          }),
          prisma.ticket.count({
            where: {
              deletedAt: null,
              currentStatus: { in: ACTIVE_STATUSES },
              ticketOwnerId: null,
            },
          }),
          prisma.ticket.count({
            where: {
              deletedAt: null,
              currentStatus: { in: ACTIVE_STATUSES },
              ticketOwnerId: callerId,
            },
          }),
        ]),
      ]);

      const [active, unassigned, assignedToMe] = counts;

      return res.status(200).json({
        data: tickets.map((ticket) => ({
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          ticketDate: ticket.ticketDate,
          summary: ticket.summary,
          category: ticket.category,
          requester: ticket.requester,
          requestedPriority: ticket.requestedPriority,
          itPriority: ticket.itPriority,
          currentStatus: ticket.currentStatus,
          ticketOwner: ticket.ticketOwner,
          problemAppearsResolvedAt: ticket.problemAppearsResolvedAt,
          updatedAt: ticket.updatedAt,
        })),
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / query.pageSize),
          counts: { active, unassigned, assignedToMe },
        },
      });
    } catch (err) {
      console.error("GET /api/tickets/queue failed:", err);
      return internalError(res, "Could not load the queue. Please try again.");
    }
  },
);

export default queueRouter;
