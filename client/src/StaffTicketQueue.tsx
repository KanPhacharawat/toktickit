import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  IT_PRIORITIES,
  PAGE_SIZES,
  QUEUE_SORTABLE_FIELDS,
  REQUESTED_PRIORITIES,
  TICKET_STATUSES,
  fetchCategories,
  fetchQueue,
  type QueueCounts,
  type QueueMeta,
  type QueueRow,
  type QueueSortableField,
  type ReferenceItem,
  type SortOrder,
} from "./api.js";
import { useAuth } from "./AuthContext.js";
import { priorityLabel } from "./ticketFormRules.js";

/** Turns InProgress into "In Progress" for display. */
function statusLabel(status: string): string {
  return status.replace(/([a-z])([A-Z])/g, "$1 $2");
}

type QuickView = "active" | "unassigned" | "mine" | "all" | null;

/** The filter/search/sort/page state that drives one request. */
interface Controls {
  search: string;
  /** "" (all statuses), "active", "closed", or one TicketStatus value. */
  status: string;
  ownership: "" | "mine" | "unassigned";
  itPriority: string;
  requestedPriority: string;
  categoryId: string;
  sortBy: QueueSortableField;
  sortOrder: SortOrder;
  page: number;
  pageSize: number;
}

// BR-30 / ui-spec.md §9.2 — the documented default view is Active, oldest
// Created Date first, 20 per page.
const DEFAULT_CONTROLS: Controls = {
  search: "",
  status: "active",
  ownership: "",
  itPriority: "",
  requestedPriority: "",
  categoryId: "",
  sortBy: "ticketDate",
  sortOrder: "asc",
  page: 1,
  pageSize: 20,
};

const SORT_LABELS: Record<QueueSortableField, string> = {
  ticketDate: "Created Date",
  updatedAt: "Last Updated",
  ticketNumber: "Ticket Number",
  itPriority: "IT Priority",
  requestedPriority: "Requested Priority",
};

function quickViewOf(controls: Controls): QuickView {
  if (controls.status === "active" && controls.ownership === "") return "active";
  if (controls.status === "active" && controls.ownership === "unassigned") return "unassigned";
  if (controls.status === "active" && controls.ownership === "mine") return "mine";
  if (controls.status === "" && controls.ownership === "") return "all";
  return null;
}

/**
 * True when a dropdown filter or search narrows the list, independent of
 * which quick view is selected. Drives the collapsed panel's filter count
 * (ui-spec.md §9.1) and the empty-vs-no-results distinction (§9.5): the
 * quick views themselves are documented starting points, not "filters".
 */
function hasActiveFilters(controls: Controls): boolean {
  return Boolean(
    controls.search || controls.itPriority || controls.requestedPriority || controls.categoryId,
  );
}

export default function StaffTicketQueue() {
  const { user } = useAuth();

  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS);
  const [searchDraft, setSearchDraft] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [meta, setMeta] = useState<QueueMeta | null>(null);
  const [counts, setCounts] = useState<QueueCounts | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [invalidQueryWarning, setInvalidQueryWarning] = useState(false);

  const [categories, setCategories] = useState<ReferenceItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchCategories()
      .then((loaded) => !cancelled && setCategories(loaded))
      .catch(() => !cancelled && setCategories([]));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    setLoadState("loading");
    setErrorMessage("");

    const statusGroup = controls.status === "active" || controls.status === "closed" ? controls.status : "";
    const currentStatus =
      controls.status !== "" && controls.status !== "active" && controls.status !== "closed"
        ? controls.status
        : "";

    fetchQueue({
      search: controls.search,
      statusGroup,
      currentStatus,
      ownership: controls.ownership,
      itPriority: controls.itPriority,
      requestedPriority: controls.requestedPriority,
      categoryId: controls.categoryId,
      sortBy: controls.sortBy,
      sortOrder: controls.sortOrder,
      page: controls.page,
      pageSize: controls.pageSize,
    })
      .then((response) => {
        if (cancelled) return;
        setRows(response.data);
        setMeta(response.meta);
        setCounts(response.meta.counts);
        setLoadState("ready");
        setInvalidQueryWarning(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRows([]);
        setMeta(null);
        if (err instanceof ApiError && err.status === 400) {
          // BR-31 — an invalid query resets to the documented defaults.
          setInvalidQueryWarning(true);
          setControls(DEFAULT_CONTROLS);
          setSearchDraft("");
          return;
        }
        setErrorMessage(
          err instanceof ApiError ? err.message : "Could not load the queue. Please try again.",
        );
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [controls, reloadToken]);

  /** Any control change other than paging returns to page 1 (BR-31). */
  const updateControls = useCallback((patch: Partial<Controls>) => {
    setControls((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  }, []);

  function selectQuickView(view: QuickView) {
    if (view === "active") updateControls({ status: "active", ownership: "" });
    else if (view === "unassigned") updateControls({ status: "active", ownership: "unassigned" });
    else if (view === "mine") updateControls({ status: "active", ownership: "mine" });
    else updateControls({ status: "", ownership: "" });
  }

  function clearFilters() {
    setSearchDraft("");
    setControls(DEFAULT_CONTROLS);
  }

  if (!user) return null;

  const currentQuickView = quickViewOf(controls);
  const filtersActive = hasActiveFilters(controls);
  const activeFilterCount = [
    controls.status !== "active" ? controls.status || "all" : "",
    controls.ownership,
    controls.itPriority,
    controls.requestedPriority,
    controls.categoryId,
  ].filter(Boolean).length;
  const totalPages = meta?.totalPages ?? 0;
  const showLoading = loadState === "loading";
  const showEmpty = loadState === "ready" && rows.length === 0 && !filtersActive && currentQuickView === "all";
  const showNoResults = loadState === "ready" && rows.length === 0 && !showEmpty;

  return (
    <main className="container py-4">
      <h1 className="zen-title h4 mb-3">Ticket Queue</h1>

      {invalidQueryWarning && (
        <div className="alert zen-warning-banner mb-3" role="alert">
          Some filters were not valid and have been reset.
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Quick views                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="d-flex flex-wrap gap-2 mb-3"
        role="group"
        aria-label="Quick views"
      >
        {(
          [
            ["active", "Active"],
            ["unassigned", "Unassigned"],
            ["mine", "Assigned to Me"],
          ] as const
        ).map(([view, label]) => (
          <button
            key={view}
            type="button"
            className="btn zen-btn-outline"
            aria-pressed={currentQuickView === view}
            onClick={() => selectQuickView(view)}
          >
            {`${label} (${counts ? counts[view === "mine" ? "assignedToMe" : view] : "–"})`}
          </button>
        ))}
        <button
          type="button"
          className="btn zen-btn-outline"
          aria-pressed={currentQuickView === "all"}
          onClick={() => selectQuickView("all")}
        >
          All
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Search and filters                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section className="zen-card p-3 p-md-4 mb-3" aria-label="Search and filters">
        <form
          className="row g-3 align-items-end"
          role="search"
          aria-label="Search tickets"
          onSubmit={(e) => {
            e.preventDefault();
            updateControls({ search: searchDraft.trim() });
          }}
        >
          <div className="col-12 col-lg-8">
            <label className="form-label fw-semibold" htmlFor="queue-search">
              Search
            </label>
            <div className="d-flex gap-2">
              <input
                id="queue-search"
                type="search"
                className="form-control zen-input"
                placeholder="Ticket number, summary, or requester"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
              />
              <button type="submit" className="btn zen-btn-primary flex-shrink-0">
                Search
              </button>
            </div>
          </div>
          <div className="col-12 col-lg-4 d-flex align-items-end gap-2">
            <button
              type="button"
              className="btn zen-btn-outline w-100"
              aria-expanded={filtersOpen}
              aria-controls="queue-filter-panel"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <span aria-hidden="true" className="zen-disclosure">
                {filtersOpen ? "−" : "+"}
              </span>
              {filtersOpen ? "Hide filters" : "Filters"}
              {activeFilterCount > 0 && (
                <>
                  <span className="zen-filter-count" aria-hidden="true">
                    {activeFilterCount}
                  </span>
                  <span className="visually-hidden">{` (${activeFilterCount} active)`}</span>
                </>
              )}
            </button>
          </div>
        </form>

        <div id="queue-filter-panel" className="row g-3 align-items-end mt-0" hidden={!filtersOpen}>
          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label fw-semibold" htmlFor="filter-status">
              Status
            </label>
            <select
              id="filter-status"
              className="form-select zen-select"
              value={controls.status}
              onChange={(e) => updateControls({ status: e.target.value, ownership: "" })}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="closed">Closed or Cancelled</option>
              {TICKET_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label fw-semibold" htmlFor="filter-ownership">
              Ownership
            </label>
            <select
              id="filter-ownership"
              className="form-select zen-select"
              value={controls.ownership}
              onChange={(e) => updateControls({ ownership: e.target.value as Controls["ownership"] })}
            >
              <option value="">Any</option>
              <option value="mine">Assigned to Me</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>

          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label fw-semibold" htmlFor="filter-it-priority">
              IT Priority
            </label>
            <select
              id="filter-it-priority"
              className="form-select zen-select"
              value={controls.itPriority}
              onChange={(e) => updateControls({ itPriority: e.target.value })}
            >
              <option value="">Any</option>
              {IT_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priorityLabel(priority)}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label fw-semibold" htmlFor="filter-requested-priority">
              Requested Priority
            </label>
            <select
              id="filter-requested-priority"
              className="form-select zen-select"
              value={controls.requestedPriority}
              onChange={(e) => updateControls({ requestedPriority: e.target.value })}
            >
              <option value="">Any</option>
              {REQUESTED_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priorityLabel(priority)}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label fw-semibold" htmlFor="filter-category">
              Category
            </label>
            <select
              id="filter-category"
              className="form-select zen-select"
              value={controls.categoryId}
              onChange={(e) => updateControls({ categoryId: e.target.value })}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label fw-semibold" htmlFor="sort-by">
              Sort by
            </label>
            <select
              id="sort-by"
              className="form-select zen-select"
              value={controls.sortBy}
              onChange={(e) => updateControls({ sortBy: e.target.value as QueueSortableField })}
            >
              {QUEUE_SORTABLE_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {SORT_LABELS[field]}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label fw-semibold" htmlFor="sort-order">
              Order
            </label>
            <select
              id="sort-order"
              className="form-select zen-select"
              value={controls.sortOrder}
              onChange={(e) => updateControls({ sortOrder: e.target.value as SortOrder })}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>

          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label fw-semibold" htmlFor="page-size">
              Per page
            </label>
            <select
              id="page-size"
              className="form-select zen-select"
              value={controls.pageSize}
              onChange={(e) => updateControls({ pageSize: Number(e.target.value) })}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-lg-6 d-flex align-items-end">
            <button
              type="button"
              className="btn zen-btn-outline"
              onClick={clearFilters}
              disabled={!filtersActive && controls.page === 1}
            >
              Clear filters
            </button>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* States                                                             */}
      {/* ------------------------------------------------------------------ */}
      {showLoading && (
        <div className="zen-card p-4" role="status" aria-busy="true" aria-live="polite">
          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
          <span className="visually-hidden">Loading tickets…</span>
          Loading tickets…
        </div>
      )}

      {loadState === "error" && (
        <div className="zen-card p-4">
          <div className="alert zen-error-banner" role="alert">
            <strong>Could not load the queue.</strong>
            <p className="mb-0 mt-1 small">{errorMessage}</p>
          </div>
          <button type="button" className="btn zen-btn-outline" onClick={() => setReloadToken((t) => t + 1)}>
            Retry
          </button>
        </div>
      )}

      {showEmpty && (
        <div className="zen-card p-4 text-center" data-testid="empty-state">
          <p className="fw-semibold mb-0">There are no tickets in the system yet.</p>
        </div>
      )}

      {showNoResults && (
        <div className="zen-card p-4 text-center" data-testid="no-results-state">
          <p className="fw-semibold mb-1">
            {currentQuickView === "unassigned"
              ? "No unassigned active tickets."
              : "No tickets match this view."}
          </p>
          <button type="button" className="btn zen-btn-outline" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Results                                                            */}
      {/* ------------------------------------------------------------------ */}
      {loadState === "ready" && rows.length > 0 && meta && (
        <>
          <p className="text-secondary small" role="status">
            {`Showing ${(meta.page - 1) * meta.pageSize + 1}–${
              (meta.page - 1) * meta.pageSize + rows.length
            } of ${meta.totalItems} tickets`}
          </p>

          <div className="zen-card table-responsive">
            <table className="table zen-table mb-0">
              <caption className="visually-hidden">IT Staff Ticket Queue</caption>
              <thead>
                <tr>
                  <th scope="col">Ticket</th>
                  <th scope="col">Summary</th>
                  <th scope="col">Req. Priority</th>
                  <th scope="col">IT Priority</th>
                  <th scope="col">Status</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Last Updated</th>
                </tr>
              </thead>
              <tbody data-testid="queue-rows">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="text-nowrap">
                      <div className="fw-semibold">{row.ticketNumber}</div>
                      <div className="text-secondary small">
                        {new Date(row.ticketDate).toLocaleDateString()}
                      </div>
                    </td>
                    <td>
                      <div>{row.summary}</div>
                      <div className="text-secondary small">
                        {row.requester.name} · {row.category.name}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`zen-badge zen-priority-${row.requestedPriority.toLowerCase()}`}
                      >
                        {priorityLabel(row.requestedPriority)}
                      </span>
                    </td>
                    <td>
                      <span className={`zen-badge zen-priority-${row.itPriority.toLowerCase()}`}>
                        {`IT: ${priorityLabel(row.itPriority)}`}
                      </span>
                    </td>
                    <td>
                      <span className="zen-badge zen-status">{statusLabel(row.currentStatus)}</span>
                      {row.problemAppearsResolvedAt && (
                        <>
                          {" "}
                          <span className="zen-badge zen-status">Problem appears resolved</span>
                        </>
                      )}
                    </td>
                    <td>
                      <span className="zen-badge zen-status">
                        {row.ticketOwner
                          ? row.ticketOwner.id === user.id
                            ? "You"
                            : row.ticketOwner.name
                          : "Unassigned"}
                      </span>
                    </td>
                    <td className="text-nowrap" title={new Date(row.updatedAt).toLocaleString()}>
                      {new Date(row.updatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav className="d-flex flex-wrap align-items-center gap-2 mt-3" aria-label="Queue pagination">
            <span className="me-auto" />
            <button
              type="button"
              className="btn btn-sm zen-btn-outline"
              onClick={() => updateControls({ page: meta.page - 1 })}
              disabled={meta.page <= 1}
            >
              Previous
            </button>
            <span className="small" data-testid="page-indicator">
              {`Page ${meta.page} of ${Math.max(totalPages, 1)}`}
            </span>
            <button
              type="button"
              className="btn btn-sm zen-btn-outline"
              onClick={() => updateControls({ page: meta.page + 1 })}
              disabled={meta.page >= totalPages}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </main>
  );
}
