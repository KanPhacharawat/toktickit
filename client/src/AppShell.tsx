import { useContext, type ReactNode } from "react";
import { useOptionalAuth } from "./AuthContext.js";
import ProfileMenu from "./ProfileMenu.js";
import { RequesterContext } from "./RequesterContext.js";

/** The requester-facing screens reachable from the shell nav. */
export type AppView = "tickets" | "create";

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
  // Both contexts are optional: the voluntary Change Password screen renders
  // the shell outside the Lab 2 requester screens, and Lab 2 component tests
  // render the requester screens without authentication.
  const requester = useContext(RequesterContext);
  const selectedRequester = requester?.selectedRequester ?? null;
  const auth = useOptionalAuth();
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
                aria-current={view === "tickets" ? "page" : undefined}
                onClick={() => onNavigate!("tickets")}
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

          <div className="d-flex flex-wrap align-items-center gap-3 ms-auto">
            {selectedRequester && requester && (
              <div className="d-flex flex-wrap align-items-center gap-2">
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
                  onClick={requester.clearRequester}
                >
                  Change Requester
                </button>
              </div>
            )}

            {/* Lab 3 — the signed-in user, their role, and Log Out. */}
            {auth?.user && <ProfileMenu auth={auth} />}
          </div>
        </div>
      </header>

      {auth?.flash && (
        <div className="container pt-3">
          <div
            className="zen-success-banner d-flex align-items-center gap-2"
            role="status"
          >
            <span className="me-auto">{auth.flash}</span>
            <button
              type="button"
              className="btn btn-sm zen-btn-outline"
              onClick={auth.dismissFlash}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
