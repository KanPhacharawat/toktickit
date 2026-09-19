import type { TicketStatus } from "./ticketListQuery.js";

// BR-39 — the status transition matrix. BR-40 — owner-required targets.
// Shared by the status route (validates a requested transition) and the
// Staff Ticket Detail response (computes `allowedStatusTransitions`).

export const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  New: ["Open", "Cancelled"],
  Open: ["InProgress", "WaitingForRequester", "Cancelled"],
  InProgress: ["WaitingForRequester", "Resolved", "Cancelled"],
  WaitingForRequester: ["InProgress", "Resolved", "Cancelled"],
  Resolved: ["Closed", "Reopened"],
  Reopened: ["InProgress", "WaitingForRequester", "Cancelled"],
  Closed: [],
  Cancelled: [],
};

/** BR-40 — moving to one of these targets requires a Ticket Owner. */
export const OWNER_REQUIRED_TARGETS = new Set<TicketStatus>([
  "Open",
  "InProgress",
  "WaitingForRequester",
  "Resolved",
]);

export const TERMINAL_STATUSES = new Set<TicketStatus>(["Closed", "Cancelled"]);

export function isTerminal(status: TicketStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isPermittedTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isOwnerRequiredTarget(to: TicketStatus): boolean {
  return OWNER_REQUIRED_TARGETS.has(to);
}

/**
 * The transitions the caller may actually use from `currentStatus` right
 * now: empty without operational authority or on a terminal Ticket, and
 * omitting owner-required targets when the Ticket is unassigned (§3.6).
 */
export function allowedStatusTransitions(
  currentStatus: TicketStatus,
  hasOwner: boolean,
  hasAuthority: boolean,
): TicketStatus[] {
  if (!hasAuthority || isTerminal(currentStatus)) return [];
  const targets = TRANSITIONS[currentStatus];
  return hasOwner ? [...targets] : targets.filter((t) => !isOwnerRequiredTarget(t));
}
