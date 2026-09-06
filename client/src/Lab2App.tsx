import { useState } from "react";
import AppShell, { type AppView } from "./AppShell.js";
import CreateTicket from "./CreateTicket.js";
import RequesterHome from "./RequesterHome.js";
import RequesterSelection from "./RequesterSelection.js";
import { RequesterProvider, useRequester } from "./RequesterContext.js";
import "./theme.css";

/**
 * BR-06 / AC-02 — requester-specific screens are unreachable until a
 * Development Requester is selected. The gate lives here so every
 * requester-specific screen added later is covered by it automatically.
 */
function RequesterGate() {
  const { selectedRequester, requesterContextKey } = useRequester();
  const [view, setView] = useState<AppView>("home");

  if (!selectedRequester) {
    return (
      <AppShell>
        <RequesterSelection />
      </AppShell>
    );
  }

  return (
    <AppShell view={view} onNavigate={setView}>
      {/* Remounting on context change discards the previous Requester's data
          and forces a reload (BR-07, AC-04). */}
      <div key={requesterContextKey}>
        {view === "create" ? (
          <CreateTicket onDone={() => setView("home")} />
        ) : (
          <RequesterHome onCreateTicket={() => setView("create")} />
        )}
      </div>
    </AppShell>
  );
}

export default function Lab2App() {
  return (
    <RequesterProvider>
      <RequesterGate />
    </RequesterProvider>
  );
}
