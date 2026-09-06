import { useRequester } from "./RequesterContext.js";

/**
 * Placeholder landing screen for the selected Requester.
 *
 * Create Ticket, My Tickets, and Ticket Detail are delivered by their own
 * issues. This screen exists so the requester context is observable: it is
 * mounted under a key derived from the selected Requester, so changing the
 * Requester remounts it and any requester-specific data it holds is reloaded
 * (BR-07, AC-04).
 */
export default function RequesterHome({
  onCreateTicket,
}: {
  onCreateTicket?: () => void;
}) {
  const { selectedRequester } = useRequester();
  if (!selectedRequester) return null;

  return (
    <main className="container py-4" style={{ maxWidth: 720 }}>
      <div className="zen-card p-4">
        <h2 className="zen-title h5 mb-3">Requester context</h2>

        <dl className="row mb-0">
          <dt className="col-sm-4 fw-semibold">Requester</dt>
          <dd className="col-sm-8" data-testid="context-name">
            {selectedRequester.name}
          </dd>

          <dt className="col-sm-4 fw-semibold">Email</dt>
          <dd className="col-sm-8">{selectedRequester.email}</dd>

          {selectedRequester.department && (
            <>
              <dt className="col-sm-4 fw-semibold">Department</dt>
              <dd className="col-sm-8">{selectedRequester.department}</dd>
            </>
          )}

          <dt className="col-sm-4 fw-semibold">Requester ID</dt>
          <dd className="col-sm-8 mb-0" data-testid="context-id">
            {selectedRequester.id}
          </dd>
        </dl>
      </div>

      {onCreateTicket && (
        <button
          type="button"
          className="btn zen-btn-primary mt-3"
          onClick={onCreateTicket}
        >
          Create Ticket
        </button>
      )}

      <p className="text-secondary small mt-3 mb-0">
        My Tickets is delivered in a following issue. Requester-specific
        screens read this context.
      </p>
    </main>
  );
}
