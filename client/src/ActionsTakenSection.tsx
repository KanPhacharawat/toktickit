import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  StaleActionError,
  cancelActionTaken,
  completeActionTaken,
  createActionTaken,
  editActionTaken,
  fetchActionsTaken,
  type ActionTaken,
  type AssignableUser,
} from "./api.js";
import {
  ATTACHMENT_NOTES_MAX,
  CANCEL_REASON_MAX,
  DESCRIPTION_MAX,
  EMPTY_ACTION_FORM,
  FOLLOW_UP_NOTE_MAX,
  RESULT_MAX,
  formatDateTime,
  fromDatetimeLocal,
  nowAsDatetimeLocal,
  statusLabel,
  toDatetimeLocal,
  validateActionForm,
  type ActionFieldErrors,
  type ActionFormValues,
} from "./actionsTakenRules.js";

function newClientRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `crid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="zen-error-text small mt-1 mb-0">
      {message}
    </p>
  ) : null;
}

function Counter({ id, value, max }: { id: string; value: string; max: number }) {
  return (
    <p id={id} className="text-secondary small mt-1 mb-0">
      {`${value.length} / ${max}`}
    </p>
  );
}

function StatusBadge({ status }: { status: ActionTaken["status"] }) {
  const cls =
    status === "Completed"
      ? "zen-status"
      : status === "Cancelled"
        ? "zen-removed-badge"
        : "zen-priority-medium";
  const icon = status === "Completed" ? "✓ " : status === "Cancelled" ? "✕ " : "";
  return <span className={`zen-badge ${cls}`}>{`${icon}${statusLabel(status)}`}</span>;
}

function performedByLabel(action: ActionTaken): string {
  return action.isPerformedByOwner ? `${action.performedBy.name} (owner)` : action.performedBy.name;
}

function followUpSummary(action: ActionTaken): string {
  if (!action.followUpRequired) return "No";
  return action.followUpNote ? `Yes — ${action.followUpNote}` : "Yes";
}

// ---------------------------------------------------------------------------
// Add / Edit form (ui-spec.md §5.2–5.3)
// ---------------------------------------------------------------------------

interface ActionFormResult {
  ok: boolean;
  fieldErrors?: ActionFieldErrors;
  message?: string;
  staleCurrent?: ActionTaken;
}

function ActionForm({
  mode,
  initial,
  assignableUsers,
  ticketCreatedAt,
  submitLabel,
  busyLabel,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  initial: ActionFormValues;
  assignableUsers: AssignableUser[];
  ticketCreatedAt: string;
  submitLabel: string;
  busyLabel: string;
  onCancel: () => void;
  onSubmit: (values: ActionFormValues) => Promise<ActionFormResult>;
}) {
  const [values, setValues] = useState<ActionFormValues>(initial);
  const [fieldErrors, setFieldErrors] = useState<ActionFieldErrors>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof ActionFormValues>(field: K, value: ActionFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const errors = validateActionForm(values, ticketCreatedAt);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setFormError("");
    setSubmitting(true);
    // Form values are kept as-is on any failure (AC-33) — nothing is cleared
    // here; only a successful `onSubmit` (handled by the caller) closes this form.
    const result = await onSubmit(values);
    if (!result.ok) {
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      setFormError(result.message ?? "Could not save the action. Please try again.");
    }
    setSubmitting(false);
  }

  const idPrefix = mode === "create" ? "action-create" : "action-edit";

  return (
    <form className="mt-3" onSubmit={handleSubmit} aria-label={mode === "create" ? "Add Action" : "Edit Action"}>
      {mode === "create" && (
        <fieldset className="mb-3">
          <legend className="form-label fw-semibold">Status</legend>
          <div className="d-flex gap-3">
            {(["Completed", "Planned"] as const).map((option) => (
              <label key={option} className="d-flex align-items-center gap-1">
                <input
                  type="radio"
                  name={`${idPrefix}-status`}
                  value={option}
                  checked={values.status === option}
                  onChange={() => update("status", option)}
                  disabled={submitting}
                />
                {statusLabel(option)}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mb-3">
        <label className="form-label fw-semibold" htmlFor={`${idPrefix}-actionAt`}>
          {"Action date/time"}
          <span className="zen-required" aria-hidden="true">
            {" *"}
          </span>
          <span className="visually-hidden"> (required)</span>
        </label>
        <input
          id={`${idPrefix}-actionAt`}
          type="datetime-local"
          className={`form-control zen-input${fieldErrors.actionAt ? " zen-invalid" : ""}`}
          value={values.actionAt}
          onChange={(e) => update("actionAt", e.target.value)}
          disabled={submitting}
          aria-invalid={fieldErrors.actionAt ? true : undefined}
          aria-describedby={`${idPrefix}-actionAt-error`}
        />
        <FieldError id={`${idPrefix}-actionAt-error`} message={fieldErrors.actionAt} />
      </div>

      <div className="mb-3">
        <label className="form-label fw-semibold" htmlFor={`${idPrefix}-description`}>
          {"Description"}
          <span className="zen-required" aria-hidden="true">
            {" *"}
          </span>
          <span className="visually-hidden"> (required)</span>
        </label>
        <textarea
          id={`${idPrefix}-description`}
          className={`form-control zen-input zen-textarea${fieldErrors.description ? " zen-invalid" : ""}`}
          rows={3}
          maxLength={DESCRIPTION_MAX}
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          disabled={submitting}
          aria-invalid={fieldErrors.description ? true : undefined}
          aria-describedby={`${idPrefix}-description-counter ${idPrefix}-description-error`}
        />
        <Counter id={`${idPrefix}-description-counter`} value={values.description} max={DESCRIPTION_MAX} />
        <FieldError id={`${idPrefix}-description-error`} message={fieldErrors.description} />
      </div>

      <div className="mb-3">
        <label className="form-label fw-semibold" htmlFor={`${idPrefix}-result`}>
          Result
          {values.status === "Completed" && (
            <>
              <span className="zen-required" aria-hidden="true">
                {" *"}
              </span>
              <span className="visually-hidden"> (required)</span>
            </>
          )}
        </label>
        <textarea
          id={`${idPrefix}-result`}
          className={`form-control zen-input zen-textarea${fieldErrors.result ? " zen-invalid" : ""}`}
          rows={3}
          maxLength={RESULT_MAX}
          value={values.result}
          onChange={(e) => update("result", e.target.value)}
          disabled={submitting}
          aria-invalid={fieldErrors.result ? true : undefined}
          aria-describedby={`${idPrefix}-result-counter ${idPrefix}-result-error`}
        />
        <Counter id={`${idPrefix}-result-counter`} value={values.result} max={RESULT_MAX} />
        <FieldError id={`${idPrefix}-result-error`} message={fieldErrors.result} />
      </div>

      <div className="mb-3">
        <label className="form-label fw-semibold" htmlFor={`${idPrefix}-performedBy`}>
          {"Performed by"}
          <span className="zen-required" aria-hidden="true">
            {" *"}
          </span>
          <span className="visually-hidden"> (required)</span>
        </label>
        <select
          id={`${idPrefix}-performedBy`}
          className={`form-select zen-select${fieldErrors.performedById ? " zen-invalid" : ""}`}
          value={values.performedById}
          onChange={(e) => update("performedById", e.target.value)}
          disabled={submitting}
          aria-invalid={fieldErrors.performedById ? true : undefined}
          aria-describedby={`${idPrefix}-performedBy-error`}
        >
          <option value="">Select who performed this action…</option>
          {assignableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {`${u.name} (${u.role === "ITStaff" ? "IT Staff" : "Administrator"})`}
            </option>
          ))}
        </select>
        <FieldError id={`${idPrefix}-performedBy-error`} message={fieldErrors.performedById} />
      </div>

      <div className="mb-3 form-check">
        <input
          id={`${idPrefix}-followUpRequired`}
          type="checkbox"
          className="form-check-input"
          checked={values.followUpRequired}
          onChange={(e) => update("followUpRequired", e.target.checked)}
          disabled={submitting}
        />
        <label className="form-check-label fw-semibold" htmlFor={`${idPrefix}-followUpRequired`}>
          Follow-up required
        </label>
      </div>

      {values.followUpRequired && (
        <div className="mb-3">
          <label className="form-label fw-semibold" htmlFor={`${idPrefix}-followUpNote`}>
            {"Follow-up note"}
            <span className="zen-required" aria-hidden="true">
              {" *"}
            </span>
            <span className="visually-hidden"> (required)</span>
          </label>
          <textarea
            id={`${idPrefix}-followUpNote`}
            className={`form-control zen-input zen-textarea${fieldErrors.followUpNote ? " zen-invalid" : ""}`}
            rows={2}
            maxLength={FOLLOW_UP_NOTE_MAX}
            value={values.followUpNote}
            onChange={(e) => update("followUpNote", e.target.value)}
            disabled={submitting}
            aria-invalid={fieldErrors.followUpNote ? true : undefined}
            aria-describedby={`${idPrefix}-followUpNote-counter ${idPrefix}-followUpNote-error`}
          />
          <Counter id={`${idPrefix}-followUpNote-counter`} value={values.followUpNote} max={FOLLOW_UP_NOTE_MAX} />
          <FieldError id={`${idPrefix}-followUpNote-error`} message={fieldErrors.followUpNote} />
        </div>
      )}

      <div className="mb-3">
        <label className="form-label fw-semibold" htmlFor={`${idPrefix}-attachmentNotes`}>
          Attachment notes
        </label>
        <input
          id={`${idPrefix}-attachmentNotes`}
          type="text"
          className={`form-control zen-input${fieldErrors.attachmentNotes ? " zen-invalid" : ""}`}
          maxLength={ATTACHMENT_NOTES_MAX}
          value={values.attachmentNotes}
          onChange={(e) => update("attachmentNotes", e.target.value)}
          disabled={submitting}
          aria-invalid={fieldErrors.attachmentNotes ? true : undefined}
          aria-describedby={`${idPrefix}-attachmentNotes-counter ${idPrefix}-attachmentNotes-error`}
        />
        <p className="text-secondary small mt-1 mb-0">
          Which file/image to look at (upload files in Attachments).
        </p>
        <Counter
          id={`${idPrefix}-attachmentNotes-counter`}
          value={values.attachmentNotes}
          max={ATTACHMENT_NOTES_MAX}
        />
        <FieldError id={`${idPrefix}-attachmentNotes-error`} message={fieldErrors.attachmentNotes} />
      </div>

      {formError && (
        <div className="alert zen-error-banner mb-3" role="alert">
          {formError}
        </div>
      )}

      <div className="d-flex flex-wrap gap-2">
        <button type="submit" className="btn zen-btn-primary" disabled={submitting} aria-busy={submitting}>
          {submitting ? busyLabel : submitLabel}
        </button>
        <button type="button" className="btn zen-btn-outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Complete / Cancel dialogs (ui-spec.md §5.3)
// ---------------------------------------------------------------------------

function CompleteDialog({
  action,
  onClose,
  onConfirm,
}: {
  action: ActionTaken;
  onClose: () => void;
  onConfirm: (result: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const trimmed = result.trim();
    if (trimmed.length === 0) {
      setError("Result is required.");
      return;
    }
    setError("");
    setSubmitting(true);
    const outcome = await onConfirm(trimmed);
    if (!outcome.ok) setError(outcome.message ?? "Could not complete the action. Please try again.");
    setSubmitting(false);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Complete action" className="zen-card p-3 mt-3">
      <h2 className="zen-title h6">Complete action</h2>
      <p className="small text-secondary">{action.description}</p>
      <form onSubmit={handleSubmit}>
        <label className="form-label fw-semibold" htmlFor="complete-result">
          {"Result"}
          <span className="zen-required" aria-hidden="true">
            {" *"}
          </span>
          <span className="visually-hidden"> (required)</span>
        </label>
        <textarea
          id="complete-result"
          className={`form-control zen-input zen-textarea${error ? " zen-invalid" : ""}`}
          rows={3}
          maxLength={RESULT_MAX}
          value={result}
          onChange={(e) => {
            setResult(e.target.value);
            setError("");
          }}
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby="complete-result-error"
        />
        <FieldError id="complete-result-error" message={error} />
        <div className="d-flex flex-wrap gap-2 mt-3">
          <button type="submit" className="btn zen-btn-primary" disabled={submitting} aria-busy={submitting}>
            {submitting ? "Completing…" : "Complete Action"}
          </button>
          <button type="button" className="btn zen-btn-outline" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function CancelDialog({
  action,
  onClose,
  onConfirm,
}: {
  action: ActionTaken;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setError("A cancellation reason is required.");
      return;
    }
    if (trimmed.length > CANCEL_REASON_MAX) {
      setError(`Reason must be ${CANCEL_REASON_MAX} characters or fewer.`);
      return;
    }
    setError("");
    setSubmitting(true);
    const outcome = await onConfirm(trimmed);
    if (!outcome.ok) setError(outcome.message ?? "Could not cancel the action. Please try again.");
    setSubmitting(false);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Cancel action" className="zen-card p-3 mt-3">
      <h2 className="zen-title h6">Cancel action</h2>
      <p className="small text-secondary">{action.description}</p>
      <form onSubmit={handleSubmit}>
        <label className="form-label fw-semibold" htmlFor="cancel-reason">
          {"Reason"}
          <span className="zen-required" aria-hidden="true">
            {" *"}
          </span>
          <span className="visually-hidden"> (required)</span>
        </label>
        <textarea
          id="cancel-reason"
          className={`form-control zen-input zen-textarea${error ? " zen-invalid" : ""}`}
          rows={2}
          maxLength={CANCEL_REASON_MAX}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError("");
          }}
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby="cancel-reason-error"
        />
        <FieldError id="cancel-reason-error" message={error} />
        <div className="d-flex flex-wrap gap-2 mt-3">
          <button type="submit" className="btn zen-btn-primary" disabled={submitting} aria-busy={submitting}>
            {submitting ? "Cancelling…" : "Cancel Action"}
          </button>
          <button type="button" className="btn zen-btn-outline" onClick={onClose} disabled={submitting}>
            Keep Action
          </button>
        </div>
      </form>
    </div>
  );
}

/** ui-spec.md §5.3 — offers to reload the fresh record, or keep the draft to copy by hand. */
function StaleDialog({
  current,
  draftSummary,
  onReload,
  onDismiss,
}: {
  current: ActionTaken;
  draftSummary: string;
  onReload: () => void;
  onDismiss: () => void;
}) {
  const [showCopyBox, setShowCopyBox] = useState(false);
  const who = current.updatedBy?.name ?? current.performedBy.name;

  return (
    <div role="dialog" aria-modal="true" aria-label="Action changed by someone else" className="zen-card p-3 mt-3">
      <p className="mb-3">
        {`This action was changed by ${who} at ${formatDateTime(current.updatedAt)}.`}
      </p>
      {showCopyBox ? (
        <>
          <label className="form-label fw-semibold" htmlFor="stale-copy-box">
            Your changes (copy anything you want to keep)
          </label>
          <textarea
            id="stale-copy-box"
            className="form-control zen-input zen-textarea"
            rows={4}
            readOnly
            value={draftSummary}
          />
        </>
      ) : null}
      <div className="d-flex flex-wrap gap-2 mt-3">
        <button type="button" className="btn zen-btn-primary" onClick={onReload}>
          Reload latest
        </button>
        <button type="button" className="btn zen-btn-outline" onClick={() => setShowCopyBox(true)}>
          Copy my changes
        </button>
        {showCopyBox && (
          <button type="button" className="btn zen-btn-outline" onClick={onDismiss}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row / card fields shared between the desktop table and the mobile cards
// ---------------------------------------------------------------------------

function RowButtons({
  action,
  canWrite,
  onView,
  onEdit,
  onComplete,
  onCancel,
}: {
  action: ActionTaken;
  canWrite: boolean;
  onView: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="d-flex flex-wrap gap-2">
      <button type="button" className="btn btn-sm zen-btn-outline" onClick={onView}>
        View
      </button>
      {canWrite && action.status !== "Cancelled" && (
        <button type="button" className="btn btn-sm zen-btn-outline" onClick={onEdit}>
          Edit
        </button>
      )}
      {canWrite && action.status === "Planned" && (
        <button type="button" className="btn btn-sm zen-btn-outline" onClick={onComplete}>
          Complete
        </button>
      )}
      {canWrite && action.status !== "Cancelled" && (
        <button type="button" className="btn btn-sm zen-btn-outline" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

type Dialog =
  | { kind: "view"; action: ActionTaken }
  | { kind: "edit"; action: ActionTaken }
  | { kind: "complete"; action: ActionTaken }
  | { kind: "cancel"; action: ActionTaken }
  | {
      kind: "stale";
      current: ActionTaken;
      draftSummary: string;
      retry: { kind: "edit" | "complete" | "cancel"; action: ActionTaken };
    }
  | null;

export default function ActionsTakenSection({
  ticketId,
  ticketCreatedAt,
  currentUserId,
  canWrite,
  ticketLocked,
  assignableUsers,
  onActionsChanged,
}: {
  ticketId: number;
  ticketCreatedAt: string;
  currentUserId: number;
  /** True for IT Staff and Administrator; false (read-only) for a Requester. */
  canWrite: boolean;
  /** True when the Ticket is Closed or Cancelled — Add Action is hidden. */
  ticketLocked: boolean;
  assignableUsers: AssignableUser[];
  /** Actions Taken touch the Ticket's updatedAt (api-spec.md §2.2); lets the parent refresh. */
  onActionsChanged?: () => void;
}) {
  const [actions, setActions] = useState<ActionTaken[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [clientRequestId, setClientRequestId] = useState(newClientRequestId);

  const [dialog, setDialog] = useState<Dialog>(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage("");
    try {
      const { items } = await fetchActionsTaken(ticketId);
      setActions(items);
      setLoadState("ready");
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : "Could not load actions taken. Please try again.");
      setLoadState("error");
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  function replaceAction(updated: ActionTaken) {
    setActions((current) => current.map((a) => (a.id === updated.id ? updated : a)));
  }

  function messageFor(err: unknown, fallback: string): string {
    return err instanceof ApiError ? err.message : fallback;
  }

  async function handleCreate(values: ActionFormValues): Promise<ActionFormResult> {
    const actionAtIso = fromDatetimeLocal(values.actionAt);
    try {
      const created = await createActionTaken(ticketId, {
        clientRequestId,
        actionAt: actionAtIso!,
        description: values.description.trim(),
        status: values.status,
        result: values.result.trim() ? values.result.trim() : undefined,
        performedById: Number(values.performedById),
        followUpRequired: values.followUpRequired,
        followUpNote: values.followUpRequired ? values.followUpNote.trim() : undefined,
        attachmentNotes: values.attachmentNotes.trim() ? values.attachmentNotes.trim() : undefined,
      });
      setActions((current) => [...current, created].sort((a, b) => a.actionAt.localeCompare(b.actionAt) || a.id - b.id));
      setShowCreate(false);
      // A fresh id for the next Add Action; a failed submit keeps this one so
      // a retry with the same content is idempotent (AC-11, AC-32).
      setClientRequestId(newClientRequestId());
      onActionsChanged?.();
      return { ok: true };
    } catch (err) {
      if (err instanceof ApiError) {
        return { ok: false, fieldErrors: err.fieldErrors as ActionFieldErrors, message: err.message };
      }
      return { ok: false, message: "Could not save the action. Please try again." };
    }
  }

  async function handleEdit(action: ActionTaken, values: ActionFormValues): Promise<ActionFormResult> {
    const actionAtIso = fromDatetimeLocal(values.actionAt);
    try {
      const updated = await editActionTaken(ticketId, action.id, {
        version: action.version,
        actionAt: actionAtIso!,
        description: values.description.trim(),
        result: values.result.trim() ? values.result.trim() : undefined,
        performedById: Number(values.performedById),
        followUpRequired: values.followUpRequired,
        followUpNote: values.followUpRequired ? values.followUpNote.trim() : undefined,
        attachmentNotes: values.attachmentNotes.trim() ? values.attachmentNotes.trim() : undefined,
      });
      replaceAction(updated);
      setDialog(null);
      onActionsChanged?.();
      return { ok: true };
    } catch (err) {
      if (err instanceof StaleActionError) {
        setDialog({
          kind: "stale",
          current: err.current,
          draftSummary: `Description: ${values.description}\n\nResult: ${values.result}\n\nFollow-up note: ${values.followUpNote}`,
          retry: { kind: "edit", action },
        });
        return { ok: false, message: err.message };
      }
      if (err instanceof ApiError) {
        return { ok: false, fieldErrors: err.fieldErrors as ActionFieldErrors, message: err.message };
      }
      return { ok: false, message: "Could not save the action. Please try again." };
    }
  }

  async function handleComplete(action: ActionTaken, result: string) {
    try {
      const updated = await completeActionTaken(ticketId, action.id, {
        version: action.version,
        result,
        followUpRequired: false,
      });
      replaceAction(updated);
      setDialog(null);
      onActionsChanged?.();
      return { ok: true };
    } catch (err) {
      if (err instanceof StaleActionError) {
        setDialog({
          kind: "stale",
          current: err.current,
          draftSummary: `Result: ${result}`,
          retry: { kind: "complete", action },
        });
        return { ok: false, message: err.message };
      }
      return { ok: false, message: messageFor(err, "Could not complete the action. Please try again.") };
    }
  }

  async function handleCancelAction(action: ActionTaken, reason: string) {
    try {
      const updated = await cancelActionTaken(ticketId, action.id, { version: action.version, reason });
      replaceAction(updated);
      setDialog(null);
      onActionsChanged?.();
      return { ok: true };
    } catch (err) {
      if (err instanceof StaleActionError) {
        setDialog({
          kind: "stale",
          current: err.current,
          draftSummary: `Cancellation reason: ${reason}`,
          retry: { kind: "cancel", action },
        });
        return { ok: false, message: err.message };
      }
      return { ok: false, message: messageFor(err, "Could not cancel the action. Please try again.") };
    }
  }

  function formValuesFor(action: ActionTaken): ActionFormValues {
    return {
      actionAt: toDatetimeLocal(new Date(action.actionAt)),
      description: action.description,
      status: action.status === "Cancelled" ? "Completed" : action.status,
      result: action.result ?? "",
      performedById: String(action.performedBy.id),
      followUpRequired: action.followUpRequired,
      followUpNote: action.followUpNote ?? "",
      attachmentNotes: action.attachmentNotes ?? "",
    };
  }

  function reloadFromStale(current: ActionTaken) {
    replaceAction(current);
    setDialog(null);
  }

  return (
    <section id="actions-taken-section" className="zen-card p-4 mt-3" aria-label="Actions Taken">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h2 className="zen-title h5 mb-0 me-auto">{`Actions Taken (${actions.length})`}</h2>
        {canWrite && !ticketLocked && !showCreate && (
          <button type="button" className="btn zen-btn-primary" onClick={() => setShowCreate(true)}>
            + Add Action
          </button>
        )}
      </div>

      {canWrite && (
        <p className="text-secondary small mb-3">
          {ticketLocked
            ? "This ticket is closed — actions are read-only."
            : "Visible to the requester."}
        </p>
      )}
      {!canWrite && <p className="text-secondary small mb-3">Work done by IT on your request.</p>}

      {loadState === "loading" && (
        <p className="text-secondary" role="status">
          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
          Loading actions taken…
        </p>
      )}

      {loadState === "error" && (
        <div className="alert zen-error-banner" role="alert">
          <strong>Could not load actions taken.</strong>
          <p className="mb-2 mt-1 small">{errorMessage}</p>
          <button type="button" className="btn btn-sm zen-btn-outline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {loadState === "ready" && actions.length === 0 && (
        <p className="text-secondary mb-0" data-testid="no-actions-taken">
          {`No actions recorded yet.${canWrite && !ticketLocked ? " Add the first action." : ""}`}
        </p>
      )}

      {loadState === "ready" && actions.length > 0 && (
        <>
          {/* Desktop table (ui-spec.md §5.1) */}
          <div className="d-none d-lg-block table-responsive">
            <table className="table zen-table mb-0" data-testid="actions-taken-table">
              <caption className="visually-hidden">Actions taken on this ticket</caption>
              <thead>
                <tr>
                  <th scope="col">Date/Time</th>
                  <th scope="col">Description</th>
                  <th scope="col">Result</th>
                  <th scope="col">Performed by</th>
                  <th scope="col">Follow-up</th>
                  <th scope="col">Attachments note</th>
                  <th scope="col">Status</th>
                  {canWrite && <th scope="col">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {actions.map((action) => (
                  <tr key={action.id} data-testid="action-row">
                    <td>{formatDateTime(action.actionAt)}</td>
                    <td style={{ whiteSpace: "pre-wrap" }}>{action.description}</td>
                    <td style={{ whiteSpace: "pre-wrap" }}>{action.result ?? "—"}</td>
                    <td>{performedByLabel(action)}</td>
                    <td>{followUpSummary(action)}</td>
                    <td>{action.attachmentNotes ?? "—"}</td>
                    <td>
                      <StatusBadge status={action.status} />
                      {action.status === "Cancelled" && action.cancelReason && (
                        <p className="text-secondary small mb-0 mt-1">{`Reason: ${action.cancelReason}`}</p>
                      )}
                    </td>
                    {canWrite && (
                      <td>
                        <RowButtons
                          action={action}
                          canWrite={canWrite && !ticketLocked}
                          onView={() => setDialog({ kind: "view", action })}
                          onEdit={() => setDialog({ kind: "edit", action })}
                          onComplete={() => setDialog({ kind: "complete", action })}
                          onCancel={() => setDialog({ kind: "cancel", action })}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet cards (ui-spec.md §5.1) */}
          <div className="d-lg-none" data-testid="actions-taken-cards">
            {actions.map((action) => (
              <div key={action.id} className="zen-card p-3 mb-2" data-testid="action-card">
                <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                  <span className="fw-semibold me-auto">{formatDateTime(action.actionAt)}</span>
                  <StatusBadge status={action.status} />
                </div>
                <p className="mb-1" style={{ whiteSpace: "pre-wrap" }}>
                  {action.description}
                </p>
                {action.result && (
                  <p className="mb-1 small">
                    <span className="fw-semibold">Result: </span>
                    {action.result}
                  </p>
                )}
                <p className="mb-1 small">
                  <span className="fw-semibold">Performed by: </span>
                  {performedByLabel(action)}
                </p>
                <p className="mb-1 small">
                  <span className="fw-semibold">Follow-up: </span>
                  {followUpSummary(action)}
                </p>
                {action.attachmentNotes && (
                  <p className="mb-1 small">
                    <span className="fw-semibold">Attachments note: </span>
                    {action.attachmentNotes}
                  </p>
                )}
                {action.status === "Cancelled" && action.cancelReason && (
                  <p className="text-secondary small mb-2">{`Reason: ${action.cancelReason}`}</p>
                )}
                {canWrite && (
                  <RowButtons
                    action={action}
                    canWrite={canWrite && !ticketLocked}
                    onView={() => setDialog({ kind: "view", action })}
                    onEdit={() => setDialog({ kind: "edit", action })}
                    onComplete={() => setDialog({ kind: "complete", action })}
                    onCancel={() => setDialog({ kind: "cancel", action })}
                  />
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {canWrite && showCreate && (
        <ActionForm
          mode="create"
          initial={{ ...EMPTY_ACTION_FORM, actionAt: nowAsDatetimeLocal(), performedById: String(currentUserId) }}
          assignableUsers={assignableUsers}
          ticketCreatedAt={ticketCreatedAt}
          submitLabel="Save Action"
          busyLabel="Saving…"
          onCancel={() => setShowCreate(false)}
          onSubmit={handleCreate}
        />
      )}

      {dialog?.kind === "view" && (
        <div role="dialog" aria-modal="true" aria-label="Action details" className="zen-card p-3 mt-3">
          <h2 className="zen-title h6">Action details</h2>
          <dl className="row mb-0">
            <dt className="col-sm-4">Date/Time</dt>
            <dd className="col-sm-8">{formatDateTime(dialog.action.actionAt)}</dd>
            <dt className="col-sm-4">Description</dt>
            <dd className="col-sm-8" style={{ whiteSpace: "pre-wrap" }}>
              {dialog.action.description}
            </dd>
            <dt className="col-sm-4">Result</dt>
            <dd className="col-sm-8" style={{ whiteSpace: "pre-wrap" }}>
              {dialog.action.result ?? "—"}
            </dd>
            <dt className="col-sm-4">Performed by</dt>
            <dd className="col-sm-8">{performedByLabel(dialog.action)}</dd>
            <dt className="col-sm-4">Follow-up</dt>
            <dd className="col-sm-8">{followUpSummary(dialog.action)}</dd>
            <dt className="col-sm-4">Attachments note</dt>
            <dd className="col-sm-8">{dialog.action.attachmentNotes ?? "—"}</dd>
            <dt className="col-sm-4">Status</dt>
            <dd className="col-sm-8">
              <StatusBadge status={dialog.action.status} />
            </dd>
            {dialog.action.createdBy && (
              <>
                <dt className="col-sm-4">Created by</dt>
                <dd className="col-sm-8">{`${dialog.action.createdBy.name} at ${formatDateTime(dialog.action.createdAt)}`}</dd>
              </>
            )}
            {dialog.action.updatedBy && (
              <>
                <dt className="col-sm-4">Last updated by</dt>
                <dd className="col-sm-8">{`${dialog.action.updatedBy.name} at ${formatDateTime(dialog.action.updatedAt)}`}</dd>
              </>
            )}
            {dialog.action.completedAt && (
              <>
                <dt className="col-sm-4">Completed at</dt>
                <dd className="col-sm-8">{formatDateTime(dialog.action.completedAt)}</dd>
              </>
            )}
            {dialog.action.cancelledAt && (
              <>
                <dt className="col-sm-4">Cancelled at</dt>
                <dd className="col-sm-8">{formatDateTime(dialog.action.cancelledAt)}</dd>
                <dt className="col-sm-4">Cancellation reason</dt>
                <dd className="col-sm-8">{dialog.action.cancelReason}</dd>
              </>
            )}
          </dl>
          <div className="d-flex flex-wrap gap-2 mt-3">
            {canWrite && !ticketLocked && dialog.action.status !== "Cancelled" && (
              <button type="button" className="btn zen-btn-outline" onClick={() => setDialog({ kind: "edit", action: dialog.action })}>
                Edit
              </button>
            )}
            <button type="button" className="btn zen-btn-outline" onClick={() => setDialog(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      {dialog?.kind === "edit" && (
        <div role="dialog" aria-modal="true" aria-label="Edit action" className="zen-card p-3 mt-3">
          <h2 className="zen-title h6">Edit action</h2>
          <ActionForm
            mode="edit"
            initial={formValuesFor(dialog.action)}
            assignableUsers={assignableUsers}
            ticketCreatedAt={ticketCreatedAt}
            submitLabel="Save Changes"
            busyLabel="Saving…"
            onCancel={() => setDialog(null)}
            onSubmit={(values) => handleEdit(dialog.action, values)}
          />
        </div>
      )}

      {dialog?.kind === "complete" && (
        <CompleteDialog
          action={dialog.action}
          onClose={() => setDialog(null)}
          onConfirm={(result) => handleComplete(dialog.action, result)}
        />
      )}

      {dialog?.kind === "cancel" && (
        <CancelDialog
          action={dialog.action}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => handleCancelAction(dialog.action, reason)}
        />
      )}

      {dialog?.kind === "stale" && (
        <StaleDialog
          current={dialog.current}
          draftSummary={dialog.draftSummary}
          onReload={() => reloadFromStale(dialog.current)}
          onDismiss={() => setDialog(null)}
        />
      )}
    </section>
  );
}
