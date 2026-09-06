// Backend validation for Create Ticket.
//
// BR-19 — the backend is the authoritative validation layer. It never trusts
// the frontend, so every rule is re-checked here even though the UI checks
// them too.

export const REQUESTED_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type RequestedPriority = (typeof REQUESTED_PRIORITIES)[number];

// BR-11 / BR-12 — lengths are measured after trimming.
export const SUMMARY_MIN = 5;
export const SUMMARY_MAX = 200;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 5000;

export interface CreateTicketInput {
  requesterId: number;
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: RequestedPriority;
}

/** Field name -> user-facing message, matching the api-spec error shape. */
export type FieldErrors = Record<string, string>;

export interface ValidationResult {
  /** Present only when there are no field errors. */
  input?: CreateTicketInput;
  fieldErrors: FieldErrors;
}

/**
 * Accepts an integer id supplied as a number or a numeric string, since form
 * encodings differ. Anything else (0, negatives, floats, "abc") is rejected.
 */
function parseId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

/** FR-12 — trim before validating and before persisting. */
function trimmed(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

/**
 * Validates the request body shape and content. Reference ids are checked for
 * existence and active state separately, against the database.
 */
export function validateCreateTicketBody(body: unknown): ValidationResult {
  const fieldErrors: FieldErrors = {};

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { fieldErrors: { body: "A JSON request body is required." } };
  }

  const raw = body as Record<string, unknown>;

  // BR-16 — a Ticket must reference a Development Requester.
  const requesterId = parseId(raw.requesterId);
  if (requesterId === null) {
    fieldErrors.requesterId = "A valid requester is required.";
  }

  // BR-13
  const categoryId = parseId(raw.categoryId);
  if (categoryId === null) {
    fieldErrors.categoryId = "Category is required.";
  }

  // BR-14
  const relatedSystemId = parseId(raw.relatedSystemId);
  if (relatedSystemId === null) {
    fieldErrors.relatedSystemId = "Related system is required.";
  }

  // BR-11
  const summary = trimmed(raw.summary);
  if (summary === null || summary.length === 0) {
    fieldErrors.summary = "Summary is required.";
  } else if (summary.length < SUMMARY_MIN) {
    fieldErrors.summary = `Summary must be at least ${SUMMARY_MIN} characters.`;
  } else if (summary.length > SUMMARY_MAX) {
    fieldErrors.summary = `Summary must be ${SUMMARY_MAX} characters or fewer.`;
  }

  // BR-12
  const description = trimmed(raw.description);
  if (description === null || description.length === 0) {
    fieldErrors.description = "Description is required.";
  } else if (description.length < DESCRIPTION_MIN) {
    fieldErrors.description = `Description must be at least ${DESCRIPTION_MIN} characters.`;
  } else if (description.length > DESCRIPTION_MAX) {
    fieldErrors.description = `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
  }

  // BR-15
  const priority = raw.requestedPriority;
  const isKnownPriority =
    typeof priority === "string" &&
    (REQUESTED_PRIORITIES as readonly string[]).includes(priority);
  if (!isKnownPriority) {
    fieldErrors.requestedPriority = "Requested priority is required.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    fieldErrors,
    input: {
      requesterId: requesterId as number,
      categoryId: categoryId as number,
      relatedSystemId: relatedSystemId as number,
      summary: summary as string,
      description: description as string,
      requestedPriority: priority as RequestedPriority,
    },
  };
}
