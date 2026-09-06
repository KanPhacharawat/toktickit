import type { ReactNode } from "react";
import { useRequester } from "./RequesterContext.js";

/** The requester-facing screens reachable from the shell nav. */
export type AppView = "home" | "create";

/**
 * Application shell — ui-spec.md §2.
 *
 * Displays the selected Development Requester, the Change Requester action,
 * and navigation with active-view indication. The identity is labelled as a
 * testing identity, never as a signed-in user.
 */
export default function AppShell({
  children,
  view,
  onNavigate,
}: {
  children: ReactNode;
  view?: AppView;
  onNavigate?: (view: AppView) => void;
}) {
  const { selectedRequester, clearRequester } = useRequester();
  const showNav = Boolean(selectedRequester && onNavigate);

  return (
    <div className="min-vh-100">
      <header className="zen-shell-header">
        <div className="container d-flex flex-wrap align-items-center gap-3 py-3">
          <span className="fw-bold fs-5">TokTickIT</span>

          {showNav && (
            <nav
              className="d-flex flex-wrap align-items-center gap-3"
              aria-label="Main"
            >
              <button
                type="button"
                className="zen-nav-link"
                aria-current={view === "home" ? "page" : undefined}
                onClick={() => onNavigate!("home")}
              >
                My Tickets
              </button>
              <button
                type="button"
                className="zen-nav-link"
                aria-current={view === "create" ? "page" : undefined}
                onClick={() => onNavigate!("create")}
              >
                Create Ticket
              </button>
            </nav>
          )}

          {selectedRequester && (
            <div className="d-flex flex-wrap align-items-center gap-2 ms-auto">
              <span className="small text-white-50">Testing as</span>
              <span
                className="zen-requester-chip"
                data-testid="current-requester"
              >
                {selectedRequester.name}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-light zen-focusable"
                onClick={clearRequester}
              >
                Change Requester
              </button>
            </div>
          )}
        </div>
      </header>

      {children}
    </div>
  );
}
