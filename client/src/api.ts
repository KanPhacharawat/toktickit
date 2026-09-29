export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

// ---------------------------------------------------------------------------
// Session-expiry notification
// ---------------------------------------------------------------------------

/**
 * Lab 3 ui-spec.md §2.3 — any API 401 means the session has ended (expired or
 * revoked). AuthContext registers a handler here so every screen's own fetch
 * call can trigger the shared "session has ended" redirect, not just the
 * initial `/api/auth/me` check.
 */
let sessionExpiredHandler: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

function notifyIfSessionExpired(status: number): void {
  if (status === 401) sessionExpiredHandler?.();
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
    res = await fetch(`${API_URL}${path}`, { credentials: "include" });
  } catch {
    throw new Error("Could not reach the server. Please try again.");
  }

  if (!res.ok) {
    notifyIfSessionExpired(res.status);
    throw new Error(failureMessage);
  }

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

/** Matches the TicketStatus enum on the server (Lab 3 §7.1). */
export const TICKET_STATUSES = [
  "New",
  "Open",
  "InProgress",
  "WaitingForRequester",
  "Resolved",
  "Closed",
  "Reopened",
  "Cancelled",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface TicketOwnerSummary {
  name: string;
}

export interface TicketListRow {
  id: number;
  ticketNumber: string;
  summary: string;
  /** The Category display name, per api-spec.md §7. */
  category: string;
  requestedPriority: RequestedPriority;
  currentStatus: string;
  /** New in Lab 3 — the Ticket Owner's name, or null when unassigned. */
  ticketOwner: TicketOwnerSummary | null;
  /** New in Lab 3 — set when the Requester reported the problem appears resolved. */
  problemAppearsResolvedAt: string | null;
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
 * BR-03 / BR-08 — the authenticated Requester's session determines ownership.
 * Throws ApiError so the caller can show a safe failure state.
 */
export async function fetchMyTickets(
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
    res = await fetch(`${API_URL}/api/tickets/mine${suffix}`, {
      credentials: "include",
    });
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
    notifyIfSessionExpired(res.status);
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

// ---------------------------------------------------------------------------
// Ticket Detail and Attachments
// ---------------------------------------------------------------------------

export interface AttachmentMetadata {
  id: number;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  /** Soft removal: non-null means removed (BR-27, BR-36). */
  removedAt: string | null;
  removalReason: string | null;
}

export interface TicketDetailPermissions {
  canManageAttachments: boolean;
  canAddPublicComment: boolean;
  canReportProblemResolved: boolean;
}

/**
 * Lab 4 api-spec.md §7 point 3 — fields the Ticket Workflow panel needs,
 * added to both the Requester and Staff Ticket Detail responses.
 */
export interface TicketWorkflowFields {
  version: number;
  resolutionSummary: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  requesterResolvedIndicatedAt: string | null;
}

export interface TicketDetail extends TicketWorkflowFields {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  requester: { id: number; name: string; email?: string };
  category: ReferenceItem;
  relatedSystem: ReferenceItem;
  summary: string;
  description: string;
  requestedPriority: RequestedPriority;
  currentStatus: string;
  ticketOwner: TicketOwnerSummary | null;
  problemAppearsResolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: AttachmentMetadata[];
  permissions: TicketDetailPermissions;
}

// ---------------------------------------------------------------------------
// Staff Ticket Detail (api-spec.md §3.6, §9)
// ---------------------------------------------------------------------------

export interface StaffTicketDetailPermissions {
  canClaim: boolean;
  canAssign: boolean;
  canReassign: boolean;
  canChangeItPriority: boolean;
  canChangeStatus: boolean;
  canAddPublicComment: boolean;
  canAddInternalNote: boolean;
  canManageAttachments: boolean;
}

export interface StaffTicketDetail extends TicketWorkflowFields {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  requester: { id: number; name: string; email?: string };
  category: ReferenceItem;
  relatedSystem: ReferenceItem;
  summary: string;
  description: string;
  requestedPriority: RequestedPriority;
  itPriority: ItPriority;
  currentStatus: string;
  ticketOwner: QueueOwner | null;
  allowedStatusTransitions: string[];
  problemAppearsResolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: AttachmentMetadata[];
  permissions: StaffTicketDetailPermissions;
}

export interface AssignableUser {
  id: number;
  name: string;
  role: string;
}

/** Reads a JSON body, tolerating a non-JSON error page. */
async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function toApiError(res: Response, body: unknown, fallback: string): ApiError {
  const error = (body as { error?: Record<string, unknown> } | null)?.error;
  return new ApiError(
    typeof error?.message === "string" ? error.message : fallback,
    {
      status: res.status,
      code: typeof error?.code === "string" ? error.code : "UNKNOWN",
      fieldErrors:
        typeof error?.fieldErrors === "object" && error.fieldErrors !== null
          ? (error.fieldErrors as Record<string, string>)
          : {},
    },
  );
}

const ticketUrl = (ticketId: number) => `${API_URL}/api/tickets/${ticketId}`;

/**
 * BR-09 — a Ticket owned by someone else, and one that does not exist, both
 * answer 404. The thrown ApiError carries the status either way.
 */
export async function fetchTicketDetail(ticketId: number): Promise<TicketDetail> {
  let res: Response;
  try {
    res = await fetch(ticketUrl(ticketId), { credentials: "include" });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }

  const body = await readJson(res);
  if (!res.ok) {
    notifyIfSessionExpired(res.status);
    throw toApiError(res, body, "Could not load the ticket. Please try again.");
  }

  const data = (body as { data?: TicketDetail } | null)?.data;
  if (!data?.ticketNumber) {
    throw new ApiError("The ticket response was not understood.", {
      status: res.status,
      code: "BAD_RESPONSE",
    });
  }
  return data;
}

/**
 * Same endpoint as `fetchTicketDetail`, typed for the caller's own role: IT
 * Staff and Administrators always receive the StaffTicketDetail shape.
 */
export async function fetchStaffTicketDetail(ticketId: number): Promise<StaffTicketDetail> {
  let res: Response;
  try {
    res = await fetch(ticketUrl(ticketId), { credentials: "include" });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }

  const body = await readJson(res);
  if (!res.ok) {
    notifyIfSessionExpired(res.status);
    throw toApiError(res, body, "Could not load the ticket. Please try again.");
  }

  const data = (body as { data?: StaffTicketDetail } | null)?.data;
  if (!data?.ticketNumber) {
    throw new ApiError("The ticket response was not understood.", {
      status: res.status,
      code: "BAD_RESPONSE",
    });
  }
  return data;
}

/** api-spec.md §7.2 — active IT Staff and Administrators, for Assign/Reassign. */
export async function fetchAssignableUsers(): Promise<AssignableUser[]> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/users/assignable`, { credentials: "include" });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }
  const body = await readJson(res);
  if (!res.ok) {
    notifyIfSessionExpired(res.status);
    throw toApiError(res, body, "Could not load assignable users.");
  }
  const data = (body as { data?: AssignableUser[] } | null)?.data;
  if (!Array.isArray(data)) {
    throw new ApiError("The response was not understood.", { status: res.status, code: "BAD_RESPONSE" });
  }
  return data;
}

async function staffOperation(
  path: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
  fallback: string,
): Promise<StaffTicketDetail> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }
  const parsed = await readJson(res);
  if (!res.ok) {
    notifyIfSessionExpired(res.status);
    throw toApiError(res, parsed, fallback);
  }
  const data = (parsed as { data?: StaffTicketDetail } | null)?.data;
  if (!data?.ticketNumber) {
    throw new ApiError("The response was not understood.", { status: res.status, code: "BAD_RESPONSE" });
  }
  return data;
}

/** api-spec.md §9.1 — claim an unassigned Ticket. */
export function claimTicket(ticketId: number, expectedUpdatedAt?: string): Promise<StaffTicketDetail> {
  return staffOperation(
    `/api/tickets/${ticketId}/claim`,
    "POST",
    expectedUpdatedAt ? { expectedUpdatedAt } : {},
    "Could not claim the ticket. Please try again.",
  );
}

/** api-spec.md §9.2 — assign an unassigned Ticket, or reassign an owned one. */
export function setTicketOwner(
  ticketId: number,
  ticketOwnerId: number,
  expectedUpdatedAt?: string,
): Promise<StaffTicketDetail> {
  return staffOperation(
    `/api/tickets/${ticketId}/owner`,
    "PATCH",
    { ticketOwnerId, ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) },
    "Could not update the owner. Please try again.",
  );
}

/** api-spec.md §9.3 — change IT Priority. */
export function setItPriority(
  ticketId: number,
  itPriority: ItPriority,
  expectedUpdatedAt?: string,
): Promise<StaffTicketDetail> {
  return staffOperation(
    `/api/tickets/${ticketId}/it-priority`,
    "PATCH",
    { itPriority, ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) },
    "Could not update IT Priority. Please try again.",
  );
}

// PATCH /api/tickets/:ticketId/status (Lab 3 §9.4) is retired — Lab 4
// api-spec.md §3.2/§7. Use postTicketStatus (below) instead.

/** BR-10 — upload is scoped to a Ticket the Requester owns. */
export async function uploadAttachment(
  ticketId: number,
  file: File,
): Promise<AttachmentMetadata> {
  const form = new FormData();
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${ticketUrl(ticketId)}/attachments`, {
      method: "POST",
      body: form,
      credentials: "include",
    });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }

  const body = await readJson(res);
  if (!res.ok) {
    notifyIfSessionExpired(res.status);
    throw toApiError(
      res,
      body,
      "Could not upload the attachment. Please try again.",
    );
  }

  const data = (body as { data?: AttachmentMetadata } | null)?.data;
  if (!data?.id) {
    throw new ApiError("The upload response was not understood.", {
      status: res.status,
      code: "BAD_RESPONSE",
    });
  }
  return data;
}

/** BR-38 — includes removed attachments, which stay visible as metadata. */
export async function fetchAttachments(ticketId: number): Promise<AttachmentMetadata[]> {
  let res: Response;
  try {
    res = await fetch(`${ticketUrl(ticketId)}/attachments`, {
      credentials: "include",
    });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }

  const body = await readJson(res);
  if (!res.ok) {
    notifyIfSessionExpired(res.status);
    throw toApiError(res, body, "Could not load attachments.");
  }

  const data = (body as { data?: AttachmentMetadata[] } | null)?.data;
  if (!Array.isArray(data)) {
    throw new ApiError("The attachment response was not understood.", {
      status: res.status,
      code: "BAD_RESPONSE",
    });
  }
  return data;
}

/**
 * The download URL for an active attachment. Removed attachments must never
 * be linked (BR-37); the server answers 410 if one is requested anyway.
 */
export function attachmentDownloadUrl(ticketId: number, attachmentId: number): string {
  return `${ticketUrl(ticketId)}/attachments/${attachmentId}`;
}

/** BR-35 — soft removal requires an explicit, non-empty reason. */
export async function removeAttachment(
  ticketId: number,
  attachmentId: number,
  removalReason: string,
): Promise<{ id: number; removedAt: string; removalReason: string }> {
  let res: Response;
  try {
    res = await fetch(`${ticketUrl(ticketId)}/attachments/${attachmentId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removalReason }),
      credentials: "include",
    });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }

  const body = await readJson(res);
  if (!res.ok) {
    notifyIfSessionExpired(res.status);
    throw toApiError(
      res,
      body,
      "Could not remove the attachment. Please try again.",
    );
  }

  const data = (body as { data?: { id: number; removedAt: string; removalReason: string } } | null)
    ?.data;
  if (!data?.id) {
    throw new ApiError("The removal response was not understood.", {
      status: res.status,
      code: "BAD_RESPONSE",
    });
  }
  return data;
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
      credentials: "include",
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

  notifyIfSessionExpired(res.status);
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

// ---------------------------------------------------------------------------
// IT Staff Ticket Queue (Lab 3 api-spec.md §7.1)
// ---------------------------------------------------------------------------

export const IT_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type ItPriority = (typeof IT_PRIORITIES)[number];

export const QUEUE_SORTABLE_FIELDS = [
  "ticketDate",
  "updatedAt",
  "ticketNumber",
  "itPriority",
  "requestedPriority",
] as const;
export type QueueSortableField = (typeof QUEUE_SORTABLE_FIELDS)[number];

export type StatusGroup = "active" | "closed";
export type Ownership = "mine" | "unassigned";

export interface QueueOwner {
  id: number;
  name: string;
  role: string;
}

export interface QueueRow {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  summary: string;
  category: ReferenceItem;
  requester: { id: number; name: string; email: string };
  requestedPriority: RequestedPriority;
  itPriority: ItPriority;
  currentStatus: string;
  ticketOwner: QueueOwner | null;
  problemAppearsResolvedAt: string | null;
  updatedAt: string;
}

export interface QueueCounts {
  active: number;
  unassigned: number;
  assignedToMe: number;
}

export interface QueueMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  counts: QueueCounts;
}

export interface QueueParams {
  search?: string;
  statusGroup?: StatusGroup | "";
  currentStatus?: string;
  /** api-spec.md §4.4 — dashboard drill-down: a status list, or the "open" alias. */
  status?: string;
  ownership?: Ownership | "";
  itPriority?: string;
  requestedPriority?: string;
  categoryId?: string;
  /** api-spec.md §4.4 — dashboard drill-down: my open follow-ups. */
  followUpFor?: "me" | "";
  sortBy?: QueueSortableField;
  sortOrder?: SortOrder;
  page?: number;
  pageSize?: number;
}

export interface QueueResponse {
  data: QueueRow[];
  meta: QueueMeta;
}

/** api-spec.md §7.1 — IT Staff and Administrator only. */
export async function fetchQueue(params: QueueParams = {}): Promise<QueueResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString() ? `?${query}` : "";

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets/queue${suffix}`, { credentials: "include" });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }

  const body = await readJson(res);
  if (!res.ok) {
    notifyIfSessionExpired(res.status);
    throw toApiError(res, body, "Could not load the queue. Please try again.");
  }

  const parsed = body as Partial<QueueResponse> | null;
  if (!Array.isArray(parsed?.data) || !parsed?.meta) {
    throw new ApiError("The queue response was not understood.", {
      status: res.status,
      code: "BAD_RESPONSE",
    });
  }
  return { data: parsed.data, meta: parsed.meta };
}

// ---------------------------------------------------------------------------
// Public Comments and "Problem Appears Resolved" (Lab 3)
// ---------------------------------------------------------------------------

export interface ThreadAuthor {
  id: number;
  name: string;
  role: string;
}

export interface ThreadEntry {
  id: number;
  body: string;
  author: ThreadAuthor;
  createdAt: string;
}

async function threadRequest<T>(
  path: string,
  init: RequestInit,
  failureMessage: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: init.body
        ? { "Content-Type": "application/json", ...init.headers }
        : init.headers,
    });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }

  const body = await readJson(res);
  if (!res.ok) {
    notifyIfSessionExpired(res.status);
    throw toApiError(res, body, failureMessage);
  }
  return body as T;
}

/** api-spec.md §10.1 — Public Comments, oldest first. */
export async function fetchPublicComments(ticketId: number): Promise<ThreadEntry[]> {
  const body = await threadRequest<{ data?: ThreadEntry[] }>(
    `/api/tickets/${ticketId}/public-comments`,
    { method: "GET" },
    "Could not load comments. Please try again.",
  );
  if (!Array.isArray(body.data)) {
    throw new ApiError("The comment list response was not understood.", {
      status: 0,
      code: "BAD_RESPONSE",
    });
  }
  return body.data;
}

/** api-spec.md §10.2 — posts one Public Comment as the caller. */
export async function postPublicComment(
  ticketId: number,
  body: string,
): Promise<ThreadEntry> {
  const result = await threadRequest<{ data?: ThreadEntry }>(
    `/api/tickets/${ticketId}/public-comments`,
    { method: "POST", body: JSON.stringify({ body }) },
    "Could not post the comment. Please try again.",
  );
  if (!result.data?.id) {
    throw new ApiError("The comment response was not understood.", {
      status: 0,
      code: "BAD_RESPONSE",
    });
  }
  return result.data;
}

export interface ProblemResolvedResult {
  problemAppearsResolvedAt: string;
  currentStatus: string;
  publicComment: ThreadEntry;
}

/** api-spec.md §12.1 — reports "Problem Appears Resolved"; never changes status. */
export async function reportProblemResolved(
  ticketId: number,
  note: string,
): Promise<ProblemResolvedResult> {
  const result = await threadRequest<{ data?: ProblemResolvedResult }>(
    `/api/tickets/${ticketId}/problem-resolved`,
    { method: "POST", body: JSON.stringify({ note }) },
    "Could not send the report. Please try again.",
  );
  if (!result.data?.problemAppearsResolvedAt) {
    throw new ApiError("The report response was not understood.", {
      status: 0,
      code: "BAD_RESPONSE",
    });
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Internal Notes (Lab 3 api-spec.md §11) — IT Staff and Administrator only.
// ---------------------------------------------------------------------------

/** api-spec.md §11.1 — Internal Notes, oldest first. */
export async function fetchInternalNotes(ticketId: number): Promise<ThreadEntry[]> {
  const body = await threadRequest<{ data?: ThreadEntry[] }>(
    `/api/tickets/${ticketId}/internal-notes`,
    { method: "GET" },
    "Could not load notes. Please try again.",
  );
  if (!Array.isArray(body.data)) {
    throw new ApiError("The note list response was not understood.", {
      status: 0,
      code: "BAD_RESPONSE",
    });
  }
  return body.data;
}

/** api-spec.md §11.2 — posts one Internal Note as the caller. */
export async function postInternalNote(ticketId: number, body: string): Promise<ThreadEntry> {
  const result = await threadRequest<{ data?: ThreadEntry }>(
    `/api/tickets/${ticketId}/internal-notes`,
    { method: "POST", body: JSON.stringify({ body }) },
    "Could not post the note. Please try again.",
  );
  if (!result.data?.id) {
    throw new ApiError("The note response was not understood.", {
      status: 0,
      code: "BAD_RESPONSE",
    });
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Actions Taken (Lab 4 api-spec.md §2)
// ---------------------------------------------------------------------------

export type ActionStatus = "Planned" | "Completed" | "Cancelled";

export interface ActionUserSummary {
  id: number;
  name: string;
  role: string;
}

export interface ActionTaken {
  id: number;
  ticketId: number;
  actionAt: string;
  description: string;
  result: string | null;
  status: ActionStatus;
  performedBy: ActionUserSummary;
  isPerformedByOwner: boolean;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** Omitted from the response for a Requester (api-spec.md §1.2). */
  createdBy?: ActionUserSummary;
  updatedBy?: ActionUserSummary | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/**
 * api-spec.md §2.3 — a 409 STALE_UPDATE reply carries the current record as a
 * sibling of `error`, so the caller can offer "Reload latest" / "Copy my
 * changes" from this one thrown error.
 */
export class StaleActionError extends ApiError {
  readonly current: ActionTaken;
  constructor(message: string, options: { status: number; current: ActionTaken }) {
    super(message, { status: options.status, code: "STALE_UPDATE" });
    this.current = options.current;
  }
}

async function actionFetch(path: string, init: RequestInit): Promise<{ res: Response; body: unknown }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: init.body
        ? { "Content-Type": "application/json", ...init.headers }
        : init.headers,
    });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }
  return { res, body: await readJson(res) };
}

function actionFromBody(body: unknown): ActionTaken {
  const data = (body as { data?: ActionTaken } | null)?.data;
  if (!data?.id) {
    throw new ApiError("The action response was not understood.", {
      status: 0,
      code: "BAD_RESPONSE",
    });
  }
  return data;
}

/** Throws StaleActionError for a 409 STALE_UPDATE reply, otherwise the usual ApiError. */
function throwActionError(res: Response, body: unknown, fallback: string): never {
  notifyIfSessionExpired(res.status);
  const code = (body as { error?: { code?: string } } | null)?.error?.code;
  const current = (body as { current?: ActionTaken } | null)?.current;
  if (res.status === 409 && code === "STALE_UPDATE" && current?.id) {
    const message = (body as { error?: { message?: string } } | null)?.error?.message;
    throw new StaleActionError(typeof message === "string" ? message : fallback, {
      status: res.status,
      current,
    });
  }
  throw toApiError(res, body, fallback);
}

/** api-spec.md §2.1 — FR-09 stable order (actionAt, createdAt, id) is server-side. */
export async function fetchActionsTaken(
  ticketId: number,
): Promise<{ items: ActionTaken[]; total: number }> {
  const { res, body } = await actionFetch(`/api/tickets/${ticketId}/actions`, { method: "GET" });
  if (!res.ok) throwActionError(res, body, "Could not load actions taken. Please try again.");
  const parsed = body as { items?: ActionTaken[]; total?: number } | null;
  if (!Array.isArray(parsed?.items)) {
    throw new ApiError("The action list response was not understood.", {
      status: res.status,
      code: "BAD_RESPONSE",
    });
  }
  return { items: parsed.items, total: parsed.total ?? parsed.items.length };
}

export interface CreateActionInput {
  clientRequestId: string;
  actionAt: string;
  description: string;
  status: "Planned" | "Completed";
  result?: string;
  performedById?: number;
  followUpRequired: boolean;
  followUpNote?: string;
  attachmentNotes?: string;
}

/** api-spec.md §2.2 — 201 on create, 200 on an idempotent replay; both carry the same shape. */
export async function createActionTaken(
  ticketId: number,
  input: CreateActionInput,
): Promise<ActionTaken> {
  const { res, body } = await actionFetch(`/api/tickets/${ticketId}/actions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) throwActionError(res, body, "Could not save the action. Please try again.");
  return actionFromBody(body);
}

export interface EditActionInput {
  version: number;
  actionAt?: string;
  description?: string;
  result?: string;
  performedById?: number;
  followUpRequired?: boolean;
  followUpNote?: string;
  attachmentNotes?: string;
}

/** api-spec.md §2.3 — every editable field is optional; `version` is required. */
export async function editActionTaken(
  ticketId: number,
  actionId: number,
  input: EditActionInput,
): Promise<ActionTaken> {
  const { res, body } = await actionFetch(`/api/tickets/${ticketId}/actions/${actionId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!res.ok) throwActionError(res, body, "Could not save the action. Please try again.");
  return actionFromBody(body);
}

export interface CompleteActionInput {
  version: number;
  result: string;
  followUpRequired: boolean;
  followUpNote?: string;
}

/** api-spec.md §2.4 — only from Planned. */
export async function completeActionTaken(
  ticketId: number,
  actionId: number,
  input: CompleteActionInput,
): Promise<ActionTaken> {
  const { res, body } = await actionFetch(`/api/tickets/${ticketId}/actions/${actionId}/complete`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) throwActionError(res, body, "Could not complete the action. Please try again.");
  return actionFromBody(body);
}

export interface CancelActionInput {
  version: number;
  reason: string;
}

/** api-spec.md §2.5 — from Planned or Completed. */
export async function cancelActionTaken(
  ticketId: number,
  actionId: number,
  input: CancelActionInput,
): Promise<ActionTaken> {
  const { res, body } = await actionFetch(`/api/tickets/${ticketId}/actions/${actionId}/cancel`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) throwActionError(res, body, "Could not cancel the action. Please try again.");
  return actionFromBody(body);
}

// ---------------------------------------------------------------------------
// Ticket Workflow (Lab 4 api-spec.md §3)
// ---------------------------------------------------------------------------

export type GateCheckId =
  | "HAS_OWNER"
  | "HAS_COMPLETED_ACTION"
  | "NO_PLANNED_ACTIONS"
  | "FOLLOW_UPS_ACKNOWLEDGED";

export interface WorkflowGateCheck {
  id: GateCheckId;
  passed: boolean;
  requiresAcknowledgement?: boolean;
}

export interface WorkflowGate {
  passed: boolean;
  checks: WorkflowGateCheck[];
}

export interface WorkflowTransition {
  to: TicketStatus;
  requiresReason: boolean;
  /** Present only for a target that runs the resolution gate (currently just Resolved). */
  gate?: WorkflowGate;
}

export interface TransitionsResponse {
  currentStatus: TicketStatus;
  version: number;
  transitions: WorkflowTransition[];
  requesterCanIndicateResolved: boolean;
}

/** api-spec.md §1.2 — the ticket fields a workflow response refreshes. */
export interface TicketWorkflowSummary {
  id: number;
  ticketNumber: string;
  currentStatus: TicketStatus;
  version: number;
  ticketOwner: { id: number; name: string; role: string } | null;
  resolutionSummary: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  requesterResolvedIndicatedAt: string | null;
  updatedAt: string;
}

export interface StatusHistoryEntry {
  id: number;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  actor: { id: number; name: string; role: string };
  reason: string | null;
  createdAt: string;
}

/** api-spec.md §3.2 — a 409 STALE_UPDATE reply carries the current ticket as a sibling of `error`. */
export class StaleStatusError extends ApiError {
  readonly current: TicketWorkflowSummary;
  constructor(message: string, options: { status: number; current: TicketWorkflowSummary }) {
    super(message, { status: options.status, code: "STALE_UPDATE" });
    this.current = options.current;
  }
}

/** api-spec.md §3.2 — a 422 RESOLUTION_GATE_FAILED reply lists the failing conditions. */
export class ResolutionGateError extends ApiError {
  readonly details: Array<{ check: string; message: string }>;
  constructor(
    message: string,
    options: { status: number; details: Array<{ check: string; message: string }> },
  ) {
    super(message, { status: options.status, code: "RESOLUTION_GATE_FAILED" });
    this.details = options.details;
  }
}

async function workflowFetch(path: string, init: RequestInit): Promise<{ res: Response; body: unknown }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: init.body
        ? { "Content-Type": "application/json", ...init.headers }
        : init.headers,
    });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }
  return { res, body: await readJson(res) };
}

/** api-spec.md §3.1 — the permitted transitions for the caller, from the current status. */
export async function fetchTransitions(ticketId: number): Promise<TransitionsResponse> {
  const { res, body } = await workflowFetch(`/api/tickets/${ticketId}/transitions`, { method: "GET" });
  if (!res.ok) {
    notifyIfSessionExpired(res.status);
    throw toApiError(res, body, "Could not load the available transitions. Please try again.");
  }
  const parsed = body as Partial<TransitionsResponse> | null;
  if (!Array.isArray(parsed?.transitions)) {
    throw new ApiError("The transitions response was not understood.", {
      status: res.status,
      code: "BAD_RESPONSE",
    });
  }
  return {
    currentStatus: parsed.currentStatus as TicketStatus,
    version: parsed.version ?? 0,
    transitions: parsed.transitions,
    requesterCanIndicateResolved: parsed.requesterCanIndicateResolved ?? false,
  };
}

export interface PostStatusInput {
  version: number;
  toStatus: TicketStatus;
  reason?: string;
  followUpAcknowledged?: boolean;
}

export interface PostStatusResult {
  ticket: TicketWorkflowSummary;
  history: StatusHistoryEntry;
}

/** api-spec.md §3.2 — one DB transaction: version → matrix → gate → update → history. */
export async function postTicketStatus(
  ticketId: number,
  input: PostStatusInput,
): Promise<PostStatusResult> {
  const { res, body } = await workflowFetch(`/api/tickets/${ticketId}/status`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    notifyIfSessionExpired(res.status);
    const errorBody = body as { error?: { code?: string; message?: string; details?: unknown }; current?: unknown } | null;
    const code = errorBody?.error?.code;
    const fallback = "Could not update the status. Please try again.";
    if (res.status === 409 && code === "STALE_UPDATE" && errorBody?.current) {
      throw new StaleStatusError(errorBody.error?.message ?? fallback, {
        status: res.status,
        current: errorBody.current as TicketWorkflowSummary,
      });
    }
    if (res.status === 422 && code === "RESOLUTION_GATE_FAILED") {
      throw new ResolutionGateError(errorBody?.error?.message ?? fallback, {
        status: res.status,
        details: Array.isArray(errorBody?.error?.details)
          ? (errorBody.error.details as Array<{ check: string; message: string }>)
          : [],
      });
    }
    throw toApiError(res, body, fallback);
  }
  const parsed = body as Partial<PostStatusResult> | null;
  if (!parsed?.ticket?.id || !parsed.history) {
    throw new ApiError("The status response was not understood.", {
      status: res.status,
      code: "BAD_RESPONSE",
    });
  }
  return { ticket: parsed.ticket, history: parsed.history };
}

export interface RequesterResolutionResult {
  ticketId: number;
  currentStatus: TicketStatus;
  requesterResolvedIndicatedAt: string;
}

/** api-spec.md §3.3 — advisory only; never changes status. Idempotent. */
export async function postRequesterResolution(ticketId: number): Promise<RequesterResolutionResult> {
  const { res, body } = await workflowFetch(`/api/tickets/${ticketId}/requester-resolution`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    notifyIfSessionExpired(res.status);
    throw toApiError(res, body, "Could not record the indication. Please try again.");
  }
  const parsed = body as Partial<RequesterResolutionResult> | null;
  if (!parsed?.requesterResolvedIndicatedAt) {
    throw new ApiError("The response was not understood.", { status: res.status, code: "BAD_RESPONSE" });
  }
  return {
    ticketId: parsed.ticketId ?? ticketId,
    currentStatus: parsed.currentStatus as TicketStatus,
    requesterResolvedIndicatedAt: parsed.requesterResolvedIndicatedAt,
  };
}

/** api-spec.md §3.4 — read-only, oldest first. No write/edit endpoint exists. */
export async function fetchStatusHistory(ticketId: number): Promise<StatusHistoryEntry[]> {
  const { res, body } = await workflowFetch(`/api/tickets/${ticketId}/status-history`, { method: "GET" });
  if (!res.ok) {
    notifyIfSessionExpired(res.status);
    throw toApiError(res, body, "Could not load the status history. Please try again.");
  }
  const parsed = body as { items?: StatusHistoryEntry[] } | null;
  if (!Array.isArray(parsed?.items)) {
    throw new ApiError("The status history response was not understood.", {
      status: res.status,
      code: "BAD_RESPONSE",
    });
  }
  return parsed.items;
}

// ---------------------------------------------------------------------------
// Dashboards (Lab 4 api-spec.md §4) — IT Staff / Administrator only.
// ---------------------------------------------------------------------------

export interface DashboardMetric {
  key: string;
  label: string;
  value: number;
  drillDown: string;
}

export interface DashboardByPriority {
  priority: ItPriority;
  value: number;
  drillDown: string;
}

export interface DashboardTicketSummary {
  id: number;
  ticketNumber: string;
  summary: string;
  currentStatus: string;
  itPriority: ItPriority;
  ticketOwner: QueueOwner | null;
  updatedAt: string;
  createdAt: string;
}

export interface StaffDashboardData {
  generatedAt: string;
  timeZone: string;
  metrics: DashboardMetric[];
  secondary: DashboardMetric[];
  byPriority: DashboardByPriority[];
  urgentTickets: DashboardTicketSummary[];
  recentTickets: DashboardTicketSummary[];
  todayDelta?: number;
}

/** api-spec.md §4.3 — same shape as staff, plus a user-account counts block. */
export interface AdminDashboardData extends StaffDashboardData {
  users: { active: Record<AdminRole, number>; inactive: number };
}

async function dashboardFetch<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { credentials: "include" });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }
  const body = await readJson(res);
  if (!res.ok) {
    notifyIfSessionExpired(res.status);
    throw toApiError(res, body, "Could not load the dashboard. Please try again.");
  }
  return body as T;
}

/** api-spec.md §4.2 — IT Staff, Administrator. */
export function fetchStaffDashboard(): Promise<StaffDashboardData> {
  return dashboardFetch<StaffDashboardData>("/api/dashboard/staff");
}

/** api-spec.md §4.3 — Administrator only. */
export function fetchAdminDashboard(): Promise<AdminDashboardData> {
  return dashboardFetch<AdminDashboardData>("/api/dashboard/admin");
}

// ---------------------------------------------------------------------------
// Administrator User Management (Lab 3 api-spec.md §14)
// ---------------------------------------------------------------------------

export type AdminRole = "Requester" | "ITStaff" | "Administrator";

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserListParams {
  search?: string;
  role?: AdminRole | "";
  /** api-spec.md §4.4 — dashboard drill-down. */
  active?: "true" | "false" | "";
}

export interface AdminUserListResponse {
  data: AdminUser[];
  meta: { totalItems: number };
}

export interface CreateAdminUserInput {
  name: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  initialPassword: string;
}

export interface EditAdminUserInput {
  name?: string;
  email?: string;
  role?: AdminRole;
  isActive?: boolean;
}

export interface EditAdminUserResult {
  data: AdminUser;
  meta: { unassignedTicketCount: number; sessionsRevoked: boolean };
}

export interface SetInitialPasswordResult {
  data: AdminUser;
  meta: { sessionsRevoked: boolean };
}

async function adminRequest<T>(
  path: string,
  init: RequestInit,
  failureMessage: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: init.body
        ? { "Content-Type": "application/json", ...init.headers }
        : init.headers,
    });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }
  const body = await readJson(res);
  if (!res.ok) {
    notifyIfSessionExpired(res.status);
    throw toApiError(res, body, failureMessage);
  }
  return body as T;
}

/** api-spec.md §14.1 — search + one role filter, sorted, not paginated. */
export async function fetchAdminUsers(params: AdminUserListParams = {}): Promise<AdminUserListResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const suffix = query.toString() ? `?${query}` : "";
  const body = await adminRequest<Partial<AdminUserListResponse>>(
    `/api/admin/users${suffix}`,
    { method: "GET" },
    "Could not load users. Please try again.",
  );
  if (!Array.isArray(body.data) || !body.meta) {
    throw new ApiError("The user list response was not understood.", {
      status: 0,
      code: "BAD_RESPONSE",
    });
  }
  return { data: body.data, meta: body.meta };
}

/** api-spec.md §14.2. */
export async function createAdminUser(input: CreateAdminUserInput): Promise<AdminUser> {
  const body = await adminRequest<{ data?: AdminUser }>(
    "/api/admin/users",
    { method: "POST", body: JSON.stringify(input) },
    "Could not create the user. Please try again.",
  );
  if (!body.data?.id) {
    throw new ApiError("The response was not understood.", { status: 0, code: "BAD_RESPONSE" });
  }
  return body.data;
}

/** api-spec.md §14.4. */
export async function updateAdminUser(
  userId: number,
  input: EditAdminUserInput,
): Promise<EditAdminUserResult> {
  const body = await adminRequest<Partial<EditAdminUserResult>>(
    `/api/admin/users/${userId}`,
    { method: "PATCH", body: JSON.stringify(input) },
    "Could not update the user. Please try again.",
  );
  if (!body.data?.id || !body.meta) {
    throw new ApiError("The response was not understood.", { status: 0, code: "BAD_RESPONSE" });
  }
  return { data: body.data, meta: body.meta };
}

/** api-spec.md §14.5. */
export async function setAdminUserInitialPassword(
  userId: number,
  initialPassword: string,
): Promise<SetInitialPasswordResult> {
  const body = await adminRequest<Partial<SetInitialPasswordResult>>(
    `/api/admin/users/${userId}/initial-password`,
    { method: "POST", body: JSON.stringify({ initialPassword }) },
    "Could not set the password. Please try again.",
  );
  if (!body.data?.id || !body.meta) {
    throw new ApiError("The response was not understood.", { status: 0, code: "BAD_RESPONSE" });
  }
  return { data: body.data, meta: body.meta };
}
