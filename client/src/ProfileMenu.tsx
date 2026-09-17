import { useEffect, useRef, useState } from "react";
import type { AuthContextValue } from "./AuthContext.js";
import { ROLE_LABELS } from "./authApi.js";

/**
 * Profile menu in the shell header — Lab 3 ui-spec.md §3.1.
 *
 * Shows who is signed in and offers Change Password and Log Out. A plain
 * disclosure (button + list of buttons) keeps every item reachable by Tab.
 */
export default function ProfileMenu({ auth }: { auth: AuthContextValue }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const user = auth.user;
  if (!user) return null;
  const roleLabel = ROLE_LABELS[user.role];

  async function handleSignOut() {
    setSigningOut(true);
    await auth.signOut();
  }

  return (
    <div className="position-relative" ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-sm btn-light zen-focusable d-flex align-items-center gap-2"
        aria-expanded={open}
        aria-controls="profile-menu"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span className="fw-semibold" data-testid="signed-in-user">
          {user.name}
        </span>
        <span className="zen-badge zen-status" data-testid="signed-in-role">
          {roleLabel}
        </span>
        <span aria-hidden="true">▾</span>
        <span className="visually-hidden">Profile menu</span>
      </button>

      {open && (
        <div id="profile-menu" className="zen-card zen-profile-menu">
          <div className="px-3 py-2 border-bottom">
            <p className="fw-semibold mb-0">{user.name}</p>
            <p className="small text-secondary mb-1 text-break">{user.email}</p>
            <span className="zen-badge zen-status">{roleLabel}</span>
          </div>
          <button
            type="button"
            className="zen-menu-item"
            onClick={() => {
              setOpen(false);
              auth.openChangePassword();
            }}
          >
            Change Password
          </button>
          <button
            type="button"
            className="zen-menu-item"
            onClick={handleSignOut}
            disabled={signingOut}
            aria-busy={signingOut}
          >
            {signingOut ? "Signing out…" : "Log Out"}
          </button>
        </div>
      )}
    </div>
  );
}
