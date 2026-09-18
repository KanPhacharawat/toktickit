import { REQUESTED_PRIORITIES, type RequestedPriority } from "./ticketValidation.js";
import { TICKET_STATUSES, type TicketStatus } from "./ticketListQuery.js";

// Query parsing for the IT Staff Ticket Queue (api-spec.md §7.1).
//
// BR-29 — filters are optional and combine with AND. BR-30 — sortable fields,
// priority order, and defaults. BR-31 — pagination and invalid-query rules.

export const IT_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type ItPriority = (typeof IT_PRIORITIES)[number];

/** BR-29 — Closed and Cancelled are the only "closed" statuses. */
export const TERMINAL_STATUSES = new Set<TicketStatus>(["Closed", "Cancelled"]);
export const ACTIVE_STATUSES = TICKET_STATUSES.filter(
  (s) => !TERMINAL_STATUSES.has(s),
);

export const STATUS_GROUPS = ["active", "closed"] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];

export const OWNERSHIP_VALUES = ["mine", "unassigned"] as const;
export type Ownership = (typeof OWNERSHIP_VALUES)[number];

/** BR-30 — the sortable fields. */
export const QUEUE_SORTABLE_FIELDS = [
  "ticketDate",
  "updatedAt",
  "ticketNumber",
  "itPriority",
  "requestedPriority",
] as const;
export type QueueSortableField = (typeof QUEUE_SORTABLE_FIELDS)[number];

export const SORT_ORDERS = ["asc", "desc"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const PAGE_SIZES = [10, 20, 50] as const;

// BR-30 — the documented defaults.
export const DEFAULT_SORT_BY: QueueSortableField = "ticketDate";
export const DEFAULT_SORT_ORDER: SortOrder = "asc";
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;

export const MAX_SEARCH_LENGTH = 200;

export interface QueueQuery {
  search: string;
  statusGroup: StatusGroup | null;
  currentStatus: TicketStatus | null;
  ownership: Ownership | null;
  itPriority: ItPriority | null;
  requestedPriority: RequestedPriority | null;
  categoryId: number | null;
  sortBy: QueueSortableField;
  sortOrder: SortOrder;
  page: number;
  pageSize: number;
}

export interface QueueQueryResult {
  /** Present only when there are no field errors. */
  query?: QueueQuery;
  fieldErrors: Record<string, string>;
}

/** Express gives repeated query keys as arrays; only a single scalar is valid. */
function scalar(value: unknown): string | null {
  if (typeof value === "string") return value;
  return null;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

export function parseQueueQuery(raw: Record<string, unknown>): QueueQueryResult {
  const fieldErrors: Record<string, string> = {};

  // --- search (BR-28) ------------------------------------------------------
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

  // --- status group / single status (BR-29) --------------------------------
  let statusGroup: StatusGroup | null = null;
  if (!isBlank(raw.statusGroup)) {
    const value = scalar(raw.statusGroup);
    if (value === null || !(STATUS_GROUPS as readonly string[]).includes(value)) {
      fieldErrors.statusGroup = "Status group must be active or closed.";
    } else {
      statusGroup = value as StatusGroup;
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

  if (statusGroup !== null && currentStatus !== null) {
    fieldErrors.currentStatus = "Use either a status group or a single status, not both.";
  }

  // --- ownership -------------------------------------------------------------
  let ownership: Ownership | null = null;
  if (!isBlank(raw.ownership)) {
    const value = scalar(raw.ownership);
    if (value === null || !(OWNERSHIP_VALUES as readonly string[]).includes(value)) {
      fieldErrors.ownership = "Ownership must be mine or unassigned.";
    } else {
      ownership = value as Ownership;
    }
  }

  // --- priorities and category ------------------------------------------------
  let itPriority: ItPriority | null = null;
  if (!isBlank(raw.itPriority)) {
    const value = scalar(raw.itPriority);
    if (value === null || !(IT_PRIORITIES as readonly string[]).includes(value)) {
      fieldErrors.itPriority = "IT Priority filter is not valid.";
    } else {
      itPriority = value as ItPriority;
    }
  }

  let requestedPriority: RequestedPriority | null = null;
  if (!isBlank(raw.requestedPriority)) {
    const value = scalar(raw.requestedPriority);
    if (value === null || !(REQUESTED_PRIORITIES as readonly string[]).includes(value)) {
      fieldErrors.requestedPriority = "Requested priority filter is not valid.";
    } else {
      requestedPriority = value as RequestedPriority;
    }
  }

  let categoryId: number | null = null;
  if (!isBlank(raw.categoryId)) {
    const value = scalar(raw.categoryId);
    if (value === null || !/^\d+$/.test(value) || Number(value) <= 0) {
      fieldErrors.categoryId = "Category filter is not valid.";
    } else {
      categoryId = Number.parseInt(value, 10);
    }
  }

  // --- sorting (BR-30) ---------------------------------------------------------
  let sortBy: QueueSortableField = DEFAULT_SORT_BY;
  if (!isBlank(raw.sortBy)) {
    const value = scalar(raw.sortBy);
    if (value === null || !(QUEUE_SORTABLE_FIELDS as readonly string[]).includes(value)) {
      fieldErrors.sortBy = `Sort field must be one of: ${QUEUE_SORTABLE_FIELDS.join(", ")}.`;
    } else {
      sortBy = value as QueueSortableField;
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

  // --- pagination (BR-31) -------------------------------------------------------
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
      statusGroup,
      currentStatus,
      ownership,
      itPriority,
      requestedPriority,
      categoryId,
      sortBy,
      sortOrder,
      page,
      pageSize,
    },
  };
}

/**
 * BR-30 — the requested sort, then Ticket Number ascending as the documented
 * secondary sort (sorting by Ticket Number is already unique).
 *
 * Priority fields sort correctly because `RequestedPriority` and `ItPriority`
 * are declared LOW < MEDIUM < HIGH < URGENT in schema.prisma: PostgreSQL
 * orders native enums by declaration position, not alphabetically.
 */
export function buildQueueOrderBy(
  sortBy: QueueSortableField,
  sortOrder: SortOrder,
): Array<Record<string, SortOrder>> {
  if (sortBy === "ticketNumber") return [{ ticketNumber: sortOrder }];
  return [{ [sortBy]: sortOrder }, { ticketNumber: "asc" }];
}
