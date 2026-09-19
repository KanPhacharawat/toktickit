import type { Request, Response } from "express";
import type { ItPriority, TicketStatus } from "@prisma/client";
import { getPrisma } from "./prisma.js";

// Shared Ticket resolution for every per-ticket route (detail, attachments,
// threads, ownership, IT Priority, status).
//
// BR-03 / BR-08 — a Requester may only reach their own Ticket. BR-09 — IT
// Staff and Administrators may reach any Ticket, and a Requester's failed
// lookup (missing or someone else's) answers the identical 404.

export function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return res.status(status).json({ error: { code, message, ...extra } });
}

export function internalError(res: Response, message: string) {
  return fail(res, 500, "INTERNAL_ERROR", message);
}

export function parseId(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return parsed > 0 ? parsed : null;
}

type AccessFailure = { ok: false };
export type TicketAccess = {
  ok: true;
  ticketId: number;
  requesterId: number;
  ticketOwnerId: number | null;
  currentStatus: TicketStatus;
  itPriority: ItPriority;
  problemAppearsResolvedAt: Date | null;
  updatedAt: Date;
};

/**
 * Resolves `:ticketId` for the caller. Requesters get their own Ticket only;
 * IT Staff and Administrators get any Ticket. Answers 400/404 itself.
 */
export async function resolveTicketAccess(
  req: Request,
  res: Response,
): Promise<AccessFailure | TicketAccess> {
  const ticketId = parseId(req.params.ticketId);

  if (ticketId === null) {
    fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
      fieldErrors: { ticketId: "A valid ticket is required." },
    });
    return { ok: false };
  }

  const ticket = await getPrisma().ticket.findFirst({
    where: { id: ticketId, deletedAt: null },
    select: {
      id: true,
      requesterId: true,
      ticketOwnerId: true,
      currentStatus: true,
      itPriority: true,
      problemAppearsResolvedAt: true,
      updatedAt: true,
    },
  });

  const isRequester = req.auth!.user.role === "Requester";
  if (!ticket || (isRequester && ticket.requesterId !== req.auth!.user.id)) {
    fail(res, 404, "NOT_FOUND", "Ticket not found.");
    return { ok: false };
  }

  return {
    ok: true,
    ticketId: ticket.id,
    requesterId: ticket.requesterId,
    ticketOwnerId: ticket.ticketOwnerId,
    currentStatus: ticket.currentStatus,
    itPriority: ticket.itPriority,
    problemAppearsResolvedAt: ticket.problemAppearsResolvedAt,
    updatedAt: ticket.updatedAt,
  };
}

/**
 * BR-38 — only the Ticket Owner or an Administrator has operational
 * authority (reassign, IT Priority, status). Any IT Staff or Administrator
 * may claim/assign an unassigned Ticket instead (checked at the call site).
 */
export function hasOperationalAuthority(
  access: TicketAccess,
  caller: { id: number; role: string },
): boolean {
  return caller.role === "Administrator" || access.ticketOwnerId === caller.id;
}

/** BR-42 — an optional `expectedUpdatedAt` must match, or the update is stale. */
export function isStale(access: TicketAccess, body: unknown): boolean {
  const expected = (body as { expectedUpdatedAt?: unknown } | null)?.expectedUpdatedAt;
  if (expected === undefined || expected === null) return false;
  if (typeof expected !== "string") return true;
  const expectedTime = new Date(expected).getTime();
  if (Number.isNaN(expectedTime)) return true;
  return expectedTime !== access.updatedAt.getTime();
}
