import { Router, type Request, type Response } from "express";
import type { ActionStatus, Prisma } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { protect } from "./auth/middleware.js";
import { fail, internalError, parseId, resolveTicketAccess } from "./ticketAccess.js";
import { isTerminal } from "./statusTransitions.js";
import {
  cancelActionSchema,
  completeActionSchema,
  createActionSchema,
  editActionSchema,
  fieldErrorsFromZod,
  validateActionAtBounds,
} from "./actionValidation.js";

// Actions Taken (api-spec.md §2, specification.md §4.1/§5.1). List, create,
// edit, complete, and cancel the real work performed on a Ticket.

export const actionsTakenRouter = Router();

const userSummarySelect = { id: true, name: true, role: true } as const;

const actionInclude = {
  performedBy: { select: userSummarySelect },
  createdBy: { select: userSummarySelect },
  updatedBy: { select: userSummarySelect },
} satisfies Prisma.ActionTakenInclude;

type ActionWithUsers = Prisma.ActionTakenGetPayload<{ include: typeof actionInclude }>;

/** api-spec.md §1.2 ActionTaken — createdBy/updatedBy are omitted for a Requester. */
function toActionTaken(
  action: ActionWithUsers,
  role: string,
  ticketOwnerId: number | null,
) {
  const shape: Record<string, unknown> = {
    id: action.id,
    ticketId: action.ticketId,
    actionAt: action.actionAt,
    description: action.description,
    result: action.result,
    status: action.status,
    performedBy: action.performedBy,
    isPerformedByOwner: ticketOwnerId !== null && action.performedById === ticketOwnerId,
    followUpRequired: action.followUpRequired,
    followUpNote: action.followUpNote,
    attachmentNotes: action.attachmentNotes,
    completedAt: action.completedAt,
    cancelledAt: action.cancelledAt,
    cancelReason: action.cancelReason,
    createdAt: action.createdAt,
    updatedAt: action.updatedAt,
    version: action.version,
  };
  if (role !== "Requester") {
    shape.createdBy = action.createdBy;
    shape.updatedBy = action.updatedBy;
  }
  return shape;
}

function ticketLocked(res: Response) {
  return fail(res, 409, "TICKET_LOCKED", "This ticket is closed or cancelled and cannot accept new actions.");
}

function actionLocked(res: Response) {
  return fail(res, 409, "ACTION_LOCKED", "This action has been cancelled and can no longer be changed.");
}

// api-spec.md §2.3 — the 409 STALE_UPDATE body is `{ error, current }`, with
// `current` a sibling of `error` (not nested inside it), so the client can
// offer "Reload latest" / "Copy my changes" straight from this one response.
function staleUpdate(res: Response, current: ReturnType<typeof toActionTaken>) {
  return res.status(409).json({
    error: { code: "STALE_UPDATE", message: "This action was changed by someone else. Reload and try again." },
    current,
  });
}

/** BR-05 — performedById must reference an active ITStaff/Administrator user. */
async function findValidPerformer(performedById: number) {
  const user = await getPrisma().user.findFirst({
    where: { id: performedById, isActive: true, role: { in: ["ITStaff", "Administrator"] } },
    select: { id: true },
  });
  return user;
}

// ---------------------------------------------------------------------------
// GET /api/tickets/:ticketId/actions (§2.1). Requester (own), IT Staff,
// Administrator (any). FR-09 — stable order: actionAt, createdAt, id.
// ---------------------------------------------------------------------------
actionsTakenRouter.get(
  "/api/tickets/:ticketId/actions",
  ...protect("Requester", "ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      const actions = await getPrisma().actionTaken.findMany({
        where: { ticketId: access.ticketId },
        orderBy: [{ actionAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        include: actionInclude,
      });

      const role = req.auth!.user.role;
      const items = actions.map((a) => toActionTaken(a, role, access.ticketOwnerId));
      return res.status(200).json({ items, total: items.length });
    } catch (err) {
      console.error("GET actions taken failed:", err);
      return internalError(res, "Could not load actions taken. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/tickets/:ticketId/actions (§2.2). IT Staff, Administrator only.
// ---------------------------------------------------------------------------
actionsTakenRouter.post(
  "/api/tickets/:ticketId/actions",
  ...protect("ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      const prisma = getPrisma();
      const role = req.auth!.user.role;

      // BR-15 — a repeated clientRequestId for this Ticket returns the
      // original record instead of creating a duplicate (AC-11).
      const rawClientRequestId = (req.body as { clientRequestId?: unknown } | undefined)
        ?.clientRequestId;
      if (typeof rawClientRequestId === "string" && rawClientRequestId.trim().length > 0) {
        const existing = await prisma.actionTaken.findUnique({
          where: {
            ticketId_clientRequestId: {
              ticketId: access.ticketId,
              clientRequestId: rawClientRequestId.trim(),
            },
          },
          include: actionInclude,
        });
        if (existing) {
          return res.status(200).json({ data: toActionTaken(existing, role, access.ticketOwnerId) });
        }
      }

      // BR-13 — no new actions on a Closed or Cancelled Ticket.
      if (isTerminal(access.currentStatus)) return ticketLocked(res);

      const parsed = createActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fieldErrors: fieldErrorsFromZod(parsed.error),
        });
      }
      const input = parsed.data;

      // BR-06 — bounded relative to now and the Ticket's createdAt.
      const actionAtError = validateActionAtBounds(input.actionAt, access.createdAt);
      if (actionAtError) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fieldErrors: { actionAt: actionAtError },
        });
      }

      // BR-05 — defaults to the current user; otherwise must be active staff.
      const performedById = input.performedById ?? req.auth!.user.id;
      if (input.performedById !== undefined) {
        const performer = await findValidPerformer(performedById);
        if (!performer) {
          return fail(
            res,
            422,
            "INACTIVE_OR_INVALID_ASSIGNEE",
            "The selected performer must be an active IT Staff member or Administrator.",
          );
        }
      }

      let created: ActionWithUsers;
      try {
        created = await prisma.actionTaken.create({
          data: {
            ticketId: access.ticketId,
            clientRequestId: input.clientRequestId,
            actionAt: input.actionAt,
            description: input.description,
            status: input.status,
            result: input.result ?? null,
            performedById,
            createdById: req.auth!.user.id,
            followUpRequired: input.followUpRequired,
            followUpNote: input.followUpRequired ? (input.followUpNote ?? null) : null,
            attachmentNotes: input.attachmentNotes ?? null,
          },
          include: actionInclude,
        });
      } catch (createErr) {
        // A race on the same clientRequestId: the unique constraint caught
        // what the pre-check above missed (BR-15, AC-11).
        if (
          createErr instanceof Error &&
          "code" in createErr &&
          (createErr as { code?: string }).code === "P2002"
        ) {
          const existing = await prisma.actionTaken.findUniqueOrThrow({
            where: {
              ticketId_clientRequestId: {
                ticketId: access.ticketId,
                clientRequestId: input.clientRequestId,
              },
            },
            include: actionInclude,
          });
          return res.status(200).json({ data: toActionTaken(existing, role, access.ticketOwnerId) });
        }
        throw createErr;
      }

      // api-spec.md §2.2 — Ticket updatedAt is touched so it shows in "recent".
      await prisma.ticket.update({ where: { id: access.ticketId }, data: { updatedAt: new Date() } });

      return res.status(201).json({ data: toActionTaken(created, role, access.ticketOwnerId) });
    } catch (err) {
      console.error("POST action taken failed:", err);
      return internalError(res, "Could not save the action. Please try again.");
    }
  },
);

/** Loads the Action Taken for an action-scoped route, or answers 404 itself. */
async function loadAction(req: Request, res: Response, ticketId: number) {
  const actionId = parseId(req.params.actionId);
  if (actionId === null) {
    fail(res, 404, "NOT_FOUND", "Action not found.");
    return null;
  }
  const action = await getPrisma().actionTaken.findFirst({
    where: { id: actionId, ticketId },
    include: actionInclude,
  });
  if (!action) {
    fail(res, 404, "NOT_FOUND", "Action not found.");
    return null;
  }
  return action;
}

// ---------------------------------------------------------------------------
// PATCH /api/tickets/:ticketId/actions/:actionId (§2.3). IT Staff,
// Administrator only.
// ---------------------------------------------------------------------------
actionsTakenRouter.patch(
  "/api/tickets/:ticketId/actions/:actionId",
  ...protect("ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      const role = req.auth!.user.role;
      const action = await loadAction(req, res, access.ticketId);
      if (!action) return;

      if (isTerminal(access.currentStatus)) return ticketLocked(res);
      if (action.status === "Cancelled") return actionLocked(res);

      const parsed = editActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fieldErrors: fieldErrorsFromZod(parsed.error),
        });
      }
      const input = parsed.data;

      if (input.version !== action.version) {
        return staleUpdate(res, toActionTaken(action, role, access.ticketOwnerId));
      }

      // Re-validation on the merged record (api-spec.md §2.3).
      const mergedStatus = action.status as ActionStatus;
      const mergedResult = input.result !== undefined ? input.result : action.result;
      if (mergedStatus === "Completed" && (!mergedResult || mergedResult.trim().length === 0)) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fieldErrors: { result: "Result is required when the action is Completed." },
        });
      }
      const mergedFollowUpRequired =
        input.followUpRequired !== undefined ? input.followUpRequired : action.followUpRequired;
      const mergedFollowUpNote =
        input.followUpNote !== undefined ? input.followUpNote : action.followUpNote;
      if (mergedFollowUpRequired && (!mergedFollowUpNote || mergedFollowUpNote.trim().length === 0)) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fieldErrors: { followUpNote: "Follow-up note is required when follow-up is needed." },
        });
      }

      const mergedActionAt = input.actionAt ?? action.actionAt;
      const actionAtError = validateActionAtBounds(mergedActionAt, access.createdAt);
      if (actionAtError) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fieldErrors: { actionAt: actionAtError },
        });
      }

      if (input.performedById !== undefined) {
        const performer = await findValidPerformer(input.performedById);
        if (!performer) {
          return fail(
            res,
            422,
            "INACTIVE_OR_INVALID_ASSIGNEE",
            "The selected performer must be an active IT Staff member or Administrator.",
          );
        }
      }

      const updated = await getPrisma().actionTaken.updateMany({
        where: { id: action.id, version: action.version },
        data: {
          actionAt: input.actionAt,
          description: input.description,
          result: input.result,
          performedById: input.performedById,
          followUpRequired: mergedFollowUpRequired,
          followUpNote: mergedFollowUpRequired ? mergedFollowUpNote : null,
          attachmentNotes: input.attachmentNotes,
          updatedById: req.auth!.user.id,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        const current = await getPrisma().actionTaken.findUniqueOrThrow({
          where: { id: action.id },
          include: actionInclude,
        });
        return staleUpdate(res, toActionTaken(current, role, access.ticketOwnerId));
      }

      const fresh = await getPrisma().actionTaken.findUniqueOrThrow({
        where: { id: action.id },
        include: actionInclude,
      });
      return res.status(200).json({ data: toActionTaken(fresh, role, access.ticketOwnerId) });
    } catch (err) {
      console.error("PATCH action taken failed:", err);
      return internalError(res, "Could not save the action. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// POST .../actions/:actionId/complete (§2.4). IT Staff, Administrator only.
// ---------------------------------------------------------------------------
actionsTakenRouter.post(
  "/api/tickets/:ticketId/actions/:actionId/complete",
  ...protect("ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      const role = req.auth!.user.role;
      const action = await loadAction(req, res, access.ticketId);
      if (!action) return;

      if (isTerminal(access.currentStatus)) return ticketLocked(res);
      if (action.status === "Cancelled") return actionLocked(res);

      const parsed = completeActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fieldErrors: fieldErrorsFromZod(parsed.error),
        });
      }
      const input = parsed.data;

      if (input.version !== action.version) {
        return staleUpdate(res, toActionTaken(action, role, access.ticketOwnerId));
      }

      // api-spec.md §2.4 — only from Planned.
      if (action.status !== "Planned") {
        return fail(res, 422, "INVALID_TRANSITION", "Only a Planned action can be completed.");
      }

      const updated = await getPrisma().actionTaken.updateMany({
        where: { id: action.id, version: action.version },
        data: {
          status: "Completed",
          result: input.result,
          followUpRequired: input.followUpRequired,
          followUpNote: input.followUpRequired ? (input.followUpNote ?? null) : null,
          completedAt: new Date(),
          updatedById: req.auth!.user.id,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        const current = await getPrisma().actionTaken.findUniqueOrThrow({
          where: { id: action.id },
          include: actionInclude,
        });
        return staleUpdate(res, toActionTaken(current, role, access.ticketOwnerId));
      }

      const fresh = await getPrisma().actionTaken.findUniqueOrThrow({
        where: { id: action.id },
        include: actionInclude,
      });
      return res.status(200).json({ data: toActionTaken(fresh, role, access.ticketOwnerId) });
    } catch (err) {
      console.error("POST complete action failed:", err);
      return internalError(res, "Could not complete the action. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// POST .../actions/:actionId/cancel (§2.5). IT Staff, Administrator only.
// ---------------------------------------------------------------------------
actionsTakenRouter.post(
  "/api/tickets/:ticketId/actions/:actionId/cancel",
  ...protect("ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      const role = req.auth!.user.role;
      const action = await loadAction(req, res, access.ticketId);
      if (!action) return;

      if (isTerminal(access.currentStatus)) return ticketLocked(res);
      if (action.status === "Cancelled") return actionLocked(res);

      const parsed = cancelActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fieldErrors: fieldErrorsFromZod(parsed.error),
        });
      }
      const input = parsed.data;

      if (input.version !== action.version) {
        return staleUpdate(res, toActionTaken(action, role, access.ticketOwnerId));
      }

      const updated = await getPrisma().actionTaken.updateMany({
        where: { id: action.id, version: action.version },
        data: {
          status: "Cancelled",
          cancelledAt: new Date(),
          cancelReason: input.reason,
          updatedById: req.auth!.user.id,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        const current = await getPrisma().actionTaken.findUniqueOrThrow({
          where: { id: action.id },
          include: actionInclude,
        });
        return staleUpdate(res, toActionTaken(current, role, access.ticketOwnerId));
      }

      const fresh = await getPrisma().actionTaken.findUniqueOrThrow({
        where: { id: action.id },
        include: actionInclude,
      });
      return res.status(200).json({ data: toActionTaken(fresh, role, access.ticketOwnerId) });
    } catch (err) {
      console.error("POST cancel action failed:", err);
      return internalError(res, "Could not cancel the action. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE .../actions/:actionId — never allowed (append-only, api-spec.md §2.5).
// ---------------------------------------------------------------------------
actionsTakenRouter.delete(
  "/api/tickets/:ticketId/actions/:actionId",
  ...protect("Requester", "ITStaff", "Administrator"),
  (_req: Request, res: Response) => {
    return fail(res, 405, "METHOD_NOT_ALLOWED", "Actions Taken cannot be deleted.");
  },
);

export default actionsTakenRouter;
