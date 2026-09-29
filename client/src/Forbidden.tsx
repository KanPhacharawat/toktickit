/**
 * Forbidden route page — Lab 4 ui-spec.md §2 line 61: "Forbidden route → 403
 * page with 'Go to Dashboard'."
 */
export default function Forbidden({ onGoToDashboard }: { onGoToDashboard: () => void }) {
  return (
    <main className="container py-5 text-center">
      <div className="alert zen-error-banner d-inline-block" role="alert">
        <h1 className="zen-title h4 mb-1">403 — Forbidden</h1>
        <p className="mb-0">You don&apos;t have permission to view this page.</p>
      </div>
      <div className="mt-3">
        <button type="button" className="btn zen-btn-primary" onClick={onGoToDashboard}>
          Go to Dashboard
        </button>
      </div>
    </main>
  );
}
