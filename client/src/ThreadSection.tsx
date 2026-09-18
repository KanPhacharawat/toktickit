import { useCallback, useEffect, useState } from "react";
import { ApiError, type ThreadEntry } from "./api.js";

const BODY_MAX = 2000;

interface ThreadCopy {
  heading: string;
  bannerClass: string;
  bannerText: string;
  emptyText: string;
  composerLabel: string;
  submitLabel: string;
  submitBusyLabel: string;
  fieldLabel: "Comment" | "Note";
  ariaLabel: string;
  sectionClassName: string;
}

const COPY: Record<"public" | "internal", ThreadCopy> = {
  public: {
    heading: "Public Comments",
    bannerClass: "zen-testing-banner",
    bannerText: "Public — visible to the requester",
    emptyText: "No public comments yet.",
    composerLabel: "Add a public comment",
    submitLabel: "Post Public Comment",
    submitBusyLabel: "Posting…",
    fieldLabel: "Comment",
    ariaLabel: "Public Comments",
    sectionClassName: "",
  },
  internal: {
    heading: "Internal Notes",
    bannerClass: "zen-warning-banner",
    bannerText: "Internal — never visible to the requester",
    emptyText: "No internal notes yet.",
    composerLabel: "Add an internal note",
    submitLabel: "Post Internal Note",
    submitBusyLabel: "Posting…",
    fieldLabel: "Note",
    ariaLabel: "Internal Notes",
    sectionClassName: "zen-internal-notes",
  },
};

/**
 * A Public Comments or Internal Notes thread (ui-spec.md §10). Both are
 * append-only, oldest first, with an author name + role badge + timestamp,
 * and never render their body as HTML (BR-45).
 */
export default function ThreadSection({
  kind,
  ticketId,
  currentUserId,
  canPost,
  closedMessage,
  refreshToken,
  onPosted,
  fetchEntries,
  postEntry,
}: {
  kind: "public" | "internal";
  ticketId: number;
  currentUserId: number;
  canPost: boolean;
  /** Shown instead of the composer when `canPost` is false. */
  closedMessage?: string;
  refreshToken: number;
  onPosted: () => void;
  fetchEntries: (ticketId: number) => Promise<ThreadEntry[]>;
  postEntry: (ticketId: number, body: string) => Promise<ThreadEntry>;
}) {
  const copy = COPY[kind];

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
      const data = await fetchEntries(ticketId);
      setEntries(data);
      setLoadState("ready");
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError
          ? err.message
          : `Could not load ${copy.fieldLabel.toLowerCase()}s. Please try again.`,
      );
      setLoadState("error");
    }
  }, [ticketId, fetchEntries, copy.fieldLabel]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (posting) return;

    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      setDraftError(`${copy.fieldLabel} is required.`);
      return;
    }
    if (trimmed.length > BODY_MAX) {
      setDraftError(`${copy.fieldLabel} must be ${BODY_MAX} characters or fewer.`);
      return;
    }

    setDraftError("");
    setPostError("");
    setPosting(true);
    try {
      const entry = await postEntry(ticketId, draft);
      setEntries((current) => [...current, entry]);
      setDraft("");
      onPosted();
    } catch (err) {
      setPostError(
        err instanceof ApiError
          ? err.message
          : `Could not post the ${copy.fieldLabel.toLowerCase()}. Please try again.`,
      );
    } finally {
      setPosting(false);
    }
  }

  const fieldId = `${kind}-thread-draft`;
  const counterId = `${kind}-thread-counter`;
  const errorId = `${kind}-thread-error`;

  return (
    <section className={`zen-card p-4 mt-3 ${copy.sectionClassName}`.trim()} aria-label={copy.ariaLabel}>
      <div className={`${copy.bannerClass} mb-2`}>{copy.bannerText}</div>
      <h2 className="zen-title h5 mb-3">{`${copy.heading} (${entries.length})`}</h2>

      {loadState === "loading" && (
        <p className="text-secondary" role="status">
          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
          {`Loading ${copy.fieldLabel.toLowerCase()}s…`}
        </p>
      )}

      {loadState === "error" && (
        <div className="alert zen-error-banner" role="alert">
          <strong>{`Could not load ${copy.fieldLabel.toLowerCase()}s.`}</strong>
          <p className="mb-2 mt-1 small">{errorMessage}</p>
          <button type="button" className="btn btn-sm zen-btn-outline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {loadState === "ready" && entries.length === 0 && (
        <p className="text-secondary mb-0">{copy.emptyText}</p>
      )}

      {loadState === "ready" && entries.length > 0 && (
        <ol className="list-unstyled mb-0" data-testid={`${kind}-thread-list`}>
          {entries.map((entry) => (
            <li key={entry.id} className="mb-3 pb-3 border-bottom">
              <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                <span className="fw-semibold">
                  {entry.author.name}
                  {entry.author.id === currentUserId && " (you)"}
                </span>
                <span className="zen-badge zen-status">{entry.author.role}</span>
                {kind === "internal" && <span className="zen-badge zen-warning-badge">Internal</span>}
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

      {canPost ? (
        <form className="mt-4" onSubmit={handleSubmit}>
          <label className="form-label fw-semibold" htmlFor={fieldId}>
            {copy.composerLabel}
            <span className="zen-required" aria-hidden="true">
              {" *"}
            </span>
            <span className="visually-hidden"> (required)</span>
          </label>
          <textarea
            id={fieldId}
            className={`form-control zen-input zen-textarea${draftError ? " zen-invalid" : ""}`}
            rows={3}
            maxLength={BODY_MAX}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDraftError("");
            }}
            disabled={posting}
            aria-invalid={draftError ? true : undefined}
            aria-describedby={`${counterId} ${errorId}`}
          />
          <p id={counterId} className="text-secondary small mt-1 mb-0">
            {`${draft.length} / ${BODY_MAX}`}
          </p>
          {draftError && (
            <p id={errorId} className="zen-error-text small mt-1 mb-0">
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
            {posting ? copy.submitBusyLabel : copy.submitLabel}
          </button>
        </form>
      ) : (
        closedMessage && <p className="text-secondary small mt-3 mb-0">{closedMessage}</p>
      )}
    </section>
  );
}
