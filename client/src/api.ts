const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/** A Lab 2 testing identity (BR-04). Not a real authenticated user. */
export interface DevelopmentRequester {
  id: number;
  name: string;
  email: string;
  department?: string | null;
}

/**
 * FR-32 — load the active Development Requesters for the selector.
 *
 * Throws on any failure so the caller renders a single safe error state
 * (BR-39: no server internals reach the user).
 */
export async function fetchActiveRequesters(): Promise<DevelopmentRequester[]> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/development-requesters`);
  } catch {
    // Network/DNS/CORS failure — the API was never reached.
    throw new Error("Could not reach the server. Please try again.");
  }

  if (!res.ok) {
    throw new Error("Could not load development requesters.");
  }

  const body = (await res.json()) as { data?: DevelopmentRequester[] };

  if (!Array.isArray(body.data)) {
    throw new Error("Could not load development requesters.");
  }

  return body.data;
}

// ---------------------------------------------------------------------------
// Create Ticket reference data and submission
// ---------------------------------------------------------------------------

export interface ReferenceItem {
  id: number;
  name: string;
}

export const REQUESTED_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type RequestedPriority = (typeof REQUESTED_PRIORITIES)[number];

export interface CreateTicketRequest {
  requesterId: number;
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: RequestedPriority;
}

export interface CreatedTicket {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  requester: ReferenceItem;
  category: ReferenceItem;
  relatedSystem: ReferenceItem;
  summary: string;
  description: string;
  requestedPriority: RequestedPriority;
  currentStatus: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A failed Create Ticket call. `fieldErrors` carries the backend's per-field
 * messages so the form can show them beside the right control (BR-19).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;

  constructor(
    message: string,
    options: {
      status: number;
      code?: string;
      fieldErrors?: Record<string, string>;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code ?? "UNKNOWN";
    this.fieldErrors = options.fieldErrors ?? {};
  }
}

/**
 * `/api/categories` predates the Lab 2 envelope and still answers with a bare
 * array, while newer endpoints answer with `{ data: [...] }`. Accept both so
 * the form does not care which endpoint it is reading.
 */
function readReferenceList(body: unknown): ReferenceItem[] | null {
  if (Array.isArray(body)) return body as ReferenceItem[];
  if (typeof body === "object" && body !== null) {
    const data = (body as { data?: unknown }).data;
    if (Array.isArray(data)) return data as ReferenceItem[];
  }
  return null;
}

async function fetchReference(
  path: string,
  failureMessage: string,
): Promise<ReferenceItem[]> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`);
  } catch {
    throw new Error("Could not reach the server. Please try again.");
  }

  if (!res.ok) throw new Error(failureMessage);

  const list = readReferenceList(await res.json());
  if (!list) throw new Error(failureMessage);
  return list;
}

/** FR-30 — active Categories. */
export function fetchCategories(): Promise<ReferenceItem[]> {
  return fetchReference("/api/categories", "Could not load categories.");
}

/** FR-31 — active Related Systems. */
export function fetchRelatedSystems(): Promise<ReferenceItem[]> {
  return fetchReference(
    "/api/related-systems",
    "Could not load related systems.",
  );
}

// ---------------------------------------------------------------------------
// My Tickets
// ---------------------------------------------------------------------------

/** BR-23 — the sortable fields. */
export const SORTABLE_FIELDS = ["updatedAt", "ticketDate", "ticketNumber"] as const;
export type SortableField = (typeof SORTABLE_FIELDS)[number];

export type SortOrder = "asc" | "desc";

/** BR-25 — supported page sizes. */
export const PAGE_SIZES = [10, 20, 50] as const;

/** Matches the TicketStatus enum on the server. */
export const TICKET_STATUSES = [
  "New",
  "InProgress",
  "OnHold",
  "Resolved",
  "Closed",
  "Cancelled",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface TicketListRow {
  id: number;
  ticketNumber: string;
  summary: string;
  /** The Category display name, per api-spec.md §7. */
  category: string;
  requestedPriority: RequestedPriority;
  currentStatus: string;
  updatedAt: string;
}

export interface TicketListMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface TicketListParams {
  search?: string;
  categoryId?: string;
  requestedPriority?: string;
  currentStatus?: string;
  sortBy?: SortableField;
  sortOrder?: SortOrder;
  page?: number;
  pageSize?: number;
}

export interface TicketListResponse {
  data: TicketListRow[];
  meta: TicketListMeta;
}

/**
 * BR-08 — the Requester id scopes the list; a Requester only ever sees their
 * own Tickets. Throws ApiError so the caller can show a safe failure state.
 */
export async function fetchMyTickets(
  requesterId: number,
  params: TicketListParams = {},
): Promise<TicketListResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // Empty filters mean "not applied" and are left off the request.
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }

  const suffix = query.toString() ? `?${query}` : "";

  let res: Response;
  try {
    res = await fetch(
      `${API_URL}/api/requesters/${requesterId}/tickets${suffix}`,
    );
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const error = (body as { error?: Record<string, unknown> } | null)?.error;
    throw new ApiError(
      typeof error?.message === "string"
        ? error.message
        : "Could not load tickets. Please try again.",
      {
        status: res.status,
        code: typeof error?.code === "string" ? error.code : "UNKNOWN",
      },
    );
  }

  const parsed = body as Partial<TicketListResponse> | null;
  if (!Array.isArray(parsed?.data) || !parsed?.meta) {
    throw new ApiError("The ticket list response was not understood.", {
      status: res.status,
      code: "BAD_RESPONSE",
    });
  }

  return { data: parsed.data, meta: parsed.meta };
}

/**
 * Creates one Ticket. Throws ApiError on any failure so the caller can keep
 * the user's entered values and show a safe message (BR-20, BR-39).
 */
export async function createTicket(
  payload: CreateTicketRequest,
): Promise<CreatedTicket> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }

  // The body may not be JSON at all (proxy error page, empty 502).
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (res.ok) {
    const data = (body as { data?: CreatedTicket } | null)?.data;
    if (!data?.ticketNumber) {
      throw new ApiError("The ticket response was not understood.", {
        status: res.status,
        code: "BAD_RESPONSE",
      });
    }
    return data;
  }

  const error = (body as { error?: Record<string, unknown> } | null)?.error;
  const message =
    typeof error?.message === "string"
      ? error.message
      : "Could not create the ticket. Please try again.";

  throw new ApiError(message, {
    status: res.status,
    code: typeof error?.code === "string" ? error.code : "UNKNOWN",
    fieldErrors:
      typeof error?.fieldErrors === "object" && error.fieldErrors !== null
        ? (error.fieldErrors as Record<string, string>)
        : {},
  });
}
