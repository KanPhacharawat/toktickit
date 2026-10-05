import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  fetchAdminDashboard,
  fetchStaffDashboard,
  type AdminDashboardData,
  type AdminRole,
  type DashboardTicketSummary,
  type StaffDashboardData,
} from "./api.js";
import { useAuth } from "./AuthContext.js";
import Forbidden from "./Forbidden.js";
import { priorityIcon, priorityLabel } from "./ticketFormRules.js";
import type { StaffQueueDrillDownFilters } from "./StaffTicketQueue.js";
import type { UserListDrillDownFilters } from "./UserManagement.js";

/** Turns InProgress into "In Progress" for display. */
function statusLabel(status: string): string {
  return status.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Lab 4 ui-spec.md §3.2 — maps a staff dashboard metric's `key` to the queue
 * filters it drills down to. There is no client-side router in this app, so
 * the metric's documented `drillDown` URL (api-spec.md §4.2) is represented
 * here as a filter object instead of a literal link.
 */
const METRIC_DRILL_DOWN: Record<string, StaffQueueDrillDownFilters> = {
  new: { status: "New" },
  open: { status: "Open,Reopened" },
  inProgress: { status: "InProgress" },
  waitingForRequester: { status: "WaitingForRequester" },
  myAssigned: { ownership: "mine", status: "open" },
  unassigned: { ownership: "unassigned", status: "open" },
  myOpenFollowUps: { followUpFor: "me" },
};

function SkeletonCard() {
  return (
    <div className="zen-card zen-skeleton-card" aria-hidden="true">
      <div className="zen-skeleton-line zen-skeleton-line-sm" />
      <div className="zen-skeleton-line zen-skeleton-line-lg" />
    </div>
  );
}

function MetricCard({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="zen-card zen-metric-card zen-focusable"
      onClick={onClick}
      aria-label={`${label}: ${value}, view all`}
    >
      <span className="text-secondary small fw-semibold">{label}</span>
      <span className="zen-metric-value">{value}</span>
      <span className="zen-link-text">View all</span>
    </button>
  );
}

function TicketRow({
  ticket,
  onOpenTicket,
}: {
  ticket: DashboardTicketSummary;
  onOpenTicket: (id: number) => void;
}) {
  return (
    <li className="zen-dashboard-row">
      <button
        type="button"
        className="zen-link-button"
        onClick={() => onOpenTicket(ticket.id)}
      >
        {ticket.ticketNumber}
        <span className="visually-hidden"> — open detail</span>
      </button>
      <span className="zen-dashboard-row-title" title={ticket.summary}>
        {ticket.summary}
      </span>
      <span
        className={`zen-badge zen-priority-${ticket.itPriority.toLowerCase()}`}
      >
        {priorityIcon(ticket.itPriority)}
        {priorityLabel(ticket.itPriority)}
      </span>
      <span className="zen-badge zen-status">
        {statusLabel(ticket.currentStatus)}
      </span>
      <span
        className="text-secondary small"
        title={new Date(ticket.updatedAt).toLocaleString()}
      >
        {relativeTime(ticket.updatedAt)}
      </span>
    </li>
  );
}

/**
 * IT Staff and Administrator home — Lab 4 ui-spec.md §3. Administrators get
 * the same layout plus a Users card (FR-20, BR-44); everything else is
 * identical, since the API bodies only differ by that one block.
 */
export default function StaffDashboard({
  onOpenTicket,
  onOpenQueue,
  onOpenUsers,
}: {
  onOpenTicket: (ticketId: number) => void;
  onOpenQueue: (filters?: StaffQueueDrillDownFilters) => void;
  onOpenUsers?: (filters?: UserListDrillDownFilters) => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "Administrator";

  const [data, setData] = useState<
    StaffDashboardData | AdminDashboardData | null
  >(null);
  const [loadState, setLoadState] = useState<
    "loading" | "ready" | "error" | "forbidden"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh: boolean, isCancelled: () => boolean = () => false) => {
      if (isRefresh) setRefreshing(true);
      else setLoadState("loading");
      setErrorMessage("");
      try {
        const result = isAdmin
          ? await fetchAdminDashboard()
          : await fetchStaffDashboard();
        if (isCancelled()) return;
        setData(result);
        setLoadState("ready");
        setUpdatedAt(new Date());
      } catch (err) {
        if (isCancelled()) return;
        if (err instanceof ApiError && err.status === 403) {
          setLoadState("forbidden");
          return;
        }
        setData(null);
        setErrorMessage(
          err instanceof ApiError
            ? err.message
            : "Could not load the dashboard. Please try again.",
        );
        setLoadState("error");
      } finally {
        if (!isCancelled() && isRefresh) setRefreshing(false);
      }
    },
    [isAdmin],
  );

  useEffect(() => {
    let cancelled = false;
    void load(false, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (!user) return null;

  if (loadState === "forbidden") {
    return <Forbidden onGoToDashboard={() => void load(false)} />;
  }

  const firstName = user.name.split(" ")[0];
  const updatedLabel = updatedAt
    ? updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <main className="container py-4">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-3">
        <div>
          <h1 className="zen-title h4 mb-1">{`Welcome back, ${firstName}!`}</h1>
          <p className="text-secondary mb-0">
            Here&apos;s what&apos;s happening with your queue today.
          </p>
        </div>
        <div className="text-md-end">
          <button
            type="button"
            className="btn zen-btn-outline"
            onClick={() => void load(true)}
            disabled={refreshing || loadState === "loading"}
            aria-busy={refreshing}
          >
            <span aria-hidden="true">{"⟳ "}</span>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          {updatedLabel && (
            <div className="text-secondary small mt-1">{`Updated ${updatedLabel}`}</div>
          )}
        </div>
      </div>

      {loadState === "loading" && (
        <div aria-busy="true" aria-live="polite">
          <span className="visually-hidden">Loading dashboard…</span>
          <div className="zen-metric-grid mb-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
          <div className="zen-card p-4">
            <div className="zen-skeleton-line zen-skeleton-line-row" />
            <div className="zen-skeleton-line zen-skeleton-line-row" />
            <div className="zen-skeleton-line zen-skeleton-line-row" />
          </div>
        </div>
      )}

      {loadState === "error" && (
        <div className="zen-card p-4">
          <div className="alert zen-error-banner" role="alert">
            <strong>We couldn&apos;t load the dashboard.</strong>
            <p className="mb-0 mt-1 small">{errorMessage}</p>
          </div>
          <button
            type="button"
            className="btn zen-btn-outline"
            onClick={() => void load(false)}
          >
            Retry
          </button>
        </div>
      )}

      {loadState === "ready" && data && (
        <>
          <div
            className="zen-metric-grid mb-3"
            role="group"
            aria-label="Queue metrics"
          >
            {data.metrics.map((metric) => (
              <MetricCard
                key={metric.key}
                label={metric.label}
                value={metric.value}
                onClick={() => onOpenQueue(METRIC_DRILL_DOWN[metric.key])}
              />
            ))}
          </div>

          <div className="zen-dashboard-columns">
            <div className="zen-dashboard-column">
              <section
                className="zen-card p-3 p-md-4 mb-3"
                aria-label="Urgent Tickets"
              >
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <h2 className="zen-title h6 mb-0">
                    Urgent Tickets (High/Urgent)
                  </h2>
                  <button
                    type="button"
                    className="zen-link-button"
                    onClick={() =>
                      onOpenQueue({ itPriority: "URGENT", status: "open" })
                    }
                  >
                    View all
                  </button>
                </div>
                {data.urgentTickets.length === 0 ? (
                  <p className="text-secondary small mb-0">
                    No tickets here yet.
                  </p>
                ) : (
                  <ul className="list-unstyled mb-0 zen-dashboard-list">
                    {data.urgentTickets.map((ticket) => (
                      <TicketRow
                        key={ticket.id}
                        ticket={ticket}
                        onOpenTicket={onOpenTicket}
                      />
                    ))}
                  </ul>
                )}
              </section>

              <section
                className="zen-card p-3 p-md-4"
                aria-label="Recent Tickets"
              >
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <h2 className="zen-title h6 mb-0">Recent Tickets</h2>
                  <button
                    type="button"
                    className="zen-link-button"
                    onClick={() => onOpenQueue({ status: "active" })}
                  >
                    View all
                  </button>
                </div>
                {data.recentTickets.length === 0 ? (
                  <p className="text-secondary small mb-0">
                    No tickets here yet.
                  </p>
                ) : (
                  <ul className="list-unstyled mb-0 zen-dashboard-list">
                    {data.recentTickets.map((ticket) => (
                      <TicketRow
                        key={ticket.id}
                        ticket={ticket}
                        onOpenTicket={onOpenTicket}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="zen-dashboard-column">
              <section
                className="zen-card p-3 p-md-4 mb-3"
                aria-label="Quick Actions"
              >
                <h2 className="zen-title h6 mb-2">Quick Actions</h2>
                <div className="d-flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn zen-btn-primary"
                    onClick={() => onOpenQueue()}
                  >
                    {"Search Tickets"}
                  </button>
                  <button
                    type="button"
                    className="btn zen-btn-outline"
                    onClick={() =>
                      onOpenQueue({ ownership: "mine", status: "open" })
                    }
                  >
                    My Queue
                  </button>
                </div>
              </section>

              <section
                className="zen-card p-3 p-md-4 mb-3"
                aria-label="At a glance"
              >
                <h2 className="zen-title h6 mb-2">At a glance</h2>
                <ul className="list-unstyled mb-0 zen-glance-list">
                  {data.secondary.map((metric) => (
                    <li key={metric.key}>
                      <button
                        type="button"
                        className="zen-link-button zen-glance-item"
                        onClick={() =>
                          onOpenQueue(METRIC_DRILL_DOWN[metric.key])
                        }
                      >
                        <span>{metric.label}</span>
                        <span className="fw-semibold">{`${metric.value} →`}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-secondary small mt-3 mb-2">By priority</p>
                <div className="d-flex flex-wrap gap-2">
                  {data.byPriority.map((entry) => (
                    <button
                      key={entry.priority}
                      type="button"
                      className={`zen-badge zen-priority-${entry.priority.toLowerCase()} zen-link-badge`}
                      onClick={() =>
                        onOpenQueue({
                          itPriority: entry.priority,
                          status: "open",
                        })
                      }
                    >
                      {`${priorityIcon(entry.priority)}${priorityLabel(entry.priority)}: ${entry.value}`}
                    </button>
                  ))}
                </div>
              </section>

              {isAdmin && "users" in data && (
                <section className="zen-card p-3 p-md-4" aria-label="Users">
                  <h2 className="zen-title h6 mb-2">Users</h2>
                  <ul className="list-unstyled mb-0 zen-glance-list">
                    {(["Requester", "ITStaff", "Administrator"] as const).map(
                      (role: AdminRole) => (
                        <li key={role}>
                          <button
                            type="button"
                            className="zen-link-button zen-glance-item"
                            onClick={() =>
                              onOpenUsers?.({ role, active: "true" })
                            }
                          >
                            <span>{`Active ${role === "ITStaff" ? "IT Staff" : `${role}s`}`}</span>
                            <span className="fw-semibold">
                              {data.users.active[role]}
                            </span>
                          </button>
                        </li>
                      ),
                    )}
                    <li>
                      <button
                        type="button"
                        className="zen-link-button zen-glance-item"
                        onClick={() => onOpenUsers?.({ active: "false" })}
                      >
                        <span>Inactive</span>
                        <span className="fw-semibold">
                          {data.users.inactive}
                        </span>
                      </button>
                    </li>
                  </ul>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
