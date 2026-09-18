import type { ReactNode } from "react";
import AppShell from "./AppShell.js";
import { useAuth } from "./AuthContext.js";
import ChangePassword from "./ChangePassword.js";
import Login from "./Login.js";
import StaffApp from "./StaffApp.js";

/** Header for the mandatory password change: identity and Log Out only. */
function MinimalHeader() {
  const { signOut } = useAuth();
  return (
    <header className="zen-shell-header">
      <div className="container d-flex align-items-center gap-3 py-3">
        <span className="fw-bold fs-5 me-auto">TokTickIT</span>
        <button type="button" className="btn btn-sm btn-light zen-focusable" onClick={signOut}>
          Log Out
        </button>
      </div>
    </header>
  );
}

/**
 * Decides what a visitor may see — Lab 3 ui-spec.md §2.3.
 *
 * Session check → Login → mandatory Change Password → the application. The
 * server enforces the same rules on every request; this only chooses the
 * screen.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();

  if (auth.status === "checking") {
    return (
      <main className="container py-5" style={{ maxWidth: 420 }}>
        <div className="zen-card p-4 text-center" role="status" aria-live="polite">
          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
          Checking your session…
        </div>
      </main>
    );
  }

  if (auth.status === "unavailable") {
    return (
      <main className="container py-5" style={{ maxWidth: 420 }}>
        <div className="zen-card p-4">
          <div className="alert zen-error-banner" role="alert">
            Could not reach the server. Please try again.
          </div>
          <button type="button" className="btn zen-btn-outline" onClick={auth.retrySessionCheck}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (auth.status === "signedOut" || !auth.user) {
    return <Login />;
  }

  // BR-02 — nothing else renders until an initial password is replaced.
  if (auth.user.mustChangePassword) {
    return (
      <div className="min-vh-100">
        <MinimalHeader />
        <ChangePassword mode="mandatory" />
      </div>
    );
  }

  if (auth.changingPassword) {
    return (
      <AppShell>
        <ChangePassword mode="voluntary" />
      </AppShell>
    );
  }

  // `children` is the Requester ticketing app (Lab2App), and every one of
  // its API calls is now gated to the Requester role (authorization
  // middleware). IT Staff and Administrators land on their own home instead.
  if (auth.user.role !== "Requester") {
    return <StaffApp />;
  }

  return <>{children}</>;
}
