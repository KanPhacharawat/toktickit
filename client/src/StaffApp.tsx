import { useState } from "react";
import AppShell from "./AppShell.js";
import StaffTicketDetail from "./StaffTicketDetail.js";
import StaffTicketQueue from "./StaffTicketQueue.js";

/**
 * IT Staff and Administrator home — the Ticket Queue and Staff Ticket Detail
 * (ui-spec.md §2.2). User Management (Administrator's other destination)
 * arrives with its own issue.
 */
export default function StaffApp() {
  const [openTicketId, setOpenTicketId] = useState<number | null>(null);

  return (
    <AppShell>
      {openTicketId !== null ? (
        <StaffTicketDetail ticketId={openTicketId} onBack={() => setOpenTicketId(null)} />
      ) : (
        <StaffTicketQueue onOpenTicket={setOpenTicketId} />
      )}
    </AppShell>
  );
}
