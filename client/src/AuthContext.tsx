import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as authApi from "./authApi.js";
import type { CurrentUser } from "./authApi.js";
import { setSessionExpiredHandler } from "./api.js";

/** Lab 3 §7.7 — the obsolete Lab 2 selection key, removed on every start-up. */
const OBSOLETE_REQUESTER_STORAGE_KEY = "toktickit.lab2.selectedRequesterId";

// Signed-in state for the whole app (Lab 3 ui-spec.md §2.3, §3).
//
// Identity lives only in memory, restored from GET /api/auth/me on start-up.
// Nothing about the session is written to browser storage (BR-17).

export type AuthStatus = "checking" | "unavailable" | "signedOut" | "signedIn";

export interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  /** Shown on the Login screen, e.g. after signing out. */
  notice: string;
  /** Shown once inside the shell, e.g. after a password change. */
  flash: string;
  /** True while the voluntary Change Password screen is open. */
  changingPassword: boolean;
  /** Throws the ApiError from the server so Login can show the right message. */
  signIn: (email: string, password: string) => Promise<CurrentUser>;
  signOut: () => Promise<void>;
  passwordChanged: (user: CurrentUser) => void;
  openChangePassword: () => void;
  closeChangePassword: () => void;
  dismissFlash: () => void;
  retrySessionCheck: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [notice, setNotice] = useState("");
  const [flash, setFlash] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [checkToken, setCheckToken] = useState(0);

  useEffect(() => {
    // Lab 3 §7.7 — identity is held only in memory; any leftover Lab 2
    // selection is removed once, on start-up.
    try {
      window.localStorage.removeItem(OBSOLETE_REQUESTER_STORAGE_KEY);
    } catch {
      /* storage can be unavailable; nothing to clean up either way */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("checking");

    authApi
      .fetchCurrentUser()
      .then((current) => {
        if (cancelled) return;
        setUser(current);
        setStatus(current ? "signedIn" : "signedOut");
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, [checkToken]);

  // ui-spec.md §2.3 — any API 401 from any screen ends the session the same
  // way: clear state, show Login with the "session has ended" message.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setFlash("");
      setChangingPassword(false);
      setNotice("Your session has ended. Please sign in again.");
      setStatus("signedOut");
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const signedIn = await authApi.login(email, password);
    setUser(signedIn);
    setNotice("");
    setFlash("");
    setChangingPassword(false);
    setStatus("signedIn");
    return signedIn;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the server could not be reached, this browser must stop
      // showing the signed-in application (ui-spec.md §3.2).
    }
    setUser(null);
    setFlash("");
    setChangingPassword(false);
    setNotice("You have signed out.");
    setStatus("signedOut");
  }, []);

  const passwordChanged = useCallback((updated: CurrentUser) => {
    setUser(updated);
    setChangingPassword(false);
    setFlash("Your password has been changed.");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      notice,
      flash,
      changingPassword,
      signIn,
      signOut,
      passwordChanged,
      openChangePassword: () => setChangingPassword(true),
      closeChangePassword: () => setChangingPassword(false),
      dismissFlash: () => setFlash(""),
      retrySessionCheck: () => setCheckToken((t) => t + 1),
    }),
    [status, user, notice, flash, changingPassword, signIn, signOut, passwordChanged],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside an AuthProvider");
  return value;
}

/** For shared components (the shell) that also render without an AuthProvider. */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
