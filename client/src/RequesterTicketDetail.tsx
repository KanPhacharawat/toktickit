import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  fetchPublicComments,
  fetchTicketDetail,
  postPublicComment,
  reportProblemResolved,
  type ThreadEntry,
  type TicketDetail,
} from "./api.js";
import AttachmentSection from "./AttachmentSection.js";
import { priorityLabel } from "./ticketFormRules.js";

const COMMENT_MAX = 2000;

/** Turns InProgress into "In Progress" for display. */
function statusLabel(status: string): string {
  return status.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/**
 * A read-only field (ui-spec.md §7). Every value on this screen is
 * system-owned, so all of them use the read-only treatment.
 */
function DetailField({
  label,
  value,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="col-12 col-md-6">
      <p className="form-label fw-semibold mb-1">{label}</p>
      <p className="zen-readonly-value mb-0" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

/** Public Comments thread and composer (ui-spec.md §10.1). */
function PublicComments({
  ticketId,
  canAddComment,
  refreshToken,
  onPosted,
}: {
  ticketId: number;
  canAddComment: boolean;
  refreshToken: number;
  onPosted: () => void;
}) {
  const [entries, setEntries] = useState<ThreadEntry[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");

  const load = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage("");
    try {
      const data = await fetchPublicComments(ticketId);
      setEntries(data);
      setLoadState("ready");
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError ? err.message : "Could not load comments. Please try again.",
      );
      setLoadState("error");
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (posting) return;

    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      setDraftError("Comment is required.");
      return;
    }
    if (trimmed.length > COMMENT_MAX) {
      setDraftError(`Comment must be ${COMMENT_MAX} characters or fewer.`);
      return;
    }

    setDraftError("");
    setPostError("");
    setPosting(true);
    try {
      const entry = await postPublicComment(ticketId, draft);
      setEntries((current) => [...current, entry]);
      setDraft("");
      onPosted();
    } catch (err) {
      setPostError(
        err instanceof ApiError ? err.message : "Could not post the comment. Please try again.",
      );
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="zen-card p-4 mt-3" aria-label="Public Comments">
      <div className="zen-testing-banner mb-2">Public — visible to the requester</div>
      <h2 className="zen-title h5 mb-3">{`Public Comments (${entries.length})`}</h2>

      {loadState === "loading" && (
        <p className="text-secondary" role="status">
          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
          Loading comments…
        </p>
      )}

      {loadState === "error" && (
        <div className="alert zen-error-banner" role="alert">
          <strong>Could not load comments.</strong>
          <p className="mb-2 mt-1 small">{errorMessage}</p>
          <button type="button" className="btn btn-sm zen-btn-outline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {loadState === "ready" && entries.length === 0 && (
        <p className="text-secondary mb-0">No public comments yet.</p>
      )}

      {loadState === "ready" && entries.length > 0 && (
        <ol className="list-unstyled mb-0" data-testid="public-comment-list">
          {entries.map((entry) => (
            <li key={entry.id} className="mb-3 pb-3 border-bottom">
              <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                <span className="fw-semibold">{entry.author.name}</span>
                <span className="zen-badge zen-status">{entry.author.role}</span>
                <time className="text-secondary small" dateTime={entry.createdAt}>
                  {new Date(entry.createdAt).toLocaleString()}
                </time>
              </div>
              <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                {entry.body}
              </p>
            </li>
          ))}
        </ol>
      )}

      {canAddComment ? (
        <form className="mt-4" onSubmit={handleSubmit}>
          <label className="form-label fw-semibold" htmlFor="public-comment-draft">
            Add a public comment
            <span className="zen-required" aria-hidden="true">
              {" *"}
            </span>
            <span className="visually-hidden"> (required)</span>
          </label>
          <textarea
            id="public-comment-draft"
            className={`form-control zen-input zen-textarea${draftError ? " zen-invalid" : ""}`}
            rows={3}
            maxLength={COMMENT_MAX}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDraftError("");
            }}
            disabled={posting}
            aria-invalid={draftError ? true : undefined}
            aria-describedby="public-comment-counter public-comment-error"
          />
          <p id="public-comment-counter" className="text-secondary small mt-1 mb-0">
            {`${draft.length} / ${COMMENT_MAX}`}
          </p>
          {draftError && (
            <p id="public-comment-error" className="zen-error-text small mt-1 mb-0">
              {draftError}
            </p>
          )}
          {postError && (
            <div className="alert zen-error-banner mt-2 mb-0" role="alert">
              {postError}
            </div>
          )}
          <button
            type="submit"
            className="btn zen-btn-primary mt-2"
            disabled={posting}
            aria-busy={posting}
          >
            {posting ? "Posting…" : "Post Public Comment"}
          </button>
        </form>
      ) : (
        <p className="text-secondary small mt-3 mb-0">
          This ticket is closed. New public comments are not accepted.
        </p>
      )}
    </section>
  );
}

/** "Problem Appears Resolved" panel and confirmation dialog (ui-spec.md §8.2–8.3). */
function ResolutionPanel({
  ticketId,
  canReport,
  alreadyReported,
  onReported,
}: {
  ticketId: number;
  canReport: boolean;
  alreadyReported: string | null;
  onReported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");

  if (!canReport && !alreadyReported) return null;

  async function confirmSend() {
    if (sending) return;
    setSending(true);
    setError("");
    try {
      await reportProblemResolved(ticketId, note.trim());
      setOpen(false);
      setNote("");
      setBanner("Thanks — IT Staff have been notified.");
      onReported();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not send the report. Please try again.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="zen-card p-4 mb-3" aria-label="Problem resolution">
      {banner && (
        <div className="zen-success-banner mb-3" role="status">
          {banner}
        </div>
      )}

      {alreadyReported ? (
        <p className="mb-0">
          {`You reported that the problem appears resolved on ${new Date(alreadyReported).toLocaleString()}. IT Staff will confirm and update the ticket.`}
        </p>
      ) : (
        <>
          <p className="mb-2">Is the problem fixed on your side?</p>
          <button type="button" className="btn zen-btn-outline" onClick={() => setOpen(true)}>
            Problem Appears Resolved
          </button>
        </>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Report problem appears resolved"
          className="zen-card p-3 mt-3"
        >
          <h2 className="zen-title h6">Report problem appears resolved</h2>
          <p className="small text-secondary">
            This lets IT Staff know the problem seems fixed. It does not resolve or close the
            ticket — IT Staff will do that.
          </p>

          <label className="form-label fw-semibold" htmlFor="resolution-note">
            Add a note
          </label>
          <textarea
            id="resolution-note"
            className="form-control zen-input zen-textarea"
            rows={3}
            maxLength={COMMENT_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={sending}
          />
          <p className="text-secondary small mt-1 mb-0">{`${note.length} / ${COMMENT_MAX}`}</p>

          {error && (
            <div className="alert zen-error-banner mt-2 mb-0" role="alert">
              {error}
            </div>
          )}

          <div className="d-flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              className="btn zen-btn-primary"
              onClick={confirmSend}
              disabled={sending}
              aria-busy={sending}
            >
              {sending ? "Sending…" : "Send Report"}
            </button>
            <button
              type="button"
              className="btn zen-btn-outline"
              onClick={() => setOpen(false)}
              disabled={sending}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function RequesterTicketDetail({
  ticketId,
  onBack,
}: {
  ticketId: number;
  onBack: () => void;
}) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [isNotFound, setIsNotFound] = useState(false);
  const [commentRefreshToken, setCommentRefreshToken] = useState(0);

  /**
   * `silent` refreshes in place. A refresh after an upload or removal must not
   * blank the screen: doing so unmounts the attachment section and discards
   * any message it is showing about what just failed.
   */
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoadState("loading");
    setErrorMessage("");
    setIsNotFound(false);
    try {
      const detail = await fetchTicketDetail(ticketId);
      setTicket(detail);
      setLoadState("ready");
    } catch (err) {
      setTicket(null);
      if (err instanceof ApiError) {
        // BR-09 — another Requester's ticket and a nonexistent one answer
        // the identical 404, so this state reveals nothing about ownership.
        setIsNotFound(err.status === 404);
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Could not load the ticket. Please try again.");
      }
      setLoadState("error");
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="container py-4" style={{ maxWidth: 860 }}>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="zen-title h4 mb-0 me-auto">Ticket Detail</h1>
        <button type="button" className="btn zen-btn-outline" onClick={onBack}>
          Back to My Tickets
        </button>
      </div>

      {loadState === "loading" && (
        <div className="zen-card p-4" role="status" aria-live="polite">
          <span
            className="spinner-border spinner-border-sm me-2"
            aria-hidden="true"
          />
          Loading ticket…
        </div>
      )}

      {loadState === "error" && (
        <div className="zen-card p-4">
          <div className="alert zen-error-banner" role="alert">
            <strong>
              {isNotFound
                ? "This ticket is not available."
                : "Could not load the ticket."}
            </strong>
            <p className="mb-0 mt-1 small">
              {isNotFound
                ? "It does not exist or does not belong to your account."
                : errorMessage}
            </p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            {!isNotFound && (
              <button
                type="button"
                className="btn zen-btn-outline"
                onClick={() => void load()}
              >
                Retry
              </button>
            )}
            <button type="button" className="btn zen-btn-primary" onClick={onBack}>
              Back to My Tickets
            </button>
          </div>
        </div>
      )}

      {loadState === "ready" && ticket && (
        <>
          <ResolutionPanel
            ticketId={ticket.id}
            canReport={ticket.permissions.canReportProblemResolved}
            alreadyReported={ticket.problemAppearsResolvedAt}
            onReported={() => {
              // The report adds an automatic Public Comment server-side, so
              // the thread needs a refetch; the ticket's own fields do too.
              setCommentRefreshToken((t) => t + 1);
              void load({ silent: true });
            }}
          />

          <section className="zen-card p-4" aria-label="Ticket information">
            <p className="text-secondary small mb-3">
              Ticket information is read-only.
            </p>

            <div className="row g-3">
              <DetailField
                label="Ticket Number"
                value={ticket.ticketNumber}
                testId="detail-ticket-number"
              />
              <DetailField
                label="Ticket Date"
                value={new Date(ticket.ticketDate).toLocaleString()}
              />
              <DetailField label="Requester" value={ticket.requester.name} />
              <DetailField label="Category" value={ticket.category.name} />
              <DetailField
                label="Related System"
                value={ticket.relatedSystem.name}
              />
              <DetailField
                label="Requested Priority"
                value={priorityLabel(ticket.requestedPriority)}
              />
              <DetailField
                label="Current Status"
                value={statusLabel(ticket.currentStatus)}
                testId="detail-status"
              />
              <DetailField
                label="Assigned To"
                value={ticket.ticketOwner ? ticket.ticketOwner.name : "Unassigned"}
              />
              <DetailField
                label="Last Updated"
                value={new Date(ticket.updatedAt).toLocaleString()}
              />

              <div className="col-12">
                <p className="form-label fw-semibold mb-1">Ticket Summary</p>
                <p className="zen-readonly-value mb-0">{ticket.summary}</p>
              </div>

              <div className="col-12">
                <p className="form-label fw-semibold mb-1">Description</p>
                <p
                  className="zen-readonly-value zen-readonly-block mb-0"
                  data-testid="detail-description"
                >
                  {ticket.description}
                </p>
              </div>
            </div>
          </section>

          <AttachmentSection
            ticketId={ticket.id}
            attachments={ticket.attachments}
            onChanged={() => load({ silent: true })}
          />

          <PublicComments
            ticketId={ticket.id}
            canAddComment={ticket.permissions.canAddPublicComment}
            refreshToken={commentRefreshToken}
            onPosted={() => {
              // The composer already appended the new entry locally; only
              // the Ticket's own fields (e.g. Last Updated) need a refresh.
              void load({ silent: true });
            }}
          />
        </>
      )}
    </main>
  );
}
