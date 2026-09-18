import { useState } from "react";
import AppShell, { type StaffView } from "./AppShell.js";
import { useAuth } from "./AuthContext.js";
import StaffTicketDetail from "./StaffTicketDetail.js";
import StaffTicketQueue from "./StaffTicketQueue.js";
import UserManagement from "./UserManagement.js";

/**
 * IT Staff and Administrator home (ui-spec.md §2.2). IT Staff see only the
 * Ticket Queue. Administrators land on User Management, with the Ticket
 * Queue as their second destination.
 */
export default function StaffApp() {
  const { user, signOut } = useAuth();
  const isAdmin = user?.role === "Administrator";

  const [staffView, setStaffView] = useState<StaffView>(isAdmin ? "users" : "queue");
  const [openTicketId, setOpenTicketId] = useState<number | null>(null);

  const showQueue = !isAdmin || staffView === "queue";

  return (
    <AppShell staffView={staffView} onNavigateStaff={isAdmin ? setStaffView : undefined}>
      {openTicketId !== null ? (
        <StaffTicketDetail ticketId={openTicketId} onBack={() => setOpenTicketId(null)} />
      ) : showQueue ? (
        <StaffTicketQueue onOpenTicket={setOpenTicketId} />
      ) : (
        <UserManagement onSelfDeactivated={() => void signOut()} />
      )}
    </AppShell>
  );
}
