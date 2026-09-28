import type { TicketStatus, UserRole } from "@prisma/client";
import { TICKET_STATUSES } from "./ticketListQuery.js";

// Lab 4 specification.md §5.3 — the final Ticket status transition matrix.
// A single shared module (role + from + to) so the API and
// `GET /transitions` can never drift apart (FR-11, FR-12, BR-19).

/** "Staff" = ITStaff or Administrator; "RequesterOwn" = the Requester who owns the Ticket. */
export type WorkflowActor = "Staff" | "RequesterOwn";

export interface TransitionRule {
  actors: readonly WorkflowActor[];
  /** ¹ — the Ticket must already have a Ticket Owner (any active staff member, not necessarily the caller). */
  requiresOwner?: boolean;
  /** ² — BR-20's resolution gate must pass. */
  requiresGate?: boolean;
}

type MatrixRow = Partial<Record<TicketStatus, TransitionRule>>;

export const MATRIX: Record<TicketStatus, MatrixRow> = {
  New: {
    Open: { actors: ["Staff"] },
    InProgress: { actors: ["Staff"], requiresOwner: true },
    Cancelled: { actors: ["Staff", "RequesterOwn"] },
  },
  Open: {
    InProgress: { actors: ["Staff"], requiresOwner: true },
    WaitingForRequester: { actors: ["Staff"] },
    Cancelled: { actors: ["Staff"] },
  },
  InProgress: {
    WaitingForRequester: { actors: ["Staff"] },
    Resolved: { actors: ["Staff"], requiresGate: true },
    Cancelled: { actors: ["Staff"] },
  },
  WaitingForRequester: {
    InProgress: { actors: ["Staff"] },
    Resolved: { actors: ["Staff"], requiresGate: true },
    Cancelled: { actors: ["Staff"] },
  },
  Resolved: {
    Closed: { actors: ["Staff"] },
    Reopened: { actors: ["Staff", "RequesterOwn"] },
  },
  Reopened: {
    InProgress: { actors: ["Staff"], requiresOwner: true },
    WaitingForRequester: { actors: ["Staff"] },
    Resolved: { actors: ["Staff"], requiresGate: true },
    Cancelled: { actors: ["Staff"] },
  },
  Closed: {},
  Cancelled: {},
};

export const TERMINAL_STATUSES = new Set<TicketStatus>(["Closed", "Cancelled"]);

export function isTerminal(status: TicketStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** BR-23 / api-spec.md §3.2 — `reason` is required for these targets. */
export function requiresReason(to: TicketStatus): boolean {
  return to === "Resolved" || to === "Cancelled" || to === "Reopened";
}

/** The actor a given caller is, for matrix purposes — or `null` if neither applies. */
export function actorFor(
  role: UserRole,
  isTicketRequester: boolean,
): WorkflowActor | null {
  if (role === "ITStaff" || role === "Administrator") return "Staff";
  if (role === "Requester" && isTicketRequester) return "RequesterOwn";
  return null;
}

function rule(from: TicketStatus, to: TicketStatus): TransitionRule | undefined {
  return MATRIX[from][to];
}

/** BR-19 — whether `from -> to` is in the matrix for this actor. Does not check owner/gate. */
export function isPermittedTransition(
  actor: WorkflowActor,
  from: TicketStatus,
  to: TicketStatus,
): boolean {
  const found = rule(from, to);
  return found !== undefined && found.actors.includes(actor);
}

/** The targets structurally reachable by this actor from `from`, regardless of owner/gate state. */
export function permittedTargets(actor: WorkflowActor, from: TicketStatus): TicketStatus[] {
  return TICKET_STATUSES.filter((to) => isPermittedTransition(actor, from, to));
}

export function transitionRequiresOwner(from: TicketStatus, to: TicketStatus): boolean {
  return rule(from, to)?.requiresOwner === true;
}

export function transitionRequiresGate(from: TicketStatus, to: TicketStatus): boolean {
  return rule(from, to)?.requiresGate === true;
}
