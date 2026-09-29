/**
 * Unknown route page — Lab 4 ui-spec.md §2 line 61: "Unknown route → Not
 * Found page with 'Go to Dashboard'."
 */
export default function NotFound({ onGoToDashboard }: { onGoToDashboard: () => void }) {
  return (
    <main className="container py-5 text-center">
      <div className="zen-card d-inline-block p-4">
        <h1 className="zen-title h4 mb-1">404 — Not Found</h1>
        <p className="text-secondary mb-0">
          We couldn&apos;t find the page you&apos;re looking for.
        </p>
      </div>
      <div className="mt-3">
        <button type="button" className="btn zen-btn-primary" onClick={onGoToDashboard}>
          Go to Dashboard
        </button>
      </div>
    </main>
  );
}
