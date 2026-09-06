import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  PAGE_SIZES,
  REQUESTED_PRIORITIES,
  SORTABLE_FIELDS,
  TICKET_STATUSES,
  fetchCategories,
  fetchMyTickets,
  type ReferenceItem,
  type SortOrder,
  type SortableField,
  type TicketListMeta,
  type TicketListRow,
} from "./api.js";
import { useRequester } from "./RequesterContext.js";
import { priorityLabel } from "./ticketFormRules.js";

/** The filter/search/sort/page state that drives one request. */
interface ListControls {
  search: string;
  categoryId: string;
  requestedPriority: string;
  currentStatus: string;
  sortBy: SortableField;
  sortOrder: SortOrder;
  page: number;
  pageSize: number;
}

// BR-24 / BR-25 — documented defaults.
const DEFAULT_CONTROLS: ListControls = {
  search: "",
  categoryId: "",
  requestedPriority: "",
  currentStatus: "",
  sortBy: "updatedAt",
  sortOrder: "desc",
  page: 1,
  pageSize: 10,
};

const SORT_LABELS: Record<SortableField, string> = {
  updatedAt: "Last Updated",
  ticketDate: "Ticket Date",
  ticketNumber: "Ticket Number",
};

/** Turns InProgress into "In Progress" for display. */
function statusLabel(status: string): string {
  return status.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** True when the user has narrowed the list in any way (BR-27 vs BR-28). */
function hasActiveFilters(controls: ListControls): boolean {
  return Boolean(
    controls.search ||
      controls.categoryId ||
      controls.requestedPriority ||
      controls.currentStatus,
  );
}

export default function MyTickets({
  onCreateTicket,
}: {
  onCreateTicket?: () => void;
}) {
  const { selectedRequester } = useRequester();

  const [controls, setControls] = useState<ListControls>(DEFAULT_CONTROLS);
  // The search box is separate from `controls.search`: it only takes effect
  // when the search form is submitted, so typing does not fire a request per
  // keystroke.
  const [searchDraft, setSearchDraft] = useState("");
  // Collapsed by default: the list is what the user came for, and the six
  // filter controls push it below the fold otherwise.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [rows, setRows] = useState<TicketListRow[]>([]);
  const [meta, setMeta] = useState<TicketListMeta | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const [categories, setCategories] = useState<ReferenceItem[]>([]);

  const requesterId = selectedRequester?.id ?? null;

  // Categories drive the Category filter (FR-30). A failure here only costs
  // the filter, so it does not fail the whole screen.
  useEffect(() => {
    let cancelled = false;
    fetchCategories()
      .then((loaded) => !cancelled && setCategories(loaded))
      .catch(() => !cancelled && setCategories([]));
    return () => {
      cancelled = true;
    };
  }, []);

  // BR-07 / AC-04 — requesterId is a dependency, so switching Requester
  // reloads the list for the new owner.
  useEffect(() => {
    if (requesterId === null) return;
    let cancelled = false;

    setLoadState("loading");
    setErrorMessage("");

    fetchMyTickets(requesterId, {
      search: controls.search,
      categoryId: controls.categoryId,
      requestedPriority: controls.requestedPriority,
      currentStatus: controls.currentStatus,
      sortBy: controls.sortBy,
      sortOrder: controls.sortOrder,
      page: controls.page,
      pageSize: controls.pageSize,
    })
      .then((response) => {
        if (cancelled) return;
        setRows(response.data);
        setMeta(response.meta);
        setLoadState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRows([]);
        setMeta(null);
        setErrorMessage(
          err instanceof ApiError
            ? err.message
            : "Could not load tickets. Please try again.",
        );
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [requesterId, controls, reloadToken]);

  /** Any control change other than paging returns to page 1 (BR-25). */
  const updateControls = useCallback(
    (patch: Partial<ListControls>) => {
      setControls((current) => ({
        ...current,
        ...patch,
        page: patch.page ?? 1,
      }));
    },
    [],
  );

  function clearFilters() {
    setSearchDraft("");
    setControls(DEFAULT_CONTROLS);
  }

  if (!selectedRequester) return null;

  const filtersActive = hasActiveFilters(controls);
  // Counts only the dropdown filters: the search box stays visible, so it
  // needs no reminder that it is set.
  const activeFilterCount = [
    controls.categoryId,
    controls.requestedPriority,
    controls.currentStatus,
  ].filter(Boolean).length;
  const totalPages = meta?.totalPages ?? 0;
  const showNoResults = loadState === "ready" && rows.length === 0 && filtersActive;
  const showEmpty = loadState === "ready" && rows.length === 0 && !filtersActive;

  return (
    <main className="container py-4">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="zen-title h4 mb-0 me-auto">My Tickets</h1>
        {onCreateTicket && (
          <button
            type="button"
            className="btn zen-btn-primary"
            onClick={onCreateTicket}
          >
            Create Ticket
          </button>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Controls                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section
        className="zen-card p-3 p-md-4 mb-3"
        aria-label="Search and filters"
      >
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
            <label className="form-label fw-semibold" htmlFor="ticket-search">
              Search
            </label>
            <div className="d-flex gap-2">
              <input
                id="ticket-search"
                type="search"
                className="form-control zen-input"
                placeholder="Ticket number or summary"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
              />
              <button type="submit" className="btn zen-btn-primary flex-shrink-0">
                Search
              </button>
            </div>
          </div>
          {/* The toggle sits beside the search box so the panel below can stay
              closed until it is wanted (the six controls are tall on mobile). */}
          <div className="col-12 col-lg-4 d-flex align-items-end gap-2">
            <button
              type="button"
              className="btn zen-btn-outline w-100"
              aria-expanded={filtersOpen}
              aria-controls="ticket-filter-panel"
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
                  <span className="visually-hidden">
                    {` (${activeFilterCount} active)`}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>

        <div
          id="ticket-filter-panel"
          className="row g-3 align-items-end mt-0"
          hidden={!filtersOpen}
        >
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
            <label className="form-label fw-semibold" htmlFor="filter-priority">
              Requested Priority
            </label>
            <select
              id="filter-priority"
              className="form-select zen-select"
              value={controls.requestedPriority}
              onChange={(e) =>
                updateControls({ requestedPriority: e.target.value })
              }
            >
              <option value="">All priorities</option>
              {REQUESTED_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priorityLabel(priority)}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label fw-semibold" htmlFor="filter-status">
              Current Status
            </label>
            <select
              id="filter-status"
              className="form-select zen-select"
              value={controls.currentStatus}
              onChange={(e) => updateControls({ currentStatus: e.target.value })}
            >
              <option value="">All statuses</option>
              {TICKET_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
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
              onChange={(e) =>
                updateControls({ sortBy: e.target.value as SortableField })
              }
            >
              {SORTABLE_FIELDS.map((field) => (
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
              onChange={(e) =>
                updateControls({ sortOrder: e.target.value as SortOrder })
              }
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
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
              onChange={(e) =>
                updateControls({ pageSize: Number(e.target.value) })
              }
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

      {/* ---------------------------------------------------------------- */}
      {/* States                                                            */}
      {/* ---------------------------------------------------------------- */}
      {loadState === "loading" && (
        <div className="zen-card p-4" role="status" aria-live="polite">
          <span
            className="spinner-border spinner-border-sm me-2"
            aria-hidden="true"
          />
          Loading tickets…
        </div>
      )}

      {loadState === "error" && (
        <div className="zen-card p-4">
          <div className="alert zen-error-banner" role="alert">
            <strong>Could not load your tickets.</strong>
            <p className="mb-0 mt-1 small">{errorMessage}</p>
          </div>
          <button
            type="button"
            className="btn zen-btn-outline"
            onClick={() => setReloadToken((t) => t + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {showEmpty && (
        <div className="zen-card p-4 text-center" data-testid="empty-state">
          <p className="fw-semibold mb-1">You have no tickets yet.</p>
          <p className="text-secondary small">
            Create your first ticket to get started.
          </p>
          {onCreateTicket && (
            <button
              type="button"
              className="btn zen-btn-primary"
              onClick={onCreateTicket}
            >
              Create Ticket
            </button>
          )}
        </div>
      )}

      {showNoResults && (
        <div className="zen-card p-4 text-center" data-testid="no-results-state">
          <p className="fw-semibold mb-1">No tickets match your search.</p>
          <p className="text-secondary small">
            Try a different term, or clear the filters to see all your tickets.
          </p>
          <button
            type="button"
            className="btn zen-btn-outline"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Results                                                           */}
      {/* ---------------------------------------------------------------- */}
      {loadState === "ready" && rows.length > 0 && (
        <>
          <div className="zen-card table-responsive">
            <table className="table zen-table mb-0">
              <caption className="visually-hidden">
                Tickets belonging to {selectedRequester.name}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Ticket Number</th>
                  <th scope="col">Summary</th>
                  <th scope="col">Category</th>
                  <th scope="col">Requested Priority</th>
                  <th scope="col">Current Status</th>
                  <th scope="col">Last Updated</th>
                </tr>
              </thead>
              <tbody data-testid="ticket-rows">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="text-nowrap fw-semibold">
                      {row.ticketNumber}
                    </td>
                    <td>{row.summary}</td>
                    <td>{row.category}</td>
                    <td>
                      <span
                        className={`zen-badge zen-priority-${row.requestedPriority.toLowerCase()}`}
                      >
                        {priorityLabel(row.requestedPriority)}
                      </span>
                    </td>
                    <td>
                      <span className="zen-badge zen-status">
                        {statusLabel(row.currentStatus)}
                      </span>
                    </td>
                    <td className="text-nowrap">
                      {new Date(row.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && (
            <nav
              className="d-flex flex-wrap align-items-center gap-2 mt-3"
              aria-label="Ticket pagination"
            >
              <p className="text-secondary small mb-0 me-auto" role="status">
                {`Showing ${(meta.page - 1) * meta.pageSize + 1}–${
                  (meta.page - 1) * meta.pageSize + rows.length
                } of ${meta.totalItems}`}
              </p>

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
          )}
        </>
      )}
    </main>
  );
}
