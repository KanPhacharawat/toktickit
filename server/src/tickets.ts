import { Router, type Request, type Response } from "express";
import { getPrisma } from "./prisma.js";
import { validateCreateTicketBody } from "./ticketValidation.js";
import {
  formatTicketNumber,
  nextSequence,
  ticketNumberPrefixFor,
} from "./ticketNumber.js";
import { buildOrderBy, parseTicketListQuery } from "./ticketListQuery.js";

export const ticketsRouter = Router();

/**
 * BR-18 — server-side duplicate protection. The UI disables Submit while a
 * request is in flight, but a double-submit can still reach the API (retry,
 * refresh, two tabs). An identical Ticket from the same Requester inside this
 * window is treated as the same user action.
 */
const DUPLICATE_WINDOW_MS = 10_000;

/** Ticket Number generation races against concurrent creates; retry briefly. */
const TICKET_NUMBER_ATTEMPTS = 5;

/** Prisma's unique-constraint violation. */
const UNIQUE_VIOLATION = "P2002";

/**
 * Folds a submission fingerprint into the 32-bit integer that
 * pg_advisory_xact_lock takes. Collisions are harmless: they only make two
 * unrelated submissions wait for each other briefly.
 */
function advisoryLockKey(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
  }
  return hash;
}

function validationError(
  res: Response,
  fieldErrors: Record<string, string>,
  message = "The request contains invalid data.",
) {
  return res.status(400).json({
    error: { code: "VALIDATION_ERROR", message, fieldErrors },
  });
}

/** BR-39 — safe message only; never a stack trace, SQL, or a filesystem path. */
function internalError(res: Response, message: string) {
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message },
  });
}

/**
 * Shared handler for the My Tickets list (api-spec.md §7).
 *
 * BR-08 — the Requester id is the only ownership key: every query is scoped to
 * it, so a Requester can never see another Requester's Tickets.
 */
async function handleTicketList(
  requesterIdRaw: string | undefined,
  rawQuery: Record<string, unknown>,
  res: Response,
) {
  if (
    requesterIdRaw === undefined ||
    !/^\d+$/.test(requesterIdRaw) ||
    Number(requesterIdRaw) <= 0
  ) {
    return validationError(res, {
      requesterId: "A valid requester is required.",
    });
  }
  const requesterId = Number.parseInt(requesterIdRaw, 10);

  const { query, fieldErrors } = parseTicketListQuery(rawQuery);
  if (!query) return validationError(res, fieldErrors);

  try {
    const where = {
      requesterId,
      deletedAt: null,
      // BR-22 — filters are additive and all optional.
      ...(query.categoryId !== null ? { categoryId: query.categoryId } : {}),
      ...(query.requestedPriority !== null
        ? { requestedPriority: query.requestedPriority }
        : {}),
      ...(query.currentStatus !== null
        ? { currentStatus: query.currentStatus }
        : {}),
      // BR-21 — search matches Ticket Number or Summary, within the owner scope.
      ...(query.search
        ? {
            OR: [
              {
                ticketNumber: {
                  contains: query.search,
                  mode: "insensitive" as const,
                },
              },
              {
                summary: {
                  contains: query.search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [totalItems, tickets] = await Promise.all([
      getPrisma().ticket.count({ where }),
      getPrisma().ticket.findMany({
        where,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          ticketNumber: true,
          summary: true,
          requestedPriority: true,
          currentStatus: true,
          updatedAt: true,
          category: { select: { name: true } },
        },
      }),
    ]);

    return res.status(200).json({
      data: tickets.map((ticket) => ({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        summary: ticket.summary,
        category: ticket.category.name,
        requestedPriority: ticket.requestedPriority,
        currentStatus: ticket.currentStatus,
        updatedAt: ticket.updatedAt,
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    });
  } catch (err) {
    console.error("GET ticket list failed:", err);
    return internalError(res, "Could not load tickets. Please try again.");
  }
}

// ---------------------------------------------------------------------------
// GET /api/requesters/:requesterId/tickets — the documented My Tickets list.
// ---------------------------------------------------------------------------
ticketsRouter.get(
  "/api/requesters/:requesterId/tickets",
  async (req: Request, res: Response) =>
    handleTicketList(req.params.requesterId, req.query, res),
);

// ---------------------------------------------------------------------------
// GET /api/tickets?requesterId=... — same list, requester supplied as a query
// parameter. Ownership is still mandatory: without a requester there is no
// list to return (BR-06, BR-08).
// ---------------------------------------------------------------------------
ticketsRouter.get("/api/tickets", async (req: Request, res: Response) => {
  const { requesterId, ...rest } = req.query;
  return handleTicketList(
    typeof requesterId === "string" ? requesterId : undefined,
    rest,
    res,
  );
});

// ---------------------------------------------------------------------------
// FR-31 — active Related Systems for the Create Ticket reference data.
// ---------------------------------------------------------------------------
ticketsRouter.get("/api/related-systems", async (_req, res) => {
  try {
    const relatedSystems = await getPrisma().relatedSystem.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    res.status(200).json({ data: relatedSystems });
  } catch (err) {
    console.error("GET /api/related-systems failed:", err);
    internalError(res, "Failed to load related systems.");
  }
});

// ---------------------------------------------------------------------------
// POST /api/tickets — create one Ticket (api-spec.md §6).
// ---------------------------------------------------------------------------
ticketsRouter.post("/api/tickets", async (req: Request, res: Response) => {
  // 1. Shape and content validation, independent of the frontend (BR-19).
  const { input, fieldErrors } = validateCreateTicketBody(req.body);
  if (!input) return validationError(res, fieldErrors);

  const prisma = getPrisma();

  try {
    // 2. Reference data must exist AND be active (BR-16, BR-17).
    const [requester, category, relatedSystem] = await Promise.all([
      prisma.developmentRequester.findFirst({
        where: { id: input.requesterId, isActive: true, deletedAt: null },
        select: { id: true, name: true },
      }),
      prisma.category.findFirst({
        where: { id: input.categoryId, isActive: true, deletedAt: null },
        select: { id: true, name: true },
      }),
      prisma.relatedSystem.findFirst({
        where: { id: input.relatedSystemId, isActive: true, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);

    const referenceErrors: Record<string, string> = {};
    if (!requester) {
      referenceErrors.requesterId = "Selected requester is not available.";
    }
    if (!category) {
      referenceErrors.categoryId = "Selected category is not available.";
    }
    if (!relatedSystem) {
      referenceErrors.relatedSystemId =
        "Selected related system is not available.";
    }
    if (Object.keys(referenceErrors).length > 0) {
      return validationError(res, referenceErrors);
    }

    // 3. Duplicate check and create run together, so two identical requests
    //    arriving at the same instant cannot both pass the check (BR-18).
    //    A transaction-scoped advisory lock keyed on the submission content
    //    serialises identical submissions and is released on commit/rollback.
    //    Distinct submissions hash differently and never contend.
    const submissionLockKey = advisoryLockKey([
      input.requesterId,
      input.categoryId,
      input.relatedSystemId,
      input.requestedPriority,
      input.summary,
      input.description,
    ].join("|"));

    for (let attempt = 0; attempt < TICKET_NUMBER_ATTEMPTS; attempt++) {
      try {
        const outcome = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(CAST(${submissionLockKey} AS bigint))`;

          const duplicate = await tx.ticket.findFirst({
            where: {
              requesterId: input.requesterId,
              categoryId: input.categoryId,
              relatedSystemId: input.relatedSystemId,
              summary: input.summary,
              description: input.description,
              requestedPriority: input.requestedPriority,
              createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
            },
            select: { id: true, ticketNumber: true },
          });

          if (duplicate) return { duplicate };

          // Ticket Number generation (BR-01). A concurrent create may still
          // claim this number first; the unique index rejects the loser and
          // the surrounding loop retries with a fresh transaction.
          const now = new Date();
          const latest = await tx.ticket.findFirst({
            where: { ticketNumber: { startsWith: ticketNumberPrefixFor(now) } },
            orderBy: { ticketNumber: "desc" },
            select: { ticketNumber: true },
          });

          const ticket = await tx.ticket.create({
            data: {
              ticketNumber: formatTicketNumber(
                now,
                nextSequence(latest?.ticketNumber ?? null),
              ),
              requesterId: input.requesterId,
              categoryId: input.categoryId,
              relatedSystemId: input.relatedSystemId,
              summary: input.summary,
              description: input.description,
              requestedPriority: input.requestedPriority,
              // ticketDate and currentStatus ("New") come from schema
              // defaults, so the backend owns them (BR-02, BR-03).
            },
            include: {
              requester: { select: { id: true, name: true } },
              category: { select: { id: true, name: true } },
              relatedSystem: { select: { id: true, name: true } },
            },
          });

          return { ticket };
        });

        if (outcome.duplicate) {
          return res.status(409).json({
            error: {
              code: "DUPLICATE_SUBMISSION",
              message:
                "This ticket was just submitted. Refer to the existing ticket.",
              // Returning the existing number lets the UI show the real result
              // of the user's single action instead of a dead end.
              ticketNumber: outcome.duplicate.ticketNumber,
            },
          });
        }

        const { ticket } = outcome;
        return res.status(201).json({
          data: {
            id: ticket.id,
            ticketNumber: ticket.ticketNumber,
            ticketDate: ticket.ticketDate,
            requester: ticket.requester,
            category: ticket.category,
            relatedSystem: ticket.relatedSystem,
            summary: ticket.summary,
            requestedPriority: ticket.requestedPriority,
            currentStatus: ticket.currentStatus,
            description: ticket.description,
            createdAt: ticket.createdAt,
            updatedAt: ticket.updatedAt,
          },
        });
      } catch (err) {
        const code = (err as { code?: string }).code;
        const target = (err as { meta?: { target?: string[] } }).meta?.target;
        const isTicketNumberClash =
          code === UNIQUE_VIOLATION &&
          (target === undefined || target.includes("ticketNumber"));

        // Another request took this number — recompute and try again.
        if (isTicketNumberClash) continue;
        throw err;
      }
    }

    console.error(
      `POST /api/tickets: could not allocate a ticket number after ${TICKET_NUMBER_ATTEMPTS} attempts`,
    );
    return internalError(
      res,
      "Could not create the ticket. Please try again.",
    );
  } catch (err) {
    console.error("POST /api/tickets failed:", err);
    return internalError(res, "Could not create the ticket. Please try again.");
  }
});

export default ticketsRouter;
