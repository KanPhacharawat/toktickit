import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchTicketDetail, type TicketDetail } from "./api.js";
import AttachmentSection from "./AttachmentSection.js";
import { priorityLabel } from "./ticketFormRules.js";

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

export default function RequesterTicketDetail({
  requesterId,
  ticketId,
  onBack,
}: {
  requesterId: number;
  ticketId: number;
  onBack: () => void;
}) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [isForbidden, setIsForbidden] = useState(false);

  /**
   * `silent` refreshes in place. A refresh after an upload or removal must not
   * blank the screen: doing so unmounts the attachment section and discards
   * any message it is showing about what just failed.
   */
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoadState("loading");
    setErrorMessage("");
    setIsForbidden(false);
    try {
      const detail = await fetchTicketDetail(requesterId, ticketId);
      setTicket(detail);
      setLoadState("ready");
    } catch (err) {
      setTicket(null);
      if (err instanceof ApiError) {
        // BR-09 / AC-12 — an ownership failure is its own safe state, with no
        // information about the real owner.
        setIsForbidden(err.status === 403 || err.status === 404);
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Could not load the ticket. Please try again.");
      }
      setLoadState("error");
    }
  }, [requesterId, ticketId]);

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
              {isForbidden
                ? "This ticket is not available."
                : "Could not load the ticket."}
            </strong>
            <p className="mb-0 mt-1 small">
              {isForbidden
                ? "It does not belong to the selected requester, or it does not exist."
                : errorMessage}
            </p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            {!isForbidden && (
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
            requesterId={requesterId}
            ticketId={ticket.id}
            attachments={ticket.attachments}
            onChanged={() => load({ silent: true })}
          />
        </>
      )}
    </main>
  );
}
