import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  ResolutionGateError,
  StaleStatusError,
  fetchStatusHistory,
  fetchTransitions,
  postRequesterResolution,
  postTicketStatus,
  type StatusHistoryEntry,
  type TicketStatus,
  type TicketWorkflowSummary,
  type TransitionsResponse,
  type WorkflowGate,
  type WorkflowGateCheck,
} from "./api.js";
import { formatDateTime, statusLabel } from "./actionsTakenRules.js";

const REASON_MAX = 2000;

/** ui-spec.md §6.1 — the resolution gate checklist labels. */
const GATE_LABELS: Record<WorkflowGateCheck["id"], string> = {
  HAS_OWNER: "Has owner",
  HAS_COMPLETED_ACTION: "≥ 1 completed action",
  NO_PLANNED_ACTIONS: "No planned actions",
  FOLLOW_UPS_ACKNOWLEDGED: "Follow-ups acknowledged",
};

/** Targets that require a non-empty reason (api-spec.md §3.2). */
function reasonRequiredFor(to: TicketStatus): boolean {
  return to === "Resolved" || to === "Cancelled" || to === "Reopened";
}

interface SubmitOutcome {
  ok: boolean;
  gateDetails?: Array<{ check: string; message: string }>;
  message?: string;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="zen-error-text small mt-1 mb-0">
      {message}
    </p>
  ) : null;
}

// ---------------------------------------------------------------------------
// Resolve dialog (ui-spec.md §6.1) — resolution summary + gate checklist.
// ---------------------------------------------------------------------------

function ResolveDialog({
  ticketNumber,
  gate,
  onClose,
  onConfirm,
}: {
  ticketNumber: string;
  gate: WorkflowGate | undefined;
  onClose: () => void;
  onConfirm: (reason: string, followUpAcknowledged: boolean) => Promise<SubmitOutcome>;
}) {
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [gateDetails, setGateDetails] = useState<Array<{ check: string; message: string }> | null>(null);

  const followUpCheck = gate?.checks.find((c) => c.id === "FOLLOW_UPS_ACKNOWLEDGED");
  const needsAcknowledgement = followUpCheck?.requiresAcknowledgement === true;
  const otherChecksPass = gate
    ? gate.checks.filter((c) => c.id !== "FOLLOW_UPS_ACKNOWLEDGED").every((c) => c.passed)
    : false;
  // ui-spec.md §6.1 — Confirm disabled until client checks pass; server remains authority.
  const clientReady = otherChecksPass && (!needsAcknowledgement || acknowledged) && reason.trim().length > 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || !clientReady) return;
    setSubmitting(true);
    setError("");
    setGateDetails(null);
    const outcome = await onConfirm(reason.trim(), acknowledged);
    if (!outcome.ok) {
      if (outcome.gateDetails) setGateDetails(outcome.gateDetails);
      else setError(outcome.message ?? "Could not resolve the ticket. Please try again.");
    }
    setSubmitting(false);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Resolve ticket" className="zen-card p-3 mt-3">
      <h2 className="zen-title h6">{`Resolve ticket ${ticketNumber}`}</h2>

      <ul className="list-unstyled mb-3" data-testid="resolution-gate-checklist">
        {(gate?.checks ?? []).map((check) => (
          <li key={check.id} className="mb-1">
            <span aria-hidden="true">{check.passed ? "✓" : "✗"}</span>
            {" "}
            <span>{GATE_LABELS[check.id]}</span>
            {!check.passed && (
              <span className="visually-hidden"> (not yet met)</span>
            )}
            {check.id === "FOLLOW_UPS_ACKNOWLEDGED" && needsAcknowledgement && (
              <label className="d-block ms-3 mt-1">
                <input
                  type="checkbox"
                  className="form-check-input me-1"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  disabled={submitting}
                />
                I acknowledge the outstanding follow-up(s).
              </label>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit}>
        <label className="form-label fw-semibold" htmlFor="resolve-summary">
          {"Resolution summary"}
          <span className="zen-required" aria-hidden="true">
            {" *"}
          </span>
          <span className="visually-hidden"> (required)</span>
        </label>
        <textarea
          id="resolve-summary"
          className="form-control zen-input zen-textarea"
          rows={3}
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={submitting}
          aria-describedby="resolve-summary-error"
        />
        <FieldError id="resolve-summary-error" message={error} />

        {gateDetails && gateDetails.length > 0 && (
          <div className="alert zen-error-banner mt-2 mb-0" role="alert">
            <strong>Ticket cannot be resolved yet.</strong>
            <ul className="mb-0 mt-1">
              {gateDetails.map((d) => (
                <li key={d.check}>
                  {d.message} <a href="#actions-taken-section">Go to Actions Taken</a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="d-flex flex-wrap gap-2 mt-3">
          <button
            type="submit"
            className="btn zen-btn-primary"
            disabled={submitting || !clientReady}
            aria-busy={submitting}
          >
            {submitting ? "Resolving…" : "Confirm Resolve"}
          </button>
          <button type="button" className="btn zen-btn-outline" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reason dialog (Cancel, Reopen, and any optional-note target).
// ---------------------------------------------------------------------------

function ReasonDialog({
  title,
  ariaLabel,
  reasonLabel,
  required,
  confirmLabel,
  busyLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  ariaLabel: string;
  reasonLabel: string;
  required: boolean;
  confirmLabel: string;
  busyLabel: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<SubmitOutcome>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const trimmed = reason.trim();
    if (required && trimmed.length === 0) {
      setError("A reason is required for this change.");
      return;
    }
    setError("");
    setSubmitting(true);
    const outcome = await onConfirm(trimmed);
    if (!outcome.ok) setError(outcome.message ?? "Could not update the status. Please try again.");
    setSubmitting(false);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={ariaLabel} className="zen-card p-3 mt-3">
      <h2 className="zen-title h6">{title}</h2>
      <form onSubmit={handleSubmit}>
        <label className="form-label fw-semibold" htmlFor="workflow-reason">
          {reasonLabel}
          {required && (
            <>
              <span className="zen-required" aria-hidden="true">
                {" *"}
              </span>
              <span className="visually-hidden"> (required)</span>
            </>
          )}
        </label>
        <textarea
          id="workflow-reason"
          className={`form-control zen-input zen-textarea${error ? " zen-invalid" : ""}`}
          rows={3}
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError("");
          }}
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby="workflow-reason-error"
        />
        <FieldError id="workflow-reason-error" message={error} />
        <div className="d-flex flex-wrap gap-2 mt-3">
          <button type="submit" className="btn zen-btn-primary" disabled={submitting} aria-busy={submitting}>
            {submitting ? busyLabel : confirmLabel}
          </button>
          <button type="button" className="btn zen-btn-outline" onClick={onClose} disabled={submitting}>
            Keep Current Status
          </button>
        </div>
      </form>
    </div>
  );
}

/** ui-spec.md §6.1 — "409: Ticket was updated by someone else. [Reload]" */
function StaleTicketDialog({ onReload }: { onReload: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Ticket changed" className="zen-card p-3 mt-3">
      <p className="mb-3">Ticket was updated by someone else.</p>
      <button type="button" className="btn zen-btn-primary" onClick={onReload}>
        Reload
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History tab (ui-spec.md §6.3)
// ---------------------------------------------------------------------------

function HistoryTimeline({
  loadState,
  items,
  onRetry,
}: {
  loadState: "idle" | "loading" | "ready" | "error";
  items: StatusHistoryEntry[];
  onRetry: () => void;
}) {
  if (loadState === "loading" || loadState === "idle") {
    return (
      <p className="text-secondary" role="status">
        <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
        Loading history…
      </p>
    );
  }
  if (loadState === "error") {
    return (
      <div className="alert zen-error-banner" role="alert">
        <strong>Could not load status history.</strong>
        <div className="mt-2">
          <button type="button" className="btn btn-sm zen-btn-outline" onClick={onRetry}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (items.length === 0) {
    return <p className="text-secondary mb-0">No status changes recorded yet.</p>;
  }
  return (
    <ol className="list-unstyled mb-0" data-testid="status-history-list">
      {items.map((h) => (
        <li key={h.id} className="mb-2">
          <p className="mb-0">
            {`${formatDateTime(h.createdAt)} · ${h.actor.name} changed status ${
              h.fromStatus ? statusLabel(h.fromStatus) : "—"
            } → ${statusLabel(h.toStatus)}`}
          </p>
          {h.reason && <p className="text-secondary small mb-0">{h.reason}</p>}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Dialog =
  | { kind: "resolve" }
  | { kind: "reason"; to: TicketStatus; title: string; ariaLabel: string; required: boolean; confirmLabel: string }
  | { kind: "stale" }
  | null;

export default function TicketWorkflow({
  ticketId,
  ticketNumber,
  role,
  currentStatus,
  version,
  ticketOwnerName,
  ticketUpdatedAt,
  itPriorityLabel,
  requesterResolvedIndicatedAt,
  onChanged,
}: {
  ticketId: number;
  ticketNumber: string;
  role: "Requester" | "ITStaff" | "Administrator";
  currentStatus: string;
  version: number;
  ticketOwnerName: string | null;
  /** Bumped by any ticket-related mutation (status, ownership, Actions
   * Taken); used to refetch the transitions/resolution-gate data those
   * mutations can change, since they happen in sibling components. */
  ticketUpdatedAt: string;
  /** Staff only — Requesters never see IT Priority (Lab 3 BR-26). */
  itPriorityLabel?: string;
  requesterResolvedIndicatedAt: string | null;
  onChanged: (summary: TicketWorkflowSummary) => void;
}) {
  const [tab, setTab] = useState<"status" | "history">("status");

  const [transitions, setTransitions] = useState<TransitionsResponse | null>(null);
  const [transitionsState, setTransitionsState] = useState<"loading" | "ready" | "error">("loading");

  const [historyItems, setHistoryItems] = useState<StatusHistoryEntry[]>([]);
  const [historyState, setHistoryState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const [dialog, setDialog] = useState<Dialog>(null);
  const [banner, setBanner] = useState("");

  const [indicatedAt, setIndicatedAt] = useState(requesterResolvedIndicatedAt);
  const [indicating, setIndicating] = useState(false);
  const [indicateError, setIndicateError] = useState("");

  useEffect(() => setIndicatedAt(requesterResolvedIndicatedAt), [requesterResolvedIndicatedAt]);

  const loadTransitions = useCallback(async () => {
    setTransitionsState("loading");
    try {
      const data = await fetchTransitions(ticketId);
      setTransitions(data);
      setTransitionsState("ready");
    } catch {
      setTransitionsState("error");
    }
  }, [ticketId]);

  // Claim/Assign/Reassign and Actions Taken all happen in sibling components
  // and only reach this panel through the parent's re-fetched `ticket`
  // object — with no other signal, the previously-fetched transitions (and
  // the resolution gate embedded in them) kept reflecting the ticket's prior
  // ownership/action state, e.g. still showing "No planned actions" unmet
  // right after the last Planned action was completed, until the whole page
  // was reloaded. `ticketUpdatedAt` changes on every such mutation.
  useEffect(() => {
    void loadTransitions();
  }, [loadTransitions, ticketOwnerName, ticketUpdatedAt]);

  const loadHistory = useCallback(async () => {
    setHistoryState("loading");
    try {
      const items = await fetchStatusHistory(ticketId);
      setHistoryItems(items);
      setHistoryState("ready");
    } catch {
      setHistoryState("error");
    }
  }, [ticketId]);

  function openHistoryTab() {
    setTab("history");
    if (historyState === "idle") void loadHistory();
  }

  async function submitStatus(
    to: TicketStatus,
    reason: string,
    followUpAcknowledged = false,
  ): Promise<SubmitOutcome> {
    try {
      const result = await postTicketStatus(ticketId, {
        version,
        toStatus: to,
        reason: reason || undefined,
        followUpAcknowledged,
      });
      onChanged(result.ticket);
      setBanner(`Status changed to ${statusLabel(to)}.`);
      setDialog(null);
      void loadTransitions();
      if (tab === "history") void loadHistory();
      else setHistoryState("idle");
      return { ok: true };
    } catch (err) {
      if (err instanceof StaleStatusError) {
        onChanged(err.current);
        setDialog({ kind: "stale" });
        return { ok: false };
      }
      if (err instanceof ResolutionGateError) {
        return { ok: false, gateDetails: err.details };
      }
      return {
        ok: false,
        message: err instanceof ApiError ? err.message : "Could not update the status. Please try again.",
      };
    }
  }

  async function handleIndicateResolved() {
    if (indicating) return;
    setIndicating(true);
    setIndicateError("");
    try {
      const result = await postRequesterResolution(ticketId);
      setIndicatedAt(result.requesterResolvedIndicatedAt);
      setBanner("Thanks — IT will review and resolve the ticket.");
    } catch (err) {
      setIndicateError(
        err instanceof ApiError ? err.message : "Could not send the report. Please try again.",
      );
    } finally {
      setIndicating(false);
    }
  }

  function openDialogFor(to: TicketStatus) {
    if (to === "Resolved") {
      setDialog({ kind: "resolve" });
      return;
    }
    if (to === "Cancelled") {
      setDialog({ kind: "reason", to, title: "Cancel ticket", ariaLabel: "Cancel ticket", required: true, confirmLabel: "Cancel Ticket" });
      return;
    }
    if (to === "Reopened") {
      setDialog({ kind: "reason", to, title: "Reopen ticket", ariaLabel: "Reopen ticket", required: true, confirmLabel: "Reopen Ticket" });
      return;
    }
    setDialog({
      kind: "reason",
      to,
      title: `Change status to ${statusLabel(to)}`,
      ariaLabel: `Change status to ${statusLabel(to)}`,
      required: reasonRequiredFor(to),
      confirmLabel: "Update Status",
    });
  }

  function reloadFromStale() {
    setDialog(null);
    void loadTransitions();
  }

  const availableTargets = transitions?.transitions ?? [];
  const resolvedTransition = availableTargets.find((t) => t.to === "Resolved");

  const canRequesterCancel = role === "Requester" && currentStatus === "New" && availableTargets.some((t) => t.to === "Cancelled");
  const canRequesterReopen = role === "Requester" && currentStatus === "Resolved" && availableTargets.some((t) => t.to === "Reopened");
  const requesterCanIndicate = transitions?.requesterCanIndicateResolved ?? false;

  return (
    <section className="zen-card p-4 mt-3" aria-label="Ticket workflow" data-testid="ticket-workflow">
      <div className="d-flex gap-2 mb-3" role="tablist" aria-label="Ticket workflow views">
        <button
          type="button"
          className={`btn btn-sm ${tab === "status" ? "zen-btn-primary" : "zen-btn-outline"}`}
          role="tab"
          aria-selected={tab === "status"}
          onClick={() => setTab("status")}
        >
          Status
        </button>
        <button
          type="button"
          className={`btn btn-sm ${tab === "history" ? "zen-btn-primary" : "zen-btn-outline"}`}
          role="tab"
          aria-selected={tab === "history"}
          onClick={openHistoryTab}
        >
          History
        </button>
      </div>

      {banner && (
        <div className="zen-success-banner mb-3" role="status">
          {banner}
        </div>
      )}

      {tab === "status" && (
        <>
          <p className="mb-2" data-testid="workflow-status-line">
            {`Status: ${statusLabel(currentStatus)}   Owner: ${ticketOwnerName ?? "Unassigned"}`}
            {itPriorityLabel ? `   Priority: ${itPriorityLabel}` : ""}
          </p>

          {role !== "Requester" && indicatedAt && (
            <p className="text-secondary small mb-3">
              <span aria-hidden="true">ⓘ </span>
              {`Requester indicated the problem appears resolved · ${formatDateTime(indicatedAt)}`}
            </p>
          )}

          {transitionsState === "loading" && (
            <p className="text-secondary" role="status">
              <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
              Loading status options…
            </p>
          )}

          {transitionsState === "error" && (
            <div className="alert zen-error-banner" role="alert">
              <strong>Could not load the available status changes.</strong>
              <div className="mt-2">
                <button type="button" className="btn btn-sm zen-btn-outline" onClick={() => void loadTransitions()}>
                  Retry
                </button>
              </div>
            </div>
          )}

          {transitionsState === "ready" && role === "Requester" && (
            <div className="d-flex flex-wrap gap-2">
              {(requesterCanIndicate || indicatedAt) &&
                (indicatedAt ? (
                  <button type="button" className="btn zen-btn-outline" disabled>
                    {`Marked as resolved on ${formatDateTime(indicatedAt)}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn zen-btn-outline"
                    onClick={() => void handleIndicateResolved()}
                    disabled={indicating}
                    aria-busy={indicating}
                  >
                    {indicating ? "Sending…" : "Problem appears resolved"}
                  </button>
                ))}
              {canRequesterReopen && (
                <button type="button" className="btn zen-btn-outline" onClick={() => openDialogFor("Reopened")}>
                  Reopen
                </button>
              )}
              {canRequesterCancel && (
                <button type="button" className="btn zen-btn-outline" onClick={() => openDialogFor("Cancelled")}>
                  Cancel Ticket
                </button>
              )}
              {!requesterCanIndicate && !indicatedAt && !canRequesterReopen && !canRequesterCancel && (
                <p className="text-secondary small mb-0">No status changes available.</p>
              )}
            </div>
          )}
          {indicateError && <p className="zen-error-text small mt-2 mb-0">{indicateError}</p>}

          {transitionsState === "ready" && role !== "Requester" && (
            <StaffTargetPicker targets={availableTargets.map((t) => t.to)} onChoose={openDialogFor} />
          )}
        </>
      )}

      {tab === "history" && <HistoryTimeline loadState={historyState} items={historyItems} onRetry={() => void loadHistory()} />}

      {dialog?.kind === "resolve" && (
        <ResolveDialog
          ticketNumber={ticketNumber}
          gate={resolvedTransition?.gate}
          onClose={() => setDialog(null)}
          onConfirm={(reason, followUpAcknowledged) => submitStatus("Resolved", reason, followUpAcknowledged)}
        />
      )}

      {dialog?.kind === "reason" && (
        <ReasonDialog
          title={dialog.title}
          ariaLabel={dialog.ariaLabel}
          reasonLabel={dialog.required ? "Reason" : "Note (optional)"}
          required={dialog.required}
          confirmLabel={dialog.confirmLabel}
          busyLabel="Updating…"
          onClose={() => setDialog(null)}
          onConfirm={(reason) => submitStatus(dialog.to, reason)}
        />
      )}

      {dialog?.kind === "stale" && <StaleTicketDialog onReload={reloadFromStale} />}
    </section>
  );
}

function StaffTargetPicker({
  targets,
  onChoose,
}: {
  targets: TicketStatus[];
  onChoose: (to: TicketStatus) => void;
}) {
  const [selected, setSelected] = useState<TicketStatus | "">("");

  if (targets.length === 0) {
    return <p className="text-secondary small mb-0">No status changes available.</p>;
  }

  return (
    <div className="d-flex flex-wrap gap-2">
      <select
        className="form-select zen-select"
        style={{ maxWidth: 220 }}
        aria-label="Change status to"
        value={selected}
        onChange={(e) => setSelected(e.target.value as TicketStatus | "")}
      >
        <option value="">Change status to…</option>
        {targets.map((t) => (
          <option key={t} value={t}>
            {statusLabel(t)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn zen-btn-outline"
        disabled={!selected}
        onClick={() => {
          if (!selected) return;
          onChoose(selected);
          setSelected("");
        }}
      >
        Update Status
      </button>
    </div>
  );
}
