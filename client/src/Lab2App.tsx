import { useEffect, useState } from "react";
import AppShell, { type AppView } from "./AppShell.js";
import CreateTicket from "./CreateTicket.js";
import MyTickets from "./MyTickets.js";
import RequesterSelection from "./RequesterSelection.js";
import RequesterTicketDetail from "./RequesterTicketDetail.js";
import { RequesterProvider, useRequester } from "./RequesterContext.js";
import "./theme.css";

/**
 * BR-06 / AC-02 — requester-specific screens are unreachable until a
 * Development Requester is selected. The gate lives here so every
 * requester-specific screen added later is covered by it automatically.
 */
function RequesterGate() {
  const { selectedRequester, requesterContextKey } = useRequester();
  const [view, setView] = useState<AppView>("tickets");
  const [openTicketId, setOpenTicketId] = useState<number | null>(null);

  // BR-07 — a requester change resets the view. Without this the new
  // requester lands on whatever screen the previous one was using, which for
  // Create Ticket or a Ticket Detail is the wrong identity's context.
  useEffect(() => {
    setView("tickets");
    setOpenTicketId(null);
  }, [requesterContextKey]);

  if (!selectedRequester) {
    return (
      <AppShell>
        <RequesterSelection />
      </AppShell>
    );
  }

  function showList() {
    setOpenTicketId(null);
    setView("tickets");
  }

  return (
    <AppShell
      view={view}
      onNavigate={(next) => {
        setOpenTicketId(null);
        setView(next);
      }}
    >
      {/* Remounting on context change discards the previous Requester's data
          and forces a reload (BR-07, AC-04). */}
      <div key={requesterContextKey}>
        {view === "create" ? (
          <CreateTicket onDone={showList} />
        ) : openTicketId !== null ? (
          <RequesterTicketDetail
            requesterId={selectedRequester.id}
            ticketId={openTicketId}
            onBack={showList}
          />
        ) : (
          <MyTickets
            onCreateTicket={() => setView("create")}
            onOpenTicket={setOpenTicketId}
          />
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
