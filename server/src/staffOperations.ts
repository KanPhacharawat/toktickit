import { Router, type Request, type Response } from "express";
import type { ItPriority } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { protect } from "./auth/middleware.js";
import { fail, hasOperationalAuthority, internalError, isStale, resolveTicketAccess } from "./ticketAccess.js";
import { isOwnerRequiredTarget, isPermittedTransition, isTerminal } from "./statusTransitions.js";
import { loadStaffTicketDetail } from "./ticketDetailView.js";
import { TICKET_STATUSES, type TicketStatus } from "./ticketListQuery.js";

// IT Staff Ticket Operations — claim, assign/reassign, IT Priority, status
// (api-spec.md §9), and the assignable-user list (§7.2).

export const staffOperationsRouter = Router();

const IT_PRIORITIES: readonly ItPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function terminalError(res: Response) {
  return fail(res, 409, "TICKET_CLOSED", "This ticket is closed and cannot be changed.");
}
function staleError(res: Response) {
  return fail(res, 409, "STALE_TICKET", "This ticket changed since you loaded it.");
}

// ---------------------------------------------------------------------------
// GET /api/users/assignable (api-spec.md §7.2). IT Staff, Administrator.
// ---------------------------------------------------------------------------
staffOperationsRouter.get(
  "/api/users/assignable",
  ...protect("ITStaff", "Administrator"),
  async (_req: Request, res: Response) => {
    try {
      const users = await getPrisma().user.findMany({
        where: { role: { in: ["ITStaff", "Administrator"] }, isActive: true, deletedAt: null },
        select: { id: true, name: true, role: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
      return res.status(200).json({ data: users });
    } catch (err) {
      console.error("GET /api/users/assignable failed:", err);
      return internalError(res, "Could not load assignable users. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/tickets/:ticketId/claim (§9.1). Any IT Staff or Administrator.
// ---------------------------------------------------------------------------
staffOperationsRouter.post(
  "/api/tickets/:ticketId/claim",
  ...protect("ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      if (isStale(access, req.body)) return staleError(res);
      if (isTerminal(access.currentStatus)) return terminalError(res);
      if (access.ticketOwnerId !== null) {
        return fail(res, 409, "TICKET_ALREADY_CLAIMED", "This ticket has already been claimed.");
      }

      // Conditional update: only succeeds if still unassigned, so a
      // concurrent claim cannot double-win the race.
      const { count } = await getPrisma().ticket.updateMany({
        where: { id: access.ticketId, ticketOwnerId: null },
        data: { ticketOwnerId: req.auth!.user.id },
      });
      if (count === 0) {
        return fail(res, 409, "TICKET_ALREADY_CLAIMED", "This ticket has already been claimed.");
      }

      return res.status(200).json({ data: await loadStaffTicketDetail(access.ticketId, req.auth!.user) });
    } catch (err) {
      console.error("POST claim failed:", err);
      return internalError(res, "Could not claim the ticket. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/tickets/:ticketId/owner (§9.2). Assign: any IT Staff or
// Administrator. Reassign: the current owner or an Administrator.
// ---------------------------------------------------------------------------
staffOperationsRouter.patch(
  "/api/tickets/:ticketId/owner",
  ...protect("ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      const isReassign = access.ticketOwnerId !== null;
      if (isReassign && !hasOperationalAuthority(access, req.auth!.user)) {
        return fail(res, 403, "FORBIDDEN", "You do not have access to this resource.");
      }

      const raw = (req.body as { ticketOwnerId?: unknown } | undefined)?.ticketOwnerId;
      const targetId =
        typeof raw === "number" && Number.isInteger(raw) && raw > 0
          ? raw
          : typeof raw === "string" && /^\d+$/.test(raw)
            ? Number.parseInt(raw, 10)
            : null;
      if (targetId === null) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fieldErrors: { ticketOwnerId: "Select a new owner." },
        });
      }

      const target = await getPrisma().user.findFirst({
        where: { id: targetId, role: { in: ["ITStaff", "Administrator"] }, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (!target) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fieldErrors: { ticketOwnerId: "Select an active IT Staff member or administrator." },
        });
      }
      if (isReassign && targetId === access.ticketOwnerId) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fieldErrors: { ticketOwnerId: "Choose a different owner." },
        });
      }

      if (isStale(access, req.body)) return staleError(res);
      if (isTerminal(access.currentStatus)) return terminalError(res);

      // Conditional on the owner not having changed since it was read, so a
      // concurrent claim/reassign cannot be silently overwritten.
      const { count } = await getPrisma().ticket.updateMany({
        where: { id: access.ticketId, ticketOwnerId: access.ticketOwnerId },
        data: { ticketOwnerId: targetId },
      });
      if (count === 0) return staleError(res);

      return res.status(200).json({ data: await loadStaffTicketDetail(access.ticketId, req.auth!.user) });
    } catch (err) {
      console.error("PATCH owner failed:", err);
      return internalError(res, "Could not update the owner. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/tickets/:ticketId/it-priority (§9.3). The current owner or an
// Administrator.
// ---------------------------------------------------------------------------
staffOperationsRouter.patch(
  "/api/tickets/:ticketId/it-priority",
  ...protect("ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      if (!hasOperationalAuthority(access, req.auth!.user)) {
        return fail(res, 403, "FORBIDDEN", "You do not have access to this resource.");
      }

      const raw = (req.body as { itPriority?: unknown } | undefined)?.itPriority;
      if (typeof raw !== "string" || !IT_PRIORITIES.includes(raw as ItPriority)) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fieldErrors: { itPriority: "Select a valid IT Priority." },
        });
      }

      if (isStale(access, req.body)) return staleError(res);
      if (isTerminal(access.currentStatus)) return terminalError(res);

      // Resending the stored value is a no-op: skip the write so updatedAt
      // does not change (api-spec.md §9.3).
      if (raw !== access.itPriority) {
        await getPrisma().ticket.update({
          where: { id: access.ticketId },
          data: { itPriority: raw as ItPriority },
        });
      }

      return res.status(200).json({ data: await loadStaffTicketDetail(access.ticketId, req.auth!.user) });
    } catch (err) {
      console.error("PATCH it-priority failed:", err);
      return internalError(res, "Could not update IT Priority. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/tickets/:ticketId/status (§9.4). The current owner or an
// Administrator.
// ---------------------------------------------------------------------------
staffOperationsRouter.patch(
  "/api/tickets/:ticketId/status",
  ...protect("ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      if (!hasOperationalAuthority(access, req.auth!.user)) {
        return fail(res, 403, "FORBIDDEN", "You do not have access to this resource.");
      }

      const raw = (req.body as { currentStatus?: unknown } | undefined)?.currentStatus;
      if (typeof raw !== "string" || !(TICKET_STATUSES as readonly string[]).includes(raw)) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fieldErrors: { currentStatus: "Select a valid status." },
        });
      }
      const target = raw as TicketStatus;

      if (isStale(access, req.body)) return staleError(res);

      if (isTerminal(access.currentStatus)) {
        return fail(res, 409, "TICKET_CLOSED", "This ticket is closed and cannot change status.");
      }

      if (!isPermittedTransition(access.currentStatus, target)) {
        return fail(
          res,
          409,
          "INVALID_STATUS_TRANSITION",
          `A ticket cannot move from ${access.currentStatus} to ${target}.`,
        );
      }

      if (access.ticketOwnerId === null && isOwnerRequiredTarget(target)) {
        return fail(
          res,
          409,
          "OWNER_REQUIRED",
          `Assign an owner before moving this ticket to ${target}.`,
        );
      }

      // BR-48 — reopening treats the resolution signal as not holding.
      await getPrisma().ticket.update({
        where: { id: access.ticketId },
        data: {
          currentStatus: target,
          ...(target === "Reopened" ? { problemAppearsResolvedAt: null } : {}),
        },
      });

      return res.status(200).json({ data: await loadStaffTicketDetail(access.ticketId, req.auth!.user) });
    } catch (err) {
      console.error("PATCH status failed:", err);
      return internalError(res, "Could not update the status. Please try again.");
    }
  },
);

export default staffOperationsRouter;
