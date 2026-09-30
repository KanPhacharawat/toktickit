import { useState } from "react";
import AppShell, { type AppView } from "./AppShell.js";
import CreateTicket from "./CreateTicket.js";
import MyTickets from "./MyTickets.js";
import RequesterTicketDetail from "./RequesterTicketDetail.js";
import "./theme.css";

/**
 * Requester screens (My Tickets, Create Ticket, Ticket Detail), gated by the
 * authenticated session — AuthGate only renders this once a signed-in
 * Requester with no pending password change reaches it (FR-18, FR-19).
 */
export default function Lab2App() {
  const [view, setView] = useState<AppView>("tickets");
  const [openTicketId, setOpenTicketId] = useState<number | null>(null);

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
      {view === "create" ? (
        <CreateTicket onDone={showList} />
      ) : openTicketId !== null ? (
        <RequesterTicketDetail ticketId={openTicketId} onBack={showList} />
      ) : (
        <MyTickets onCreateTicket={() => setView("create")} onOpenTicket={setOpenTicketId} />
      )}
    </AppShell>
  );
}
