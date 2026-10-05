// Frontend mirror of the Actions Taken validation rules (api-spec.md §2,
// specification.md §5.1 BR-06..BR-15). This exists for immediate feedback
// only — the backend stays authoritative, and its field errors override
// these when they disagree.

export const DESCRIPTION_MAX = 2000;
export const RESULT_MAX = 2000;
export const FOLLOW_UP_NOTE_MAX = 1000;
export const ATTACHMENT_NOTES_MAX = 500;
export const CANCEL_REASON_MAX = 500;

export interface ActionFormValues {
  actionAt: string; // datetime-local value
  description: string;
  status: "Planned" | "Completed";
  result: string;
  performedById: string;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
}

export const EMPTY_ACTION_FORM: ActionFormValues = {
  actionAt: "",
  description: "",
  status: "Completed",
  result: "",
  performedById: "",
  followUpRequired: false,
  followUpNote: "",
  attachmentNotes: "",
};

export type ActionFieldErrors = Partial<Record<keyof ActionFormValues, string>>;

/** `<input type="datetime-local">` value, e.g. "2026-10-01T09:14", for `now`. */
export function nowAsDatetimeLocal(): string {
  return toDatetimeLocal(new Date());
}

export function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** A `datetime-local` value has no timezone; treated as the browser's local time. */
export function fromDatetimeLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** BR-06..BR-10 — validates the Add/Edit Action form before calling the API. */
export function validateActionForm(
  values: ActionFormValues,
  ticketCreatedAt?: string,
): ActionFieldErrors {
  const errors: ActionFieldErrors = {};

  const actionAtIso = fromDatetimeLocal(values.actionAt);
  if (!actionAtIso) {
    errors.actionAt = "Action date/time is required.";
  } else {
    const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
    if (new Date(actionAtIso).getTime() > fiveMinutesFromNow) {
      errors.actionAt = "Action date/time cannot be more than 5 minutes in the future.";
    } else if (ticketCreatedAt && new Date(actionAtIso).getTime() < new Date(ticketCreatedAt).getTime()) {
      errors.actionAt = "Action date/time cannot be before the ticket was created.";
    }
  }

  const description = values.description.trim();
  if (description.length === 0) {
    errors.description = "Description is required.";
  } else if (description.length > DESCRIPTION_MAX) {
    errors.description = `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
  }

  if (values.status === "Completed" && values.result.trim().length === 0) {
    errors.result = "Result is required when the action is Completed.";
  } else if (values.result.trim().length > RESULT_MAX) {
    errors.result = `Result must be ${RESULT_MAX} characters or fewer.`;
  }

  if (!values.performedById) {
    errors.performedById = "Performed by is required.";
  }

  if (values.followUpRequired && values.followUpNote.trim().length === 0) {
    errors.followUpNote = "Follow-up note is required when follow-up is needed.";
  } else if (values.followUpNote.trim().length > FOLLOW_UP_NOTE_MAX) {
    errors.followUpNote = `Follow-up note must be ${FOLLOW_UP_NOTE_MAX} characters or fewer.`;
  }

  if (values.attachmentNotes.trim().length > ATTACHMENT_NOTES_MAX) {
    errors.attachmentNotes = `Attachment notes must be ${ATTACHMENT_NOTES_MAX} characters or fewer.`;
  }

  return errors;
}

/** BR-13 — Actions Taken cannot be added or edited once the Ticket is terminal. */
export function isTicketLocked(currentStatus: string): boolean {
  return currentStatus === "Closed" || currentStatus === "Cancelled";
}

export function statusLabel(status: string): string {
  return status.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** ui-spec.md §1.1 — Cancelled status badges get a strike icon, not color alone. */
export function statusIcon(status: string): string {
  return status === "Cancelled" ? "✕ " : "";
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}
