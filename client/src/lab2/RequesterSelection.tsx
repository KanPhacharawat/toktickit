import { useEffect, useState } from "react";
import { useRequester } from "./RequesterContext.js";

/**
 * Requester Selection screen — ui-spec.md §3.
 *
 * This is the Lab 2 simulated login. It is a testing mechanism, not
 * authentication (BR-04); the screen says so explicitly.
 */
export default function RequesterSelection() {
  const {
    requesters,
    loadState,
    errorMessage,
    selectedRequester,
    selectRequester,
    reload,
  } = useRequester();

  // Local draft: the context only changes when Continue is pressed, so the
  // dropdown can be browsed without switching requester context.
  const [draftId, setDraftId] = useState<string>("");

  // Pre-select the current requester when arriving via Change Requester.
  useEffect(() => {
    if (selectedRequester) setDraftId(String(selectedRequester.id));
  }, [selectedRequester]);

  const isEmpty = loadState === "ready" && requesters.length === 0;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const id = Number.parseInt(draftId, 10);
    if (!Number.isNaN(id)) selectRequester(id);
  }

  return (
    <main className="container py-5" style={{ maxWidth: 560 }}>
      <div className="zen-card p-4 p-md-5">
        <h1 className="zen-title h3 mb-2">TokTickIT</h1>
        <p className="text-secondary mb-4">IT Service Desk</p>

        {/* BR-04 / AC — the selector is clearly identified as testing-only. */}
        <div className="zen-testing-banner mb-4" role="note">
          <strong>Testing mechanism — not a real login.</strong>
          <p className="mb-0 mt-1 small">
            Lab 2 has no authentication. Choose a Development Requester to
            simulate who is using the application. Real sign-in arrives in
            Lab 3.
          </p>
        </div>

        {loadState === "loading" && (
          <div className="py-3" role="status" aria-live="polite">
            <span
              className="spinner-border spinner-border-sm me-2"
              aria-hidden="true"
            />
            Loading development requesters…
          </div>
        )}

        {loadState === "error" && (
          <div className="py-2">
            <div className="alert border zen-error-text" role="alert">
              <strong>Unable to load development requesters.</strong>
              <p className="mb-0 mt-1 small">{errorMessage}</p>
            </div>
            <button
              type="button"
              className="btn zen-btn-outline"
              onClick={reload}
            >
              Retry
            </button>
          </div>
        )}

        {isEmpty && (
          <div className="py-2">
            <div className="alert border" role="status">
              <strong>No active development requesters are available.</strong>
              <p className="mb-0 mt-1 small">
                Seed the database with at least one active requester, then
                retry.
              </p>
            </div>
            <button
              type="button"
              className="btn zen-btn-outline"
              onClick={reload}
            >
              Retry
            </button>
          </div>
        )}

        {loadState === "ready" && requesters.length > 0 && (
          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="requester-select" className="form-label fw-semibold">
              Development Requester
            </label>
            <select
              id="requester-select"
              className="form-select zen-select"
              value={draftId}
              onChange={(e) => setDraftId(e.target.value)}
            >
              <option value="">Select a requester…</option>
              {requesters.map((requester) => (
                <option key={requester.id} value={requester.id}>
                  {requester.department
                    ? `${requester.name} — ${requester.department}`
                    : requester.name}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="btn zen-btn-primary mt-4 w-100"
              disabled={draftId === ""}
            >
              Continue
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
