import type { ReactNode } from "react";
import { useOptionalAuth } from "./AuthContext.js";
import ProfileMenu from "./ProfileMenu.js";

/** The Requester-facing screens reachable from the shell nav. */
export type AppView = "tickets" | "create";

/** The Administrator's two destinations (ui-spec.md §2.2). */
export type StaffView = "users" | "queue";

const STAFF_NAV_LABELS: Record<StaffView, string> = {
  users: "User Management",
  queue: "Ticket Queue",
};

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
  staffView,
  onNavigateStaff,
}: {
  children: ReactNode;
  view?: AppView;
  onNavigate?: (view: AppView) => void;
  staffView?: StaffView;
  onNavigateStaff?: (view: StaffView) => void;
}) {
  // Optional: the voluntary Change Password screen renders the shell outside
  // the Requester screens, and some component tests render without auth.
  const auth = useOptionalAuth();
  const role = auth?.user?.role;
  const showRequesterNav = Boolean(role === "Requester" && onNavigate);
  // IT Staff has one destination (ui-spec.md §2.2): a static label, not a
  // button, since there is nowhere else to navigate to.
  const showStaffLabel = role === "ITStaff";
  // Administrator has two: User Management (home) and Ticket Queue.
  const showAdminNav = role === "Administrator" && Boolean(onNavigateStaff);

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

          {showStaffLabel && (
            <nav
              className="d-flex flex-wrap align-items-center gap-3"
              aria-label="Main"
            >
              <span className="zen-nav-link" aria-current="page">
                Ticket Queue
              </span>
            </nav>
          )}

          {showAdminNav && (
            <nav
              className="d-flex flex-wrap align-items-center gap-3"
              aria-label="Main"
            >
              {(["users", "queue"] as const).map((destination) => (
                <button
                  key={destination}
                  type="button"
                  className="zen-nav-link"
                  aria-current={staffView === destination ? "page" : undefined}
                  onClick={() => onNavigateStaff!(destination)}
                >
                  {STAFF_NAV_LABELS[destination]}
                </button>
              ))}
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
