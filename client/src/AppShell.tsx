import { useEffect, useRef, useState, type ReactNode } from "react";
import { useOptionalAuth } from "./AuthContext.js";
import ProfileMenu from "./ProfileMenu.js";

/** The Requester-facing screens reachable from the shell nav. */
export type AppView = "dashboard" | "tickets" | "create";

/** IT Staff and Administrator destinations (Lab 4 ui-spec.md §2). */
export type StaffView = "dashboard" | "users" | "queue";

const STAFF_NAV_LABELS: Record<StaffView, string> = {
  dashboard: "Dashboard",
  users: "User Management",
  queue: "Ticket Queue",
};

/** ui-spec.md §2 — IT Staff: Dashboard · Ticket Queue. */
const ITSTAFF_DESTINATIONS: readonly StaffView[] = ["dashboard", "queue"];
/** ui-spec.md §2 — Administrator: IT Staff nav + Users. */
const ADMIN_DESTINATIONS: readonly StaffView[] = ["dashboard", "queue", "users"];

const REQUESTER_NAV_LABELS: Record<AppView, string> = {
  dashboard: "Dashboard",
  tickets: "My Tickets",
  create: "Create Ticket",
};
const REQUESTER_DESTINATIONS: readonly AppView[] = ["dashboard", "tickets", "create"];

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Application shell — Lab 3 ui-spec.md §3, Lab 4 ui-spec.md §2.
 *
 * Shows the authenticated user's name, role badge, and profile menu. Below
 * 768px the nav row is replaced by a hamburger button that opens a
 * full-width drawer holding the same destinations (ui-spec.md §2 line 60):
 * focus is trapped inside while the drawer is open and returns to the
 * hamburger button on close.
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
  const showItStaffNav = role === "ITStaff" && Boolean(onNavigateStaff);
  const showAdminNav = role === "Administrator" && Boolean(onNavigateStaff);
  const showNav = showRequesterNav || showItStaffNav || showAdminNav;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  function closeDrawer() {
    setDrawerOpen(false);
    toggleRef.current?.focus();
  }

  // Focus trap + Escape-to-close while the drawer is open (ui-spec.md §2 line 60).
  useEffect(() => {
    if (!drawerOpen) return;

    const focusables = () =>
      Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      );
    focusables()[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen]);

  function navItems() {
    if (showAdminNav || showItStaffNav) {
      const destinations = showAdminNav ? ADMIN_DESTINATIONS : ITSTAFF_DESTINATIONS;
      return destinations.map((destination) => ({
        key: destination,
        label: STAFF_NAV_LABELS[destination],
        current: staffView === destination,
        onClick: () => onNavigateStaff!(destination),
      }));
    }
    return REQUESTER_DESTINATIONS.map((destination) => ({
      key: destination,
      label: REQUESTER_NAV_LABELS[destination],
      current: view === destination,
      onClick: () => onNavigate!(destination),
    }));
  }

  return (
    <div className="min-vh-100">
      <header className="zen-shell-header">
        <div className="container d-flex flex-wrap align-items-center gap-3 py-3">
          {showNav && (
            <button
              ref={toggleRef}
              type="button"
              className="zen-nav-toggle zen-focusable"
              aria-expanded={drawerOpen}
              aria-controls="mobile-nav-drawer"
              onClick={() => setDrawerOpen((isOpen) => !isOpen)}
            >
              <span aria-hidden="true">{"☰"}</span>
              <span className="visually-hidden">Menu</span>
            </button>
          )}

          <span className="fw-bold fs-5">TokTickIT</span>

          {showNav && (
            <nav
              className="d-flex flex-wrap align-items-center gap-3 zen-nav-desktop"
              aria-label="Main"
            >
              {navItems().map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="zen-nav-link"
                  aria-current={item.current ? "page" : undefined}
                  onClick={item.onClick}
                >
                  {item.label}
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

      {showNav && drawerOpen && (
        <div className="zen-nav-drawer-overlay" onClick={closeDrawer}>
          <div
            id="mobile-nav-drawer"
            ref={drawerRef}
            className="zen-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="fw-bold fs-5">TokTickIT</span>
              <button
                type="button"
                className="zen-nav-link zen-focusable"
                onClick={closeDrawer}
              >
                <span aria-hidden="true">{"✕"}</span>
                <span className="visually-hidden">Close menu</span>
              </button>
            </div>
            <nav aria-label="Mobile" className="d-flex flex-column gap-2">
              {navItems().map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="zen-nav-link zen-nav-drawer-link"
                  aria-current={item.current ? "page" : undefined}
                  onClick={() => {
                    item.onClick();
                    closeDrawer();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

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
