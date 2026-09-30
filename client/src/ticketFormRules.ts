import { REQUESTED_PRIORITIES, type RequestedPriority } from "./api.js";

// Frontend mirror of the backend rules. BR-19: this exists for immediate
// feedback only — the backend stays the authoritative validation layer, and
// its field errors override these when they disagree.

export const SUMMARY_MIN = 5;
export const SUMMARY_MAX = 200;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 5000;

export interface TicketFormValues {
  categoryId: string;
  relatedSystemId: string;
  summary: string;
  requestedPriority: string;
  description: string;
}

export const EMPTY_TICKET_FORM: TicketFormValues = {
  categoryId: "",
  relatedSystemId: "",
  summary: "",
  requestedPriority: "",
  description: "",
};

export type TicketFieldErrors = Partial<
  Record<keyof TicketFormValues, string>
>;

/** FR-12 — validate against trimmed values, and persist the trimmed form. */
export function validateTicketForm(
  values: TicketFormValues,
): TicketFieldErrors {
  const errors: TicketFieldErrors = {};

  if (!values.categoryId) {
    errors.categoryId = "Category is required.";
  }

  if (!values.relatedSystemId) {
    errors.relatedSystemId = "Related system is required.";
  }

  const summary = values.summary.trim();
  if (summary.length === 0) {
    errors.summary = "Summary is required.";
  } else if (summary.length < SUMMARY_MIN) {
    errors.summary = `Summary must be at least ${SUMMARY_MIN} characters.`;
  } else if (summary.length > SUMMARY_MAX) {
    errors.summary = `Summary must be ${SUMMARY_MAX} characters or fewer.`;
  }

  if (
    !(REQUESTED_PRIORITIES as readonly string[]).includes(
      values.requestedPriority,
    )
  ) {
    errors.requestedPriority = "Requested priority is required.";
  }

  const description = values.description.trim();
  if (description.length === 0) {
    errors.description = "Description is required.";
  } else if (description.length < DESCRIPTION_MIN) {
    errors.description = `Description must be at least ${DESCRIPTION_MIN} characters.`;
  } else if (description.length > DESCRIPTION_MAX) {
    errors.description = `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
  }

  return errors;
}

export function priorityLabel(priority: RequestedPriority): string {
  return priority.charAt(0) + priority.slice(1).toLowerCase();
}
