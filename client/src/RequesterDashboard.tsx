import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  fetchRequesterDashboard,
  type DashboardTicketSummary,
  type RequesterDashboardData,
} from "./api.js";
import { useAuth } from "./AuthContext.js";
import type { MyTicketsDrillDownFilters } from "./MyTickets.js";

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
 * ui-spec.md §4 — a metric's `drillDown` (e.g. "/my-tickets?status=open") is
 * the same filter My Tickets already understands, so it is read straight out
 * of the card instead of duplicating a key → filter map.
 */
function drillDownFilters(drillDown: string): MyTicketsDrillDownFilters {
  const query = drillDown.split("?")[1] ?? "";
  return { status: new URLSearchParams(query).get("status") ?? undefined };
}

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

/** Requester home — Lab 4 ui-spec.md §4. */
export default function RequesterDashboard({
  onOpenTicket,
  onOpenMyTickets,
  onCreateTicket,
}: {
  onOpenTicket: (ticketId: number) => void;
  onOpenMyTickets: (filters?: MyTicketsDrillDownFilters) => void;
  onCreateTicket: () => void;
}) {
  const { user } = useAuth();

  const [data, setData] = useState<RequesterDashboardData | null>(null);
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
        const result = await fetchRequesterDashboard();
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
    [],
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
    return (
      <main className="container py-4">
        <div className="alert zen-error-banner" role="alert">
          You don&apos;t have permission to view this dashboard.
        </div>
      </main>
    );
  }

  const firstName = user.name.split(" ")[0];
  const updatedLabel = updatedAt
    ? updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  // ui-spec.md §4 — empty state when the Requester has no tickets at all.
  const isEmpty =
    Boolean(data) &&
    data!.metrics.every((metric) => metric.value === 0) &&
    data!.needsAttention.length === 0 &&
    data!.recentTickets.length === 0;

  return (
    <main className="container py-4">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-3">
        <div>
          <h1 className="zen-title h4 mb-1">{`Welcome, ${firstName}!`}</h1>
          <p className="text-secondary mb-0">
            Here&apos;s the latest on your requests.
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
            aria-label="Ticket metrics"
          >
            {data.metrics.map((metric) => (
              <MetricCard
                key={metric.key}
                label={metric.label}
                value={metric.value}
                onClick={() => onOpenMyTickets(drillDownFilters(metric.drillDown))}
              />
            ))}
          </div>

          {isEmpty ? (
            <div className="zen-card p-4 text-center" data-testid="empty-state">
              <p className="fw-semibold mb-1">
                You haven&apos;t submitted any tickets yet.
              </p>
              <p className="text-secondary small">
                Create your first ticket to get started.
              </p>
              <button
                type="button"
                className="btn zen-btn-primary"
                onClick={onCreateTicket}
              >
                Create Ticket
              </button>
            </div>
          ) : (
            <div className="zen-dashboard-columns">
              <div className="zen-dashboard-column">
                <section
                  className="zen-card p-3 p-md-4 mb-3"
                  aria-label="Needs your attention"
                >
                  <h2 className="zen-title h6 mb-1">Needs your attention</h2>
                  <p className="text-secondary small mb-2">
                    Reply to IT or confirm the fix.
                  </p>
                  {data.needsAttention.length === 0 ? (
                    <p className="text-secondary small mb-0">
                      No tickets here yet.
                    </p>
                  ) : (
                    <ul className="list-unstyled mb-0 zen-dashboard-list">
                      {data.needsAttention.map((ticket) => (
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
                  aria-label="My Recent Tickets"
                >
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <h2 className="zen-title h6 mb-0">My Recent Tickets</h2>
                    <button
                      type="button"
                      className="zen-link-button"
                      onClick={() => onOpenMyTickets()}
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
                  className="zen-card p-3 p-md-4"
                  aria-label="Quick Actions"
                >
                  <h2 className="zen-title h6 mb-2">Quick Actions</h2>
                  <div className="d-flex flex-column gap-2">
                    <button
                      type="button"
                      className="btn zen-btn-primary text-start"
                      onClick={onCreateTicket}
                    >
                      <span className="d-block">{"+ Create Ticket"}</span>
                      <span className="d-block small fw-normal">
                        Submit a new request
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn zen-btn-outline text-start"
                      onClick={() => onOpenMyTickets()}
                    >
                      <span className="d-block">{"🗂 View My Tickets"}</span>
                      <span className="d-block small fw-normal">
                        Track existing requests
                      </span>
                    </button>
                  </div>
                </section>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
