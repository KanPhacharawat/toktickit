import { Router, type Request, type Response } from "express";
import type { Prisma, TicketStatus } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { protect } from "./auth/middleware.js";
import { fail, internalError, resolveTicketAccess } from "./ticketAccess.js";
import {
  MATRIX,
  actorFor,
  permittedTargets,
  requiresReason,
  transitionRequiresGate,
  transitionRequiresOwner,
} from "./ticketWorkflowMatrix.js";
import { checkResolutionGate, GATE_CHECK_MESSAGES, type GateResult } from "./resolutionGate.js";
import { fieldErrorsFromZod, postStatusSchema } from "./workflowValidation.js";

// Ticket Workflow — specification.md §4.2/§5.3, api-spec.md §3. Read the
// permitted transitions for the caller, change status through the single
// gated endpoint, record the Requester's advisory "appears resolved"
// indication, and list the append-only status history.

export const ticketWorkflowRouter = Router();

const userSummarySelect = { id: true, name: true, role: true } as const;

/** BR-21 — statuses from which the Requester's advisory indication is allowed. */
const REQUESTER_RESOLUTION_ELIGIBLE = new Set<TicketStatus>([
  "InProgress",
  "WaitingForRequester",
  "Reopened",
]);

function ticketSummary(ticket: {
  id: number;
  ticketNumber: string;
  currentStatus: TicketStatus;
  version: number;
  ticketOwner: { id: number; name: string; role: string } | null;
  resolutionSummary: string | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  requesterResolvedIndicatedAt: Date | null;
  updatedAt: Date;
}) {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    currentStatus: ticket.currentStatus,
    version: ticket.version,
    ticketOwner: ticket.ticketOwner,
    resolutionSummary: ticket.resolutionSummary,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    cancelledAt: ticket.cancelledAt,
    cancelReason: ticket.cancelReason,
    requesterResolvedIndicatedAt: ticket.requesterResolvedIndicatedAt,
    updatedAt: ticket.updatedAt,
  };
}

async function loadTicketSummary(ticketId: number) {
  const ticket = await getPrisma().ticket.findUniqueOrThrow({
    where: { id: ticketId },
    include: { ticketOwner: { select: userSummarySelect } },
  });
  return ticketSummary(ticket);
}

function gateResponse(gate: GateResult) {
  return {
    passed: gate.passed,
    checks: gate.checks,
  };
}

// ---------------------------------------------------------------------------
// GET /api/tickets/:ticketId/transitions (§3.1). Requester (own), IT Staff,
// Administrator.
// ---------------------------------------------------------------------------
ticketWorkflowRouter.get(
  "/api/tickets/:ticketId/transitions",
  ...protect("Requester", "ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      const role = req.auth!.user.role;
      // resolveTicketAccess already scoped a Requester to their own ticket.
      const actor = actorFor(role, true);
      const hasOwner = access.ticketOwnerId !== null;

      // AC-22 — only transitions the caller could actually execute right now;
      // an owner-required target on an unassigned ticket is a dead end, so it
      // is left out here (unlike a gate-required target, which is shown with
      // its checklist so the caller can see what is still missing).
      const targets = actor
        ? permittedTargets(actor, access.currentStatus).filter(
            (to) => !transitionRequiresOwner(access.currentStatus, to) || hasOwner,
          )
        : [];

      const transitions = await Promise.all(
        targets.map(async (to) => {
          const entry: Record<string, unknown> = { to, requiresReason: requiresReason(to) };
          if (transitionRequiresGate(access.currentStatus, to)) {
            // Preview: no `followUpAcknowledged` has been submitted yet.
            const gate = await checkResolutionGate(access.ticketId, hasOwner, false);
            entry.gate = gateResponse(gate);
          }
          return entry;
        }),
      );

      const requesterCanIndicateResolved =
        role === "Requester" && REQUESTER_RESOLUTION_ELIGIBLE.has(access.currentStatus);

      return res.status(200).json({
        currentStatus: access.currentStatus,
        version: access.version,
        transitions,
        requesterCanIndicateResolved,
      });
    } catch (err) {
      console.error("GET transitions failed:", err);
      return internalError(res, "Could not load the available transitions. Please try again.");
    }
  },
);

function staleUpdate(res: Response, current: Awaited<ReturnType<typeof loadTicketSummary>>) {
  return res.status(409).json({
    error: { code: "STALE_UPDATE", message: "This ticket changed since you loaded it." },
    current,
  });
}

// ---------------------------------------------------------------------------
// POST /api/tickets/:ticketId/status (§3.2). Per the transition matrix.
// ---------------------------------------------------------------------------
ticketWorkflowRouter.post(
  "/api/tickets/:ticketId/status",
  ...protect("Requester", "ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      const parsed = postStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fieldErrors: fieldErrorsFromZod(parsed.error),
        });
      }
      const input = parsed.data;
      const from = access.currentStatus;
      const to = input.toStatus;

      // 400 — reason is required for these targets (BR-20e, BR-23, api-spec §3.2).
      if (requiresReason(to) && (!input.reason || input.reason.trim().length === 0)) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fieldErrors: { reason: "A reason is required for this transition." },
        });
      }

      // 409 — already in the target status.
      if (from === to) {
        return fail(res, 409, "ALREADY_IN_STATUS", `This ticket is already ${to}.`);
      }

      // 409 — stale version (checked before the matrix, per api-spec §3.2).
      if (input.version !== access.version) {
        return staleUpdate(res, await loadTicketSummary(access.ticketId));
      }

      // 422 — not in the matrix at all for any actor.
      const rule = MATRIX[from][to];
      if (!rule) {
        return fail(res, 422, "INVALID_TRANSITION", `A ticket cannot move from ${from} to ${to}.`);
      }

      // 403 — the rule exists, but not for this caller's role.
      const role = req.auth!.user.role;
      const actor = actorFor(role, true);
      if (!actor || !rule.actors.includes(actor)) {
        return fail(res, 403, "FORBIDDEN", "You do not have access to this resource.");
      }

      // 422 — owner-required target, but the ticket is unassigned.
      if (transitionRequiresOwner(from, to) && access.ticketOwnerId === null) {
        return fail(
          res,
          422,
          "INVALID_TRANSITION",
          `Assign an owner before moving this ticket to ${to}.`,
        );
      }

      // 422 — the resolution gate (BR-20 a-d).
      if (transitionRequiresGate(from, to)) {
        const gate = await checkResolutionGate(
          access.ticketId,
          access.ticketOwnerId !== null,
          input.followUpAcknowledged,
        );
        if (!gate.passed) {
          return fail(res, 422, "RESOLUTION_GATE_FAILED", "Ticket cannot be resolved yet.", {
            details: gate.checks
              .filter((c) => !c.passed)
              .map((c) => ({ check: c.id, message: GATE_CHECK_MESSAGES[c.id] })),
          });
        }
      }

      const reason = input.reason?.trim() ?? null;
      const now = new Date();

      const result = await getPrisma().$transaction(async (tx) => {
        const timestampChanges: Prisma.TicketUpdateManyMutationInput = {};
        if (to === "InProgress" || to === "WaitingForRequester" || to === "Reopened") {
          timestampChanges.requesterResolvedIndicatedAt = null;
        }
        if (to === "Resolved") {
          timestampChanges.resolvedAt = now;
          timestampChanges.resolutionSummary = reason;
        }
        if (to === "Closed") {
          timestampChanges.closedAt = now;
        }
        if (to === "Reopened") {
          timestampChanges.resolvedAt = null;
        }
        if (to === "Cancelled") {
          timestampChanges.cancelledAt = now;
          timestampChanges.cancelReason = reason;
        }

        const updated = await tx.ticket.updateMany({
          where: { id: access.ticketId, version: access.version },
          data: {
            currentStatus: to,
            version: { increment: 1 },
            ...timestampChanges,
          },
        });
        if (updated.count === 0) return null;

        const history = await tx.ticketStatusHistory.create({
          data: {
            ticketId: access.ticketId,
            fromStatus: from,
            toStatus: to,
            actorId: req.auth!.user.id,
            reason,
          },
          include: { actor: { select: userSummarySelect } },
        });

        return history;
      });

      if (result === null) {
        return staleUpdate(res, await loadTicketSummary(access.ticketId));
      }

      return res.status(200).json({
        ticket: await loadTicketSummary(access.ticketId),
        history: {
          id: result.id,
          fromStatus: result.fromStatus,
          toStatus: result.toStatus,
          actor: result.actor,
          reason: result.reason,
          createdAt: result.createdAt,
        },
      });
    } catch (err) {
      console.error("POST status failed:", err);
      return internalError(res, "Could not update the status. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/tickets/:ticketId/requester-resolution (§3.3). Requester (own).
// Advisory only; never changes status. Idempotent.
// ---------------------------------------------------------------------------
ticketWorkflowRouter.post(
  "/api/tickets/:ticketId/requester-resolution",
  ...protect("Requester"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      if (!REQUESTER_RESOLUTION_ELIGIBLE.has(access.currentStatus)) {
        return fail(
          res,
          422,
          "INVALID_TRANSITION",
          "This ticket cannot report a resolution right now.",
        );
      }

      const prisma = getPrisma();
      const current = await prisma.ticket.findUniqueOrThrow({
        where: { id: access.ticketId },
        select: { requesterResolvedIndicatedAt: true },
      });

      // Idempotent — keep the first timestamp on a repeated call.
      const requesterResolvedIndicatedAt =
        current.requesterResolvedIndicatedAt ??
        (
          await prisma.ticket.update({
            where: { id: access.ticketId },
            data: { requesterResolvedIndicatedAt: new Date() },
            select: { requesterResolvedIndicatedAt: true },
          })
        ).requesterResolvedIndicatedAt;

      return res.status(200).json({
        ticketId: access.ticketId,
        currentStatus: access.currentStatus,
        requesterResolvedIndicatedAt,
      });
    } catch (err) {
      console.error("POST requester-resolution failed:", err);
      return internalError(res, "Could not record the indication. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/tickets/:ticketId/status-history (§3.4). Requester (own), IT
// Staff, Administrator. Read-only — no write/edit endpoint exists.
// ---------------------------------------------------------------------------
ticketWorkflowRouter.get(
  "/api/tickets/:ticketId/status-history",
  ...protect("Requester", "ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      const items = await getPrisma().ticketStatusHistory.findMany({
        where: { ticketId: access.ticketId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { actor: { select: userSummarySelect } },
      });

      return res.status(200).json({
        items: items.map((h) => ({
          id: h.id,
          fromStatus: h.fromStatus,
          toStatus: h.toStatus,
          actor: h.actor,
          reason: h.reason,
          createdAt: h.createdAt,
        })),
      });
    } catch (err) {
      console.error("GET status-history failed:", err);
      return internalError(res, "Could not load the status history. Please try again.");
    }
  },
);

export default ticketWorkflowRouter;
