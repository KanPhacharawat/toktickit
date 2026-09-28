import { getPrisma } from "./prisma.js";

// Lab 4 specification.md §5.3 BR-20 — the resolution gate. Shared by
// `GET /transitions` (a preview, no `followUpAcknowledged` yet) and
// `POST /status` (the real check inside the transaction).

export type GateCheckId =
  | "HAS_OWNER"
  | "HAS_COMPLETED_ACTION"
  | "NO_PLANNED_ACTIONS"
  | "FOLLOW_UPS_ACKNOWLEDGED";

export interface GateCheck {
  id: GateCheckId;
  passed: boolean;
  requiresAcknowledgement?: boolean;
}

export interface GateResult {
  passed: boolean;
  checks: GateCheck[];
}

/** Human-readable messages for the 422 RESOLUTION_GATE_FAILED `details` array. */
export const GATE_CHECK_MESSAGES: Record<GateCheckId, string> = {
  HAS_OWNER: "This ticket has no owner yet.",
  HAS_COMPLETED_ACTION: "At least one completed action is required.",
  NO_PLANNED_ACTIONS: "One or more actions are still planned.",
  FOLLOW_UPS_ACKNOWLEDGED: "Outstanding follow-ups must be acknowledged.",
};

/**
 * BR-20 — a Ticket may move to `Resolved` only if (a) it has a Ticket Owner,
 * (b) at least one Action Taken is Completed, (c) no Action Taken is
 * Planned, and (d) no Completed action with `followUpRequired = true` is
 * unacknowledged. Condition (e), the resolution summary itself, is a request
 * shape concern (400), not part of this gate.
 */
export async function checkResolutionGate(
  ticketId: number,
  hasOwner: boolean,
  followUpAcknowledged: boolean,
): Promise<GateResult> {
  const prisma = getPrisma();

  const [completedCount, plannedCount, unacknowledgedFollowUpCount] = await Promise.all([
    prisma.actionTaken.count({ where: { ticketId, status: "Completed" } }),
    prisma.actionTaken.count({ where: { ticketId, status: "Planned" } }),
    prisma.actionTaken.count({
      where: { ticketId, status: "Completed", followUpRequired: true },
    }),
  ]);

  const requiresAcknowledgement = unacknowledgedFollowUpCount > 0;

  const checks: GateCheck[] = [
    { id: "HAS_OWNER", passed: hasOwner },
    { id: "HAS_COMPLETED_ACTION", passed: completedCount >= 1 },
    { id: "NO_PLANNED_ACTIONS", passed: plannedCount === 0 },
    {
      id: "FOLLOW_UPS_ACKNOWLEDGED",
      passed: !requiresAcknowledgement || followUpAcknowledged,
      requiresAcknowledgement,
    },
  ];

  return { passed: checks.every((c) => c.passed), checks };
}
