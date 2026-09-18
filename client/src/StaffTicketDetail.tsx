import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  claimTicket,
  fetchAssignableUsers,
  fetchInternalNotes,
  fetchPublicComments,
  fetchStaffTicketDetail,
  postInternalNote,
  postPublicComment,
  setItPriority,
  setTicketOwner,
  setTicketStatus,
  type AssignableUser,
  type StaffTicketDetail as StaffTicketDetailData,
} from "./api.js";
import { useAuth } from "./AuthContext.js";
import ThreadSection from "./ThreadSection.js";
import { priorityLabel } from "./ticketFormRules.js";

/** Turns InProgress into "In Progress" for display. */
function statusLabel(status: string): string {
  return status.replace(/([a-z])([A-Z])/g, "$1 $2");
}

const CONFIRM_REQUIRED = new Set(["Resolved", "Closed", "Reopened", "Cancelled"]);

const CONFIRM_COPY: Record<string, { text: (n: string) => string; confirmLabel: string }> = {
  Resolved: {
    text: (n) => `Mark ticket ${n} as Resolved? The requester will see this status.`,
    confirmLabel: "Mark Resolved",
  },
  Closed: {
    text: (n) => `Close ticket ${n}? Closed tickets cannot be changed again.`,
    confirmLabel: "Close Ticket",
  },
  Reopened: {
    text: (n) => `Reopen ticket ${n}? The resolution will be treated as not holding.`,
    confirmLabel: "Reopen Ticket",
  },
  Cancelled: {
    text: (n) => `Cancel ticket ${n}? Cancelled tickets cannot be changed again.`,
    confirmLabel: "Cancel Ticket",
  },
};

/** api-spec.md §2.2 — conflicts and rule violations that resolve with a silent reload. */
const RELOAD_CODES = new Set([
  "TICKET_ALREADY_CLAIMED",
  "INVALID_STATUS_TRANSITION",
  "OWNER_REQUIRED",
  "TICKET_CLOSED",
]);

function DetailField({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div className="col-12 col-md-6">
      <p className="form-label fw-semibold mb-1">{label}</p>
      <p className="zen-readonly-value mb-0" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

export default function StaffTicketDetail({
  ticketId,
  onBack,
}: {
  ticketId: number;
  onBack: () => void;
}) {
  const { user } = useAuth();

  const [ticket, setTicket] = useState<StaffTicketDetailData | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [isNotFound, setIsNotFound] = useState(false);
  const [staleBanner, setStaleBanner] = useState(false);

  const [assignable, setAssignable] = useState<AssignableUser[]>([]);
  const [commentRefreshToken, setCommentRefreshToken] = useState(0);
  const [noteRefreshToken, setNoteRefreshToken] = useState(0);

  const load = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage("");
    setIsNotFound(false);
    setStaleBanner(false);
    try {
      const detail = await fetchStaffTicketDetail(ticketId);
      setTicket(detail);
      setLoadState("ready");
    } catch (err) {
      setTicket(null);
      if (err instanceof ApiError) {
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

  useEffect(() => {
    fetchAssignableUsers()
      .then(setAssignable)
      .catch(() => setAssignable([]));
  }, []);

  /** Runs one operation, applying the shared conflict/error handling rules. */
  const runOperation = useCallback(
    async (action: () => Promise<StaffTicketDetailData>, onError: (message: string) => void) => {
      try {
        const updated = await action();
        setTicket(updated);
        setStaleBanner(false);
        return true;
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.code === "STALE_TICKET") {
            setStaleBanner(true);
            return false;
          }
          if (err.code === "FORBIDDEN") {
            onError("You no longer have permission to do this.");
            void load();
            return false;
          }
          if (RELOAD_CODES.has(err.code)) {
            onError(err.message);
            void load();
            return false;
          }
          onError(err.message);
          return false;
        }
        onError("Could not complete this action. Please try again.");
        return false;
      }
    },
    [load],
  );

  if (!user) return null;

  return (
    <main className="container py-4" style={{ maxWidth: 1140 }}>
      <nav aria-label="Breadcrumb" className="small text-secondary mb-1">
        Ticket Queue &rsaquo; Ticket Detail
      </nav>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="zen-title h4 mb-0 me-auto">
          {ticket ? `Ticket ${ticket.ticketNumber}` : "Ticket Detail"}
        </h1>
        <button type="button" className="btn zen-btn-outline" onClick={onBack}>
          Back to Queue
        </button>
      </div>

      {ticket && (
        <div className="d-flex flex-wrap gap-2 mb-3">
          <span className="zen-badge zen-status">{statusLabel(ticket.currentStatus)}</span>
          <span className={`zen-badge zen-priority-${ticket.requestedPriority.toLowerCase()}`}>
            {priorityLabel(ticket.requestedPriority)}
          </span>
          <span className={`zen-badge zen-priority-${ticket.itPriority.toLowerCase()}`}>
            {`IT: ${priorityLabel(ticket.itPriority)}`}
          </span>
          <span className="zen-badge zen-status">
            {ticket.ticketOwner
              ? ticket.ticketOwner.id === user.id
                ? "You"
                : ticket.ticketOwner.name
              : "Unassigned"}
          </span>
          {ticket.problemAppearsResolvedAt && (
            <span className="zen-badge zen-status">Problem appears resolved</span>
          )}
        </div>
      )}

      {loadState === "loading" && (
        <div className="zen-card p-4" role="status" aria-live="polite">
          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
          Loading ticket…
        </div>
      )}

      {loadState === "error" && (
        <div className="zen-card p-4">
          <div className="alert zen-error-banner" role="alert">
            <strong>{isNotFound ? "This ticket does not exist." : "Could not load the ticket."}</strong>
            <p className="mb-0 mt-1 small">{!isNotFound && errorMessage}</p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            {!isNotFound && (
              <button type="button" className="btn zen-btn-outline" onClick={() => void load()}>
                Retry
              </button>
            )}
            <button type="button" className="btn zen-btn-primary" onClick={onBack}>
              Back to Queue
            </button>
          </div>
        </div>
      )}

      {loadState === "ready" && ticket && (
        <div className="row g-3">
          <div className="col-12 col-lg-8 order-2 order-lg-1">
            <section className="zen-card p-4" aria-label="Ticket information">
              <p className="text-secondary small mb-3">Ticket information is read-only.</p>
              {ticket.problemAppearsResolvedAt && (
                <div className="zen-success-banner mb-3">
                  {`Requester reported the problem appears resolved on ${new Date(
                    ticket.problemAppearsResolvedAt,
                  ).toLocaleString()}.`}
                </div>
              )}

              <div className="row g-3">
                <DetailField label="Ticket Number" value={ticket.ticketNumber} testId="detail-ticket-number" />
                <DetailField label="Ticket Date" value={new Date(ticket.ticketDate).toLocaleString()} />
                <DetailField
                  label="Requester"
                  value={`${ticket.requester.name} (${ticket.requester.email ?? ""})`}
                />
                <DetailField label="Category" value={ticket.category.name} />
                <DetailField label="Related System" value={ticket.relatedSystem.name} />
                <DetailField label="Requested Priority" value={priorityLabel(ticket.requestedPriority)} />
                <DetailField
                  label="Current Status"
                  value={statusLabel(ticket.currentStatus)}
                  testId="detail-status"
                />
                <DetailField label="Last Updated" value={new Date(ticket.updatedAt).toLocaleString()} />
                <div className="col-12">
                  <p className="form-label fw-semibold mb-1">Summary</p>
                  <p className="zen-readonly-value mb-0">{ticket.summary}</p>
                </div>
                <div className="col-12">
                  <p className="form-label fw-semibold mb-1">Description</p>
                  <p className="zen-readonly-value zen-readonly-block mb-0" data-testid="detail-description">
                    {ticket.description}
                  </p>
                </div>
              </div>
            </section>

            <section className="zen-card p-4 mt-3" aria-label="Attachments">
              <h2 className="zen-title h5 mb-3">Attachments</h2>
              {ticket.attachments.length === 0 ? (
                <p className="text-secondary mb-0" data-testid="no-attachments">
                  No attachments yet.
                </p>
              ) : (
                <ul className="list-group" data-testid="attachment-list">
                  {ticket.attachments.map((attachment) => {
                    const isRemoved = attachment.removedAt !== null;
                    return (
                      <li
                        key={attachment.id}
                        className={`list-group-item${isRemoved ? " zen-attachment-removed" : ""}`}
                        data-testid={isRemoved ? "removed-attachment" : "active-attachment"}
                      >
                        <div className="d-flex flex-wrap align-items-center gap-2">
                          <span className="fw-semibold text-break me-auto">
                            {attachment.originalFilename}
                          </span>
                          {isRemoved ? (
                            <span className="zen-badge zen-removed-badge">Removed</span>
                          ) : (
                            <a
                              className="btn btn-sm zen-btn-outline"
                              href={`${(import.meta.env.VITE_API_URL as string) ?? "http://localhost:3000"}/api/tickets/${ticket.id}/attachments/${attachment.id}`}
                              download={attachment.originalFilename}
                            >
                              Download
                              <span className="visually-hidden">{` ${attachment.originalFilename}`}</span>
                            </a>
                          )}
                        </div>
                        {isRemoved && attachment.removalReason && (
                          <p className="text-secondary small mb-0 mt-1">{`Reason: ${attachment.removalReason}`}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <ThreadSection
              kind="public"
              ticketId={ticket.id}
              currentUserId={user.id}
              canPost={ticket.permissions.canAddPublicComment}
              closedMessage="This ticket is closed. New public comments are not accepted."
              refreshToken={commentRefreshToken}
              onPosted={() => setCommentRefreshToken((t) => t + 1)}
              fetchEntries={fetchPublicComments}
              postEntry={postPublicComment}
            />
          </div>

          <div className="col-12 col-lg-4 order-1 order-lg-2">
            <OperationsCard
              ticket={ticket}
              currentUserId={user.id}
              assignable={assignable}
              staleBanner={staleBanner}
              onReload={() => void load()}
              runOperation={runOperation}
            />

            <ThreadSection
              kind="internal"
              ticketId={ticket.id}
              currentUserId={user.id}
              canPost={ticket.permissions.canAddInternalNote}
              refreshToken={noteRefreshToken}
              onPosted={() => setNoteRefreshToken((t) => t + 1)}
              fetchEntries={fetchInternalNotes}
              postEntry={postInternalNote}
            />
          </div>
        </div>
      )}
    </main>
  );
}

function OperationsCard({
  ticket,
  currentUserId,
  assignable,
  staleBanner,
  onReload,
  runOperation,
}: {
  ticket: StaffTicketDetailData;
  currentUserId: number;
  assignable: AssignableUser[];
  staleBanner: boolean;
  onReload: () => void;
  runOperation: (
    action: () => Promise<StaffTicketDetailData>,
    onError: (message: string) => void,
  ) => Promise<boolean>;
}) {
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");

  const [assignTarget, setAssignTarget] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState("");

  const [priorityDraft, setPriorityDraft] = useState(ticket.itPriority);
  const [savingPriority, setSavingPriority] = useState(false);
  const [priorityError, setPriorityError] = useState("");
  const [prioritySuccess, setPrioritySuccess] = useState("");

  const [statusDraft, setStatusDraft] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);

  const isOwner = ticket.ticketOwner?.id === currentUserId;
  const expectedUpdatedAt = ticket.updatedAt;

  async function handleClaim() {
    if (claiming) return;
    setClaiming(true);
    setClaimError("");
    await runOperation(() => claimTicket(ticket.id, expectedUpdatedAt), setClaimError);
    setClaiming(false);
  }

  async function handleAssign(event: React.FormEvent) {
    event.preventDefault();
    if (assigning || !assignTarget) return;
    setAssigning(true);
    setAssignError("");
    const ok = await runOperation(
      () => setTicketOwner(ticket.id, Number(assignTarget), expectedUpdatedAt),
      setAssignError,
    );
    if (ok) setAssignTarget("");
    setAssigning(false);
  }

  async function saveItPriority() {
    if (savingPriority || priorityDraft === ticket.itPriority) return;
    setSavingPriority(true);
    setPriorityError("");
    setPrioritySuccess("");
    const ok = await runOperation(
      () => setItPriority(ticket.id, priorityDraft, expectedUpdatedAt),
      setPriorityError,
    );
    if (ok) setPrioritySuccess(`IT Priority updated to ${priorityDraft}.`);
    setSavingPriority(false);
  }

  function requestStatusChange(target: string) {
    if (CONFIRM_REQUIRED.has(target)) {
      setConfirmTarget(target);
    } else {
      void saveStatus(target);
    }
  }

  async function saveStatus(target: string) {
    if (savingStatus) return;
    setSavingStatus(true);
    setStatusError("");
    setConfirmTarget(null);
    await runOperation(() => setTicketStatus(ticket.id, target, expectedUpdatedAt), setStatusError);
    setStatusDraft("");
    setSavingStatus(false);
  }

  return (
    <section className="zen-card p-4" aria-label="Ticket operations">
      {staleBanner && (
        <div className="alert zen-warning-banner" role="alert">
          <strong>This ticket changed since you opened it.</strong>
          <div className="mt-2">
            <button type="button" className="btn btn-sm zen-btn-outline" onClick={onReload}>
              Reload ticket
            </button>
          </div>
        </div>
      )}

      <h2 className="zen-title h5 mb-3">Operations</h2>

      {/* Ownership */}
      <div className="mb-4">
        <p className="form-label fw-semibold mb-1">Owner</p>
        <p className="zen-readonly-value mb-2">
          {ticket.ticketOwner ? ticket.ticketOwner.name : "Unassigned"}
        </p>

        {!ticket.ticketOwner && ticket.permissions.canClaim && (
          <button
            type="button"
            className="btn zen-btn-primary mb-2"
            onClick={handleClaim}
            disabled={claiming}
            aria-busy={claiming}
          >
            {claiming ? "Claiming…" : "Claim Ticket"}
          </button>
        )}
        {claimError && <p className="zen-error-text small mb-2">{claimError}</p>}

        {!ticket.ticketOwner && ticket.permissions.canAssign && (
          <form className="d-flex flex-wrap gap-2" onSubmit={handleAssign}>
            <select
              className="form-select zen-select"
              style={{ maxWidth: 260 }}
              aria-label="Assign to"
              value={assignTarget}
              onChange={(e) => setAssignTarget(e.target.value)}
            >
              <option value="">Assign to…</option>
              {assignable.map((u) => (
                <option key={u.id} value={u.id}>
                  {`${u.name} (${u.role === "ITStaff" ? "IT Staff" : "Administrator"})`}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="btn zen-btn-outline"
              disabled={!assignTarget || assigning}
              aria-busy={assigning}
            >
              {assigning ? "Assigning…" : "Assign"}
            </button>
          </form>
        )}

        {ticket.ticketOwner && ticket.permissions.canReassign && (
          <form className="d-flex flex-wrap gap-2" onSubmit={handleAssign}>
            <select
              className="form-select zen-select"
              style={{ maxWidth: 260 }}
              aria-label="Reassign to"
              value={assignTarget}
              onChange={(e) => setAssignTarget(e.target.value)}
            >
              <option value="">Reassign to…</option>
              {assignable
                .filter((u) => u.id !== ticket.ticketOwner!.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {`${u.name} (${u.role === "ITStaff" ? "IT Staff" : "Administrator"})`}
                  </option>
                ))}
            </select>
            <button
              type="submit"
              className="btn zen-btn-outline"
              disabled={!assignTarget || assigning}
              aria-busy={assigning}
            >
              {assigning ? "Reassigning…" : "Reassign"}
            </button>
          </form>
        )}
        {assignError && <p className="zen-error-text small mt-2 mb-0">{assignError}</p>}

        {ticket.ticketOwner && !isOwner && !ticket.permissions.canReassign && (
          <p className="text-secondary small mb-0">
            Only the ticket owner or an administrator can reassign this ticket.
          </p>
        )}
      </div>

      {/* IT Priority */}
      <div className="mb-4">
        <p className="form-label fw-semibold mb-1">IT Priority</p>
        {ticket.permissions.canChangeItPriority ? (
          <>
            <div className="d-flex flex-wrap gap-2">
              <select
                className="form-select zen-select"
                style={{ maxWidth: 200 }}
                aria-label="IT Priority"
                value={priorityDraft}
                onChange={(e) => {
                  setPriorityDraft(e.target.value as typeof priorityDraft);
                  setPrioritySuccess("");
                }}
              >
                {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
                  <option key={p} value={p}>
                    {priorityLabel(p as never)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn zen-btn-outline"
                onClick={saveItPriority}
                disabled={savingPriority || priorityDraft === ticket.itPriority}
                aria-busy={savingPriority}
              >
                {savingPriority ? "Saving…" : "Save IT Priority"}
              </button>
            </div>
            <p className="text-secondary small mt-1 mb-0">
              {`Requested by requester: ${priorityLabel(ticket.requestedPriority)}. IT Priority started as a copy.`}
            </p>
            {priorityError && <p className="zen-error-text small mt-1 mb-0">{priorityError}</p>}
            {prioritySuccess && (
              <p className="small mt-1 mb-0" role="status">
                {prioritySuccess}
              </p>
            )}
          </>
        ) : (
          <>
            <span className={`zen-badge zen-priority-${ticket.itPriority.toLowerCase()}`}>
              {priorityLabel(ticket.itPriority)}
            </span>
            <p className="text-secondary small mt-1 mb-0">
              {!ticket.ticketOwner
                ? "Claim this ticket to change IT Priority."
                : "Only the ticket owner or an administrator can change IT Priority."}
            </p>
          </>
        )}
      </div>

      {/* Status */}
      <div>
        <p className="form-label fw-semibold mb-1">Status</p>
        {ticket.currentStatus === "Closed" || ticket.currentStatus === "Cancelled" ? (
          <p className="text-secondary small mb-0">
            {`This ticket is ${statusLabel(ticket.currentStatus)}. No further changes are possible.`}
          </p>
        ) : ticket.permissions.canChangeStatus ? (
          <>
            <div className="d-flex flex-wrap gap-2">
              <select
                className="form-select zen-select"
                style={{ maxWidth: 220 }}
                aria-label="Change status to"
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value)}
                disabled={ticket.allowedStatusTransitions.length === 0}
              >
                <option value="">Change status to…</option>
                {ticket.allowedStatusTransitions.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn zen-btn-outline"
                disabled={!statusDraft || savingStatus}
                aria-busy={savingStatus}
                onClick={() => requestStatusChange(statusDraft)}
              >
                {savingStatus ? "Updating…" : "Update Status"}
              </button>
            </div>
            {!ticket.ticketOwner && (
              <p className="text-secondary small mt-1 mb-0">
                Assign an owner before moving this ticket forward.
              </p>
            )}
            {statusError && <p className="zen-error-text small mt-1 mb-0">{statusError}</p>}
          </>
        ) : (
          <p className="text-secondary small mb-0">
            Read-only status: {statusLabel(ticket.currentStatus)}. Only the ticket owner or an
            administrator can change status.
          </p>
        )}
      </div>

      {confirmTarget && (
        <div role="dialog" aria-modal="true" aria-label={`Confirm ${confirmTarget}`} className="zen-card p-3 mt-3">
          <p className="mb-3">{CONFIRM_COPY[confirmTarget].text(ticket.ticketNumber)}</p>
          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className="btn zen-btn-primary"
              onClick={() => void saveStatus(confirmTarget)}
            >
              {CONFIRM_COPY[confirmTarget].confirmLabel}
            </button>
            <button type="button" className="btn zen-btn-outline" onClick={() => setConfirmTarget(null)}>
              Keep Current Status
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
