import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  REQUESTED_PRIORITIES,
  createTicket,
  fetchCategories,
  fetchRelatedSystems,
  type CreatedTicket,
  type ReferenceItem,
  type RequestedPriority,
} from "./api.js";
import { useRequester } from "./RequesterContext.js";
import {
  EMPTY_TICKET_FORM,
  priorityLabel,
  validateTicketForm,
  DESCRIPTION_MAX,
  SUMMARY_MAX,
  type TicketFieldErrors,
  type TicketFormValues,
} from "./ticketFormRules.js";
import {
  ALLOWED_EXTENSIONS,
  MAX_ACTIVE_ATTACHMENTS,
  formatFileSize,
  selectAttachments,
  type RejectedAttachment,
  type SelectedAttachment,
} from "./attachmentRules.js";

/** Red asterisk plus text, so "required" is never conveyed by colour alone. */
function RequiredMark() {
  return (
    <>
      <span className="zen-required" aria-hidden="true">
        {" *"}
      </span>
      <span className="visually-hidden"> (required)</span>
    </>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="zen-error-text small mt-1 mb-0" id={id}>
      {message}
    </p>
  );
}

interface CreateTicketProps {
  /** Lets the success panel offer a way out of the form. */
  onDone?: () => void;
}

export default function CreateTicket({ onDone }: CreateTicketProps) {
  const { selectedRequester } = useRequester();

  const [values, setValues] = useState<TicketFormValues>(EMPTY_TICKET_FORM);
  const [fieldErrors, setFieldErrors] = useState<TicketFieldErrors>({});
  const [formError, setFormError] = useState("");

  const [categories, setCategories] = useState<ReferenceItem[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<ReferenceItem[]>([]);
  const [referenceState, setReferenceState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [referenceReloadToken, setReferenceReloadToken] = useState(0);

  const [attachments, setAttachments] = useState<SelectedAttachment[]>([]);
  const [attachmentErrors, setAttachmentErrors] = useState<
    RejectedAttachment[]
  >([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedTicket | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reference data comes from the backend, never from a hard-coded list.
  useEffect(() => {
    let cancelled = false;
    setReferenceState("loading");

    Promise.all([fetchCategories(), fetchRelatedSystems()])
      .then(([loadedCategories, loadedSystems]) => {
        if (cancelled) return;
        setCategories(loadedCategories);
        setRelatedSystems(loadedSystems);
        setReferenceState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setReferenceState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [referenceReloadToken]);

  if (!selectedRequester) return null;

  function updateField(field: keyof TicketFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    // Clear the message for a field as soon as the user edits it.
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function handleFilesPicked(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const { accepted, rejected } = selectAttachments(
      Array.from(fileList),
      attachments,
    );

    setAttachments((current) => [...current, ...accepted]);
    setAttachmentErrors(rejected);

    // Reset the input so picking the same file again still fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(name: string) {
    setAttachments((current) => current.filter((a) => a.name !== name));
    setAttachmentErrors([]);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // BR-18 — ignore a second submit while one is in flight.
    if (isSubmitting) return;

    setFormError("");

    const errors = validateTicketForm(values);
    if (Object.keys(errors).length > 0) {
      // AC-07 — the API is not called when client validation fails.
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const ticket = await createTicket({
        requesterId: selectedRequester!.id,
        categoryId: Number(values.categoryId),
        relatedSystemId: Number(values.relatedSystemId),
        summary: values.summary.trim(),
        description: values.description.trim(),
        requestedPriority: values.requestedPriority as RequestedPriority,
      });
      setCreated(ticket);
    } catch (err) {
      // BR-20 — `values` is untouched here, so everything the user typed
      // stays on screen for correction or retry.
      if (err instanceof ApiError) {
        setFieldErrors((current) => ({ ...current, ...err.fieldErrors }));
        setFormError(err.message);
      } else {
        setFormError("Could not create the ticket. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Success — show the official Ticket Number returned by the backend.
  // -------------------------------------------------------------------------
  if (created) {
    return (
      <main className="container py-4" style={{ maxWidth: 720 }}>
        <div className="zen-card p-4">
          <div className="zen-success-banner mb-4" role="status">
            <strong>Ticket created successfully.</strong>
          </div>

          <h2 className="zen-title h5 mb-3">Your ticket number</h2>
          <p className="zen-ticket-number mb-4" data-testid="created-ticket-number">
            {created.ticketNumber}
          </p>

          <dl className="row mb-0">
            <dt className="col-sm-4 fw-semibold">Ticket date</dt>
            <dd className="col-sm-8">
              {new Date(created.ticketDate).toLocaleString()}
            </dd>

            <dt className="col-sm-4 fw-semibold">Current status</dt>
            <dd className="col-sm-8" data-testid="created-status">
              {created.currentStatus}
            </dd>

            <dt className="col-sm-4 fw-semibold">Requester</dt>
            <dd className="col-sm-8">{created.requester.name}</dd>

            <dt className="col-sm-4 fw-semibold">Category</dt>
            <dd className="col-sm-8">{created.category.name}</dd>

            <dt className="col-sm-4 fw-semibold">Related system</dt>
            <dd className="col-sm-8">{created.relatedSystem.name}</dd>

            <dt className="col-sm-4 fw-semibold">Summary</dt>
            <dd className="col-sm-8 mb-0">{created.summary}</dd>
          </dl>

          {attachments.length > 0 && (
            <div className="alert zen-warning-banner mt-4 mb-0" role="status">
              <strong>
                {attachments.length} selected{" "}
                {attachments.length === 1 ? "file was" : "files were"} not
                uploaded.
              </strong>
              <p className="mb-0 mt-1 small">
                Attachment upload is delivered by the Attachments issue. The
                ticket above is saved and unaffected.
              </p>
            </div>
          )}

          <div className="d-flex flex-wrap gap-2 mt-4">
            <button
              type="button"
              className="btn zen-btn-primary"
              onClick={() => {
                setCreated(null);
                setValues(EMPTY_TICKET_FORM);
                setAttachments([]);
                setAttachmentErrors([]);
              }}
            >
              Create another ticket
            </button>
            {onDone && (
              <button
                type="button"
                className="btn zen-btn-outline"
                onClick={onDone}
              >
                Done
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------------------
  // Form
  // -------------------------------------------------------------------------
  return (
    <main className="container py-4" style={{ maxWidth: 720 }}>
      <h1 className="zen-title h4 mb-3">Create Ticket</h1>

      <form
        className="zen-card p-4"
        onSubmit={handleSubmit}
        aria-label="Create Ticket"
        noValidate
      >
        {/* System-generated fields sit at the top and are read-only. */}
        <div className="row g-3 mb-4">
          <div className="col-sm-6">
            <label className="form-label fw-semibold" htmlFor="ticket-number">
              Ticket Number
            </label>
            <input
              id="ticket-number"
              className="form-control zen-readonly-field"
              value="Generated after creation"
              readOnly
              tabIndex={-1}
            />
          </div>
          <div className="col-sm-6">
            <label className="form-label fw-semibold" htmlFor="ticket-date">
              Ticket Date
            </label>
            <input
              id="ticket-date"
              className="form-control zen-readonly-field"
              value="Generated after creation"
              readOnly
              tabIndex={-1}
            />
          </div>
          <div className="col-12">
            <label className="form-label fw-semibold" htmlFor="ticket-requester">
              Requester
            </label>
            <input
              id="ticket-requester"
              className="form-control zen-readonly-field"
              value={selectedRequester.name}
              readOnly
              tabIndex={-1}
            />
          </div>
        </div>

        {referenceState === "error" && (
          <div className="alert zen-error-banner" role="alert">
            <strong>Could not load categories and related systems.</strong>
            <p className="mb-2 mt-1 small">
              The form cannot be submitted until reference data loads.
            </p>
            <button
              type="button"
              className="btn btn-sm zen-btn-outline"
              onClick={() => setReferenceReloadToken((t) => t + 1)}
            >
              Retry
            </button>
          </div>
        )}

        {referenceState === "loading" && (
          <p className="text-secondary" role="status">
            <span
              className="spinner-border spinner-border-sm me-2"
              aria-hidden="true"
            />
            Loading categories and related systems…
          </p>
        )}

        <div className="row g-3">
          <div className="col-sm-6">
            <label className="form-label fw-semibold" htmlFor="ticket-category">
              Category
              <RequiredMark />
            </label>
            <select
              id="ticket-category"
              className={`form-select zen-select${fieldErrors.categoryId ? " zen-invalid" : ""}`}
              value={values.categoryId}
              onChange={(e) => updateField("categoryId", e.target.value)}
              aria-invalid={fieldErrors.categoryId ? true : undefined}
              aria-describedby={
                fieldErrors.categoryId ? "ticket-category-error" : undefined
              }
              disabled={referenceState !== "ready"}
            >
              <option value="">Select a category…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <FieldError
              id="ticket-category-error"
              message={fieldErrors.categoryId}
            />
          </div>

          <div className="col-sm-6">
            <label className="form-label fw-semibold" htmlFor="ticket-system">
              Related System
              <RequiredMark />
            </label>
            <select
              id="ticket-system"
              className={`form-select zen-select${fieldErrors.relatedSystemId ? " zen-invalid" : ""}`}
              value={values.relatedSystemId}
              onChange={(e) => updateField("relatedSystemId", e.target.value)}
              aria-invalid={fieldErrors.relatedSystemId ? true : undefined}
              aria-describedby={
                fieldErrors.relatedSystemId ? "ticket-system-error" : undefined
              }
              disabled={referenceState !== "ready"}
            >
              <option value="">Select a related system…</option>
              {relatedSystems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.name}
                </option>
              ))}
            </select>
            <FieldError
              id="ticket-system-error"
              message={fieldErrors.relatedSystemId}
            />
          </div>

          <div className="col-12">
            <label className="form-label fw-semibold" htmlFor="ticket-summary">
              Ticket Summary
              <RequiredMark />
            </label>
            <input
              id="ticket-summary"
              className={`form-control zen-input${fieldErrors.summary ? " zen-invalid" : ""}`}
              value={values.summary}
              onChange={(e) => updateField("summary", e.target.value)}
              maxLength={SUMMARY_MAX}
              aria-invalid={fieldErrors.summary ? true : undefined}
              aria-describedby={
                fieldErrors.summary ? "ticket-summary-error" : undefined
              }
            />
            <FieldError
              id="ticket-summary-error"
              message={fieldErrors.summary}
            />
          </div>

          <div className="col-sm-6">
            <label className="form-label fw-semibold" htmlFor="ticket-priority">
              Requested Priority
              <RequiredMark />
            </label>
            <select
              id="ticket-priority"
              className={`form-select zen-select${fieldErrors.requestedPriority ? " zen-invalid" : ""}`}
              value={values.requestedPriority}
              onChange={(e) => updateField("requestedPriority", e.target.value)}
              aria-invalid={fieldErrors.requestedPriority ? true : undefined}
              aria-describedby={
                fieldErrors.requestedPriority
                  ? "ticket-priority-error"
                  : undefined
              }
            >
              <option value="">Select a priority…</option>
              {REQUESTED_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priorityLabel(priority)}
                </option>
              ))}
            </select>
            <FieldError
              id="ticket-priority-error"
              message={fieldErrors.requestedPriority}
            />
          </div>

          <div className="col-12">
            <label
              className="form-label fw-semibold"
              htmlFor="ticket-description"
            >
              Description
              <RequiredMark />
            </label>
            <textarea
              id="ticket-description"
              className={`form-control zen-input zen-textarea${fieldErrors.description ? " zen-invalid" : ""}`}
              rows={6}
              value={values.description}
              onChange={(e) => updateField("description", e.target.value)}
              maxLength={DESCRIPTION_MAX}
              aria-invalid={fieldErrors.description ? true : undefined}
              aria-describedby={
                fieldErrors.description ? "ticket-description-error" : undefined
              }
            />
            <FieldError
              id="ticket-description-error"
              message={fieldErrors.description}
            />
          </div>
        </div>

        {/* Attachments sit below the primary ticket information. */}
        <fieldset className="mt-4">
          <legend className="form-label fw-semibold mb-1">Attachments</legend>
          <p className="text-secondary small">
            JPG, JPEG, PNG, WEBP, or PDF. Up to 5 MB each, at most{" "}
            {MAX_ACTIVE_ATTACHMENTS} files.
          </p>

          <input
            ref={fileInputRef}
            id="ticket-attachments"
            type="file"
            multiple
            className="form-control zen-input"
            accept={ALLOWED_EXTENSIONS.join(",")}
            aria-label="Select attachments"
            onChange={(e) => handleFilesPicked(e.target.files)}
            disabled={attachments.length >= MAX_ACTIVE_ATTACHMENTS}
          />

          {attachments.length >= MAX_ACTIVE_ATTACHMENTS && (
            <p className="text-secondary small mt-1 mb-0">
              Attachment limit reached. Remove a file to select another.
            </p>
          )}

          {attachmentErrors.length > 0 && (
            <ul className="list-unstyled mt-2 mb-0" role="alert">
              {attachmentErrors.map((rejected) => (
                <li
                  key={`${rejected.name}-${rejected.reason}`}
                  className="zen-error-text small"
                >
                  {rejected.name}: {rejected.reason}
                </li>
              ))}
            </ul>
          )}

          {attachments.length > 0 && (
            <ul className="list-group mt-3" data-testid="selected-attachments">
              {attachments.map((attachment) => (
                <li
                  key={attachment.name}
                  className="list-group-item d-flex flex-wrap align-items-center gap-2"
                >
                  <span
                    className="me-auto text-break"
                    data-testid="attachment-name"
                  >
                    {attachment.name}
                  </span>
                  <span className="text-secondary small">
                    {formatFileSize(attachment.size)}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm zen-btn-outline"
                    onClick={() => removeAttachment(attachment.name)}
                  >
                    Remove
                    <span className="visually-hidden">
                      {` ${attachment.name}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        {formError && (
          <div className="alert zen-error-banner mt-4 mb-0" role="alert">
            <strong>Could not create the ticket.</strong>
            <p className="mb-0 mt-1 small">{formError}</p>
          </div>
        )}

        <div className="mt-4">
          <button
            type="submit"
            className="btn zen-btn-primary"
            disabled={isSubmitting || referenceState !== "ready"}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? "Creating ticket…" : "Create Ticket"}
          </button>
        </div>
      </form>
    </main>
  );
}
