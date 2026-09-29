import { useState } from "react";
import AppShell, { type AppView } from "./AppShell.js";
import CreateTicket from "./CreateTicket.js";
import MyTickets, { type MyTicketsDrillDownFilters } from "./MyTickets.js";
import RequesterDashboard from "./RequesterDashboard.js";
import RequesterTicketDetail from "./RequesterTicketDetail.js";
import "./theme.css";

/**
 * Requester screens (Dashboard, My Tickets, Create Ticket, Ticket Detail),
 * gated by the authenticated session — AuthGate only renders this once a
 * signed-in Requester with no pending password change reaches it (FR-18,
 * FR-19). Lab 4 — the Requester lands on the Dashboard (ui-spec.md §2).
 */
export default function Lab2App() {
  const [view, setView] = useState<AppView>("dashboard");
  const [openTicketId, setOpenTicketId] = useState<number | null>(null);

  const [ticketsFilters, setTicketsFilters] = useState<MyTicketsDrillDownFilters | undefined>(undefined);
  const [ticketsFilterToken, setTicketsFilterToken] = useState(0);

  function showList() {
    setOpenTicketId(null);
    setView("tickets");
  }

  function openMyTickets(filters?: MyTicketsDrillDownFilters) {
    setOpenTicketId(null);
    setTicketsFilters(filters);
    setTicketsFilterToken((t) => t + 1);
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
      ) : view === "dashboard" ? (
        <RequesterDashboard
          onOpenTicket={setOpenTicketId}
          onOpenMyTickets={openMyTickets}
          onCreateTicket={() => setView("create")}
        />
      ) : (
        <MyTickets
          onCreateTicket={() => setView("create")}
          onOpenTicket={setOpenTicketId}
          initialFilters={ticketsFilters}
          filterToken={ticketsFilterToken}
        />
      )}
    </AppShell>
  );
}
