import type { ReactNode } from "react";
import { useRequester } from "./RequesterContext.js";

/**
 * Application shell — ui-spec.md §2.
 *
 * Displays the selected Development Requester and offers Change Requester.
 * The identity is labelled as a testing identity, never as a signed-in user.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const { selectedRequester, clearRequester } = useRequester();

  return (
    <div className="min-vh-100">
      <header className="zen-shell-header">
        <div className="container d-flex flex-wrap align-items-center gap-2 py-3">
          <span className="fw-bold fs-5 me-auto">TokTickIT</span>

          {selectedRequester && (
            <div className="d-flex flex-wrap align-items-center gap-2">
              <span className="small text-white-50">Testing as</span>
              <span className="zen-requester-chip" data-testid="current-requester">
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
