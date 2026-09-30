import type { ItPriority } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { startOfTodayBangkok } from "./dashboardTimezone.js";
import { OPEN_LIKE_STATUSES } from "./ticketListQuery.js";

// Lab 4 specification.md §5.4 — dashboard metric calculations. Kept separate
// from the HTTP layer (dashboard.ts) so the counts are computed the same way
// regardless of caller, and are testable without spinning up Express.
//
// BR-45 — every metric is computed by the database at request time; the
// client never derives a count from a list. BR-46 — empty data answers `0`
// / `[]`, never `null`/omitted (Prisma's count/findMany already do this).

export { OPEN_LIKE_STATUSES };

export const IT_PRIORITIES: readonly ItPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const ticketSummarySelect = {
  id: true,
  ticketNumber: true,
  summary: true,
  currentStatus: true,
  itPriority: true,
  updatedAt: true,
  createdAt: true,
  ticketOwner: { select: { id: true, name: true, role: true } },
} as const;

export interface TicketSummary {
  id: number;
  ticketNumber: string;
  summary: string;
  currentStatus: string;
  itPriority: ItPriority;
  updatedAt: Date;
  createdAt: Date;
  ticketOwner: { id: number; name: string; role: string } | null;
}

// ---------------------------------------------------------------------------
// Requester dashboard (BR-26..BR-32)
// ---------------------------------------------------------------------------

export interface RequesterDashboardData {
  myOpen: number;
  waitingForMe: number;
  inProgress: number;
  resolved: number;
  closed: number;
  recentTickets: TicketSummary[];
  needsAttention: TicketSummary[];
}

export async function computeRequesterDashboard(requesterId: number): Promise<RequesterDashboardData> {
  const prisma = getPrisma();
  const baseWhere = { requesterId, deletedAt: null } as const;

  const [myOpen, waitingForMe, inProgress, resolved, closed, recentTickets, needsAttention] =
    await Promise.all([
      prisma.ticket.count({ where: { ...baseWhere, currentStatus: { in: OPEN_LIKE_STATUSES } } }),
      prisma.ticket.count({ where: { ...baseWhere, currentStatus: "WaitingForRequester" } }),
      prisma.ticket.count({ where: { ...baseWhere, currentStatus: "InProgress" } }),
      prisma.ticket.count({ where: { ...baseWhere, currentStatus: "Resolved" } }),
      prisma.ticket.count({ where: { ...baseWhere, currentStatus: "Closed" } }),
      // BR-31 — 5 most recent by updatedAt desc, id desc.
      prisma.ticket.findMany({
        where: baseWhere,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 5,
        select: ticketSummarySelect,
      }),
      // BR-32 — up to 5 WaitingForRequester or Resolved, updatedAt desc.
      prisma.ticket.findMany({
        where: { ...baseWhere, currentStatus: { in: ["WaitingForRequester", "Resolved"] } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 5,
        select: ticketSummarySelect,
      }),
    ]);

  return { myOpen, waitingForMe, inProgress, resolved, closed, recentTickets, needsAttention };
}

// ---------------------------------------------------------------------------
// Staff / Administrator dashboard (BR-33..BR-44)
// ---------------------------------------------------------------------------

export interface StaffDashboardData {
  newCount: number;
  open: number;
  inProgress: number;
  waitingForRequester: number;
  unassigned: number;
  myAssigned: number;
  byPriority: Array<{ priority: ItPriority; value: number }>;
  myOpenFollowUps: number;
  urgentTickets: TicketSummary[];
  recentTickets: TicketSummary[];
  todayDelta: number;
}

export async function computeStaffDashboard(callerId: number): Promise<StaffDashboardData> {
  const prisma = getPrisma();
  const openLikeWhere = { deletedAt: null, currentStatus: { in: OPEN_LIKE_STATUSES } } as const;

  const [
    newCount,
    open,
    inProgress,
    waitingForRequester,
    unassigned,
    myAssigned,
    byPriorityGroups,
    myOpenFollowUps,
    urgentTickets,
    recentTickets,
    todayCount,
  ] = await Promise.all([
    prisma.ticket.count({ where: { deletedAt: null, currentStatus: "New" } }),
    prisma.ticket.count({ where: { deletedAt: null, currentStatus: { in: ["Open", "Reopened"] } } }),
    prisma.ticket.count({ where: { deletedAt: null, currentStatus: "InProgress" } }),
    prisma.ticket.count({ where: { deletedAt: null, currentStatus: "WaitingForRequester" } }),
    prisma.ticket.count({ where: { ...openLikeWhere, ticketOwnerId: null } }),
    prisma.ticket.count({ where: { ...openLikeWhere, ticketOwnerId: callerId } }),
    // BR-39 — zero-filled per IT Priority, for open-like Tickets.
    prisma.ticket.groupBy({
      by: ["itPriority"],
      where: openLikeWhere,
      _count: true,
    }),
    // BR-40 — my open follow-ups: Completed actions I performed, with a
    // follow-up, on a Ticket that is still open-like.
    prisma.actionTaken.count({
      where: {
        performedById: callerId,
        status: "Completed",
        followUpRequired: true,
        ticket: { currentStatus: { in: OPEN_LIKE_STATUSES }, deletedAt: null },
      },
    }),
    // BR-41 — up to 5 open-like, priority in {URGENT, HIGH}, priority desc
    // then createdAt asc (native enum order matches declaration: LOW <
    // MEDIUM < HIGH < URGENT — see queueQuery.ts).
    prisma.ticket.findMany({
      where: { ...openLikeWhere, itPriority: { in: ["URGENT", "HIGH"] } },
      orderBy: [{ itPriority: "desc" }, { createdAt: "asc" }],
      take: 5,
      select: ticketSummarySelect,
    }),
    // BR-42 — up to 5 open-like, updatedAt desc, id desc.
    prisma.ticket.findMany({
      where: openLikeWhere,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 5,
      select: ticketSummarySelect,
    }),
    // BR-43 (optional) — created since 00:00 Asia/Bangkok today.
    prisma.ticket.count({
      where: { deletedAt: null, createdAt: { gte: startOfTodayBangkok() } },
    }),
  ]);

  const countByPriority = new Map(byPriorityGroups.map((g) => [g.itPriority, g._count]));
  const byPriority = IT_PRIORITIES.map((priority) => ({
    priority,
    value: countByPriority.get(priority) ?? 0,
  }));

  return {
    newCount,
    open,
    inProgress,
    waitingForRequester,
    unassigned,
    myAssigned,
    byPriority,
    myOpenFollowUps,
    urgentTickets,
    recentTickets,
    todayDelta: todayCount,
  };
}

// ---------------------------------------------------------------------------
// Administrator additions (BR-44)
// ---------------------------------------------------------------------------

export interface AdminUserCounts {
  active: Record<"Requester" | "ITStaff" | "Administrator", number>;
  inactive: number;
}

export async function computeAdminUserCounts(): Promise<AdminUserCounts> {
  const prisma = getPrisma();
  const [activeGroups, inactive] = await Promise.all([
    prisma.user.groupBy({
      by: ["role"],
      where: { deletedAt: null, isActive: true },
      _count: true,
    }),
    prisma.user.count({ where: { deletedAt: null, isActive: false } }),
  ]);

  const byRole = new Map(activeGroups.map((g) => [g.role, g._count]));
  return {
    active: {
      Requester: byRole.get("Requester") ?? 0,
      ITStaff: byRole.get("ITStaff") ?? 0,
      Administrator: byRole.get("Administrator") ?? 0,
    },
    inactive,
  };
}
