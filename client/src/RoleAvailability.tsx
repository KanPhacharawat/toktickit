import { useAuth } from "./AuthContext.js";
import { ROLE_LABELS } from "./authApi.js";

/**
 * Shown to a signed-in user whose role has no screens yet.
 *
 * This issue adds server-side role authorization (every route rejects a
 * role it does not permit) ahead of the screens IT Staff and Administrators
 * will use — those arrive with their own issues. Without this placeholder,
 * a non-Requester would land on the Requester screens and see nothing but
 * 403 errors, which would look broken rather than simply unfinished.
 */
export default function RoleAvailability() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <main className="container py-5" style={{ maxWidth: 560 }}>
      <div className="zen-card p-4 p-md-5 text-center">
        <h1 className="zen-title h4 mb-2">Nothing to show yet</h1>
        <p className="text-secondary mb-0">
          You are signed in as <strong>{user.name}</strong> (
          {ROLE_LABELS[user.role]}). Screens for this role are on their way in
          a future update.
        </p>
      </div>
    </main>
  );
}
