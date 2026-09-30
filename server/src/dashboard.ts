import { Router, type Request, type Response } from "express";
import { protect } from "./auth/middleware.js";
import { internalError } from "./ticketAccess.js";
import { DASHBOARD_TIME_ZONE } from "./dashboardTimezone.js";
import {
  computeAdminUserCounts,
  computeRequesterDashboard,
  computeStaffDashboard,
  type TicketSummary,
} from "./dashboardMetrics.js";

// Dashboards — specification.md §4.3/§5.4, api-spec.md §4. Small aggregates
// only; never a full Ticket collection (at most 5 TicketSummary rows per
// list, per every metric's drill-down list).

export const dashboardRouter = Router();

interface Metric {
  key: string;
  label: string;
  value: number;
  drillDown: string;
}

function metric(key: string, label: string, value: number, drillDown: string): Metric {
  return { key, label, value, drillDown };
}

/** api-spec.md §1.2 — TicketSummary, trimmed to what a dashboard card needs. */
function toTicketSummary(ticket: TicketSummary) {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    summary: ticket.summary,
    currentStatus: ticket.currentStatus,
    itPriority: ticket.itPriority,
    ticketOwner: ticket.ticketOwner,
    updatedAt: ticket.updatedAt,
    createdAt: ticket.createdAt,
  };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/requester (§4.1). Requester only — 403 for others.
// ---------------------------------------------------------------------------
dashboardRouter.get(
  "/api/dashboard/requester",
  ...protect("Requester"),
  async (req: Request, res: Response) => {
    try {
      const requesterId = req.auth!.user.id;
      const data = await computeRequesterDashboard(requesterId);

      return res.status(200).json({
        generatedAt: new Date(),
        timeZone: DASHBOARD_TIME_ZONE,
        metrics: [
          metric("myOpen", "My Open Tickets", data.myOpen, "/my-tickets?status=open"),
          metric("waitingForMe", "Waiting for You", data.waitingForMe, "/my-tickets?status=WaitingForRequester"),
          metric("inProgress", "In Progress", data.inProgress, "/my-tickets?status=InProgress"),
          metric("resolved", "Resolved", data.resolved, "/my-tickets?status=Resolved"),
          metric("closed", "Closed", data.closed, "/my-tickets?status=Closed"),
        ],
        needsAttention: data.needsAttention.map(toTicketSummary),
        recentTickets: data.recentTickets.map(toTicketSummary),
      });
    } catch (err) {
      console.error("GET /api/dashboard/requester failed:", err);
      return internalError(res, "Could not load the dashboard. Please try again.");
    }
  },
);

function staffDashboardBody(data: Awaited<ReturnType<typeof computeStaffDashboard>>) {
  return {
    generatedAt: new Date(),
    timeZone: DASHBOARD_TIME_ZONE,
    metrics: [
      metric("new", "New", data.newCount, "/queue?status=New"),
      metric("open", "Open", data.open, "/queue?status=Open,Reopened"),
      metric("inProgress", "In Progress", data.inProgress, "/queue?status=InProgress"),
      metric("waitingForRequester", "Waiting for Requester", data.waitingForRequester, "/queue?status=WaitingForRequester"),
      metric("myAssigned", "My Assigned", data.myAssigned, "/queue?ownership=mine&status=open"),
    ],
    secondary: [
      metric("unassigned", "Unassigned", data.unassigned, "/queue?ownership=unassigned&status=open"),
      metric("myOpenFollowUps", "My open follow-ups", data.myOpenFollowUps, "/queue?followUpFor=me"),
    ],
    byPriority: data.byPriority.map((p) => ({
      priority: p.priority,
      value: p.value,
      drillDown: `/queue?priority=${p.priority}&status=open`,
    })),
    urgentTickets: data.urgentTickets.map(toTicketSummary),
    recentTickets: data.recentTickets.map(toTicketSummary),
    todayDelta: data.todayDelta,
  };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/staff (§4.2). IT Staff, Administrator.
// ---------------------------------------------------------------------------
dashboardRouter.get(
  "/api/dashboard/staff",
  ...protect("ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const data = await computeStaffDashboard(req.auth!.user.id);
      return res.status(200).json(staffDashboardBody(data));
    } catch (err) {
      console.error("GET /api/dashboard/staff failed:", err);
      return internalError(res, "Could not load the dashboard. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/dashboard/admin (§4.3). Administrator only — same body as staff,
// plus a user-account counts block.
// ---------------------------------------------------------------------------
dashboardRouter.get(
  "/api/dashboard/admin",
  ...protect("Administrator"),
  async (req: Request, res: Response) => {
    try {
      const [staffData, users] = await Promise.all([
        computeStaffDashboard(req.auth!.user.id),
        computeAdminUserCounts(),
      ]);
      return res.status(200).json({ ...staffDashboardBody(staffData), users });
    } catch (err) {
      console.error("GET /api/dashboard/admin failed:", err);
      return internalError(res, "Could not load the dashboard. Please try again.");
    }
  },
);

// A Requester hitting /staff or /admin, and staff hitting /admin, are
// already rejected by `protect(...)`'s role check (403) before any handler
// above runs — no extra code needed for AC-27.

export default dashboardRouter;
