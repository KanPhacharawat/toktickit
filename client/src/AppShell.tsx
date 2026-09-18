import type { ReactNode } from "react";
import { useOptionalAuth } from "./AuthContext.js";
import ProfileMenu from "./ProfileMenu.js";

/** The Requester-facing screens reachable from the shell nav. */
export type AppView = "tickets" | "create";

/**
 * Application shell — Lab 3 ui-spec.md §3.
 *
 * Shows the authenticated user's name, role badge, and profile menu. The
 * Lab 2 "Testing as" chip and Change Requester action are gone entirely
 * (FR-19) — identity comes only from the session.
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
  // Optional: the voluntary Change Password screen renders the shell outside
  // the Requester screens, and some component tests render without auth.
  const auth = useOptionalAuth();
  const role = auth?.user?.role;
  const showRequesterNav = Boolean(role === "Requester" && onNavigate);
  // IT Staff and Administrator have one destination today (ui-spec.md §2.2);
  // User Management arrives with its own issue.
  const showStaffNav = role === "ITStaff" || role === "Administrator";

  return (
    <div className="min-vh-100">
      <header className="zen-shell-header">
        <div className="container d-flex flex-wrap align-items-center gap-3 py-3">
          <span className="fw-bold fs-5">TokTickIT</span>

          {showRequesterNav && (
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

          {showStaffNav && (
            <nav
              className="d-flex flex-wrap align-items-center gap-3"
              aria-label="Main"
            >
              <span className="zen-nav-link" aria-current="page">
                Ticket Queue
              </span>
            </nav>
          )}

          <div className="d-flex flex-wrap align-items-center gap-3 ms-auto">
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
