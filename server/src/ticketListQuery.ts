import { REQUESTED_PRIORITIES, type RequestedPriority } from "./ticketValidation.js";

// Query parsing for the My Tickets list (api-spec.md §7).
//
// BR-26 — invalid page or page-size values are rejected with a safe
// validation response rather than silently producing unpredictable results.

/** Matches the TicketStatus enum in schema.prisma. */
export const TICKET_STATUSES = [
  "New",
  "InProgress",
  "OnHold",
  "Resolved",
  "Closed",
  "Cancelled",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** BR-23 — the sortable fields. */
export const SORTABLE_FIELDS = [
  "ticketDate",
  "ticketNumber",
  "updatedAt",
] as const;
export type SortableField = (typeof SORTABLE_FIELDS)[number];

export const SORT_ORDERS = ["asc", "desc"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/** BR-25 — supported page sizes. */
export const PAGE_SIZES = [10, 20, 50] as const;

// BR-24 — defaults.
export const DEFAULT_SORT_BY: SortableField = "updatedAt";
export const DEFAULT_SORT_ORDER: SortOrder = "desc";
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 10;

/** Guards against pathological search strings. */
export const MAX_SEARCH_LENGTH = 200;

export interface TicketListQuery {
  search: string;
  categoryId: number | null;
  requestedPriority: RequestedPriority | null;
  currentStatus: TicketStatus | null;
  sortBy: SortableField;
  sortOrder: SortOrder;
  page: number;
  pageSize: number;
}

export interface TicketListQueryResult {
  /** Present only when there are no field errors. */
  query?: TicketListQuery;
  fieldErrors: Record<string, string>;
}

/**
 * Express gives repeated query keys as arrays. Only a single scalar is
 * meaningful here, so anything else is treated as absent.
 */
function scalar(value: unknown): string | null {
  if (typeof value === "string") return value;
  return null;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

export function parseTicketListQuery(
  raw: Record<string, unknown>,
): TicketListQueryResult {
  const fieldErrors: Record<string, string> = {};

  // --- search (BR-21) ------------------------------------------------------
  let search = "";
  if (!isBlank(raw.search)) {
    const value = scalar(raw.search);
    if (value === null) {
      fieldErrors.search = "Search must be a single value.";
    } else if (value.trim().length > MAX_SEARCH_LENGTH) {
      fieldErrors.search = `Search must be ${MAX_SEARCH_LENGTH} characters or fewer.`;
    } else {
      search = value.trim();
    }
  }

  // --- filters (BR-22) -----------------------------------------------------
  let categoryId: number | null = null;
  if (!isBlank(raw.categoryId)) {
    const value = scalar(raw.categoryId);
    if (value === null || !/^\d+$/.test(value) || Number(value) <= 0) {
      fieldErrors.categoryId = "Category filter is not valid.";
    } else {
      categoryId = Number.parseInt(value, 10);
    }
  }

  let requestedPriority: RequestedPriority | null = null;
  if (!isBlank(raw.requestedPriority)) {
    const value = scalar(raw.requestedPriority);
    if (
      value === null ||
      !(REQUESTED_PRIORITIES as readonly string[]).includes(value)
    ) {
      fieldErrors.requestedPriority = "Requested priority filter is not valid.";
    } else {
      requestedPriority = value as RequestedPriority;
    }
  }

  let currentStatus: TicketStatus | null = null;
  if (!isBlank(raw.currentStatus)) {
    const value = scalar(raw.currentStatus);
    if (value === null || !(TICKET_STATUSES as readonly string[]).includes(value)) {
      fieldErrors.currentStatus = "Current status filter is not valid.";
    } else {
      currentStatus = value as TicketStatus;
    }
  }

  // --- sorting (BR-23) -----------------------------------------------------
  let sortBy: SortableField = DEFAULT_SORT_BY;
  if (!isBlank(raw.sortBy)) {
    const value = scalar(raw.sortBy);
    if (value === null || !(SORTABLE_FIELDS as readonly string[]).includes(value)) {
      fieldErrors.sortBy = `Sort field must be one of: ${SORTABLE_FIELDS.join(", ")}.`;
    } else {
      sortBy = value as SortableField;
    }
  }

  let sortOrder: SortOrder = DEFAULT_SORT_ORDER;
  if (!isBlank(raw.sortOrder)) {
    const value = scalar(raw.sortOrder);
    if (value === null || !(SORT_ORDERS as readonly string[]).includes(value)) {
      fieldErrors.sortOrder = "Sort order must be asc or desc.";
    } else {
      sortOrder = value as SortOrder;
    }
  }

  // --- pagination (BR-25, BR-26) -------------------------------------------
  let page = DEFAULT_PAGE;
  if (!isBlank(raw.page)) {
    const value = scalar(raw.page);
    if (value === null || !/^\d+$/.test(value) || Number(value) < 1) {
      fieldErrors.page = "Page must be a whole number of 1 or more.";
    } else {
      page = Number.parseInt(value, 10);
    }
  }

  let pageSize: number = DEFAULT_PAGE_SIZE;
  if (!isBlank(raw.pageSize)) {
    const value = scalar(raw.pageSize);
    const parsed = value !== null && /^\d+$/.test(value) ? Number(value) : NaN;
    if (!(PAGE_SIZES as readonly number[]).includes(parsed)) {
      fieldErrors.pageSize = `Page size must be one of: ${PAGE_SIZES.join(", ")}.`;
    } else {
      pageSize = parsed;
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  return {
    fieldErrors,
    query: {
      search,
      categoryId,
      requestedPriority,
      currentStatus,
      sortBy,
      sortOrder,
      page,
      pageSize,
    },
  };
}

/**
 * BR-24 — the requested sort, then Ticket Number descending as the documented
 * secondary sort. Sorting by Ticket Number is already unique, so it needs no
 * tie-breaker.
 */
export function buildOrderBy(
  sortBy: SortableField,
  sortOrder: SortOrder,
): Array<Record<string, SortOrder>> {
  if (sortBy === "ticketNumber") return [{ ticketNumber: sortOrder }];
  return [{ [sortBy]: sortOrder }, { ticketNumber: "desc" }];
}
