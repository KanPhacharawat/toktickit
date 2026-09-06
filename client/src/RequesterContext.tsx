import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchActiveRequesters, type DevelopmentRequester } from "./api.js";

const STORAGE_KEY = "toktickit.lab2.selectedRequesterId";

export type LoadState = "loading" | "ready" | "error";

export interface RequesterContextValue {
  /** Active Requesters returned by the API (BR-05). */
  requesters: DevelopmentRequester[];
  loadState: LoadState;
  /** Safe, user-facing message; empty unless `loadState === "error"`. */
  errorMessage: string;
  /** The current testing identity, or null when none is chosen (BR-06). */
  selectedRequester: DevelopmentRequester | null;
  /**
   * Increments every time the selected Requester changes. Requester-specific
   * screens depend on it so they refetch their data (BR-07, AC-04).
   */
  requesterContextKey: number;
  selectRequester: (id: number) => void;
  clearRequester: () => void;
  reload: () => void;
}

const RequesterContext = createContext<RequesterContextValue | null>(null);

function readStoredId(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const id = Number.parseInt(raw, 10);
    return Number.isNaN(id) ? null : id;
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). Not fatal:
    // the user simply picks a Requester again.
    return null;
  }
}

function writeStoredId(id: number | null): void {
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    /* ignore — selection still works for this session */
  }
}

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requesters, setRequesters] = useState<DevelopmentRequester[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(readStoredId);
  const [contextKey, setContextKey] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoadState("loading");
    setErrorMessage("");

    fetchActiveRequesters()
      .then((data) => {
        if (cancelled) return;
        setRequesters(data);
        setLoadState("ready");
        // A stored Requester that is no longer active must not stay selected
        // (BR-05): drop it and send the user back to the selector.
        setSelectedId((current) =>
          current !== null && !data.some((r) => r.id === current)
            ? null
            : current,
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRequesters([]);
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Could not load development requesters.",
        );
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const selectRequester = useCallback((id: number) => {
    setSelectedId((current) => {
      // Re-selecting the same Requester is not a context change.
      if (current === id) return current;
      writeStoredId(id);
      setContextKey((key) => key + 1);
      return id;
    });
  }, []);

  const clearRequester = useCallback(() => {
    setSelectedId((current) => {
      if (current === null) return current;
      writeStoredId(null);
      setContextKey((key) => key + 1);
      return null;
    });
  }, []);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  const selectedRequester = useMemo(
    () => requesters.find((r) => r.id === selectedId) ?? null,
    [requesters, selectedId],
  );

  const value = useMemo<RequesterContextValue>(
    () => ({
      requesters,
      loadState,
      errorMessage,
      selectedRequester,
      requesterContextKey: contextKey,
      selectRequester,
      clearRequester,
      reload,
    }),
    [
      requesters,
      loadState,
      errorMessage,
      selectedRequester,
      contextKey,
      selectRequester,
      clearRequester,
      reload,
    ],
  );

  return (
    <RequesterContext.Provider value={value}>
      {children}
    </RequesterContext.Provider>
  );
}

export function useRequester(): RequesterContextValue {
  const value = useContext(RequesterContext);
  if (!value) {
    throw new Error("useRequester must be used inside a RequesterProvider");
  }
  return value;
}
