import { useState } from "react";
import AppShell, { type StaffView } from "./AppShell.js";
import { useAuth } from "./AuthContext.js";
import NotFound from "./NotFound.js";
import StaffDashboard from "./StaffDashboard.js";
import StaffTicketDetail from "./StaffTicketDetail.js";
import StaffTicketQueue, { type StaffQueueDrillDownFilters } from "./StaffTicketQueue.js";
import UserManagement, { type UserListDrillDownFilters } from "./UserManagement.js";

/**
 * IT Staff and Administrator home — Lab 4 ui-spec.md §2/§3. Both roles land
 * on the Dashboard; IT Staff's second destination is the Ticket Queue,
 * Administrators additionally get User Management.
 */
export default function StaffApp() {
  const { user, signOut } = useAuth();
  const isAdmin = user?.role === "Administrator";

  const [staffView, setStaffView] = useState<StaffView>("dashboard");
  const [openTicketId, setOpenTicketId] = useState<number | null>(null);

  const [queueFilters, setQueueFilters] = useState<StaffQueueDrillDownFilters | undefined>(undefined);
  const [queueFilterToken, setQueueFilterToken] = useState(0);
  const [usersFilters, setUsersFilters] = useState<UserListDrillDownFilters | undefined>(undefined);
  const [usersFilterToken, setUsersFilterToken] = useState(0);

  function openQueue(filters?: StaffQueueDrillDownFilters) {
    setQueueFilters(filters);
    setQueueFilterToken((t) => t + 1);
    setStaffView("queue");
  }

  function openUsers(filters?: UserListDrillDownFilters) {
    setUsersFilters(filters);
    setUsersFilterToken((t) => t + 1);
    setStaffView("users");
  }

  return (
    <AppShell
      staffView={staffView}
      onNavigateStaff={(next) => {
        setOpenTicketId(null);
        setStaffView(next);
      }}
    >
      {openTicketId !== null ? (
        <StaffTicketDetail ticketId={openTicketId} onBack={() => setOpenTicketId(null)} />
      ) : staffView === "dashboard" ? (
        <StaffDashboard
          onOpenTicket={setOpenTicketId}
          onOpenQueue={openQueue}
          onOpenUsers={isAdmin ? openUsers : undefined}
        />
      ) : staffView === "queue" ? (
        <StaffTicketQueue
          onOpenTicket={setOpenTicketId}
          initialFilters={queueFilters}
          filterToken={queueFilterToken}
        />
      ) : staffView === "users" ? (
        <UserManagement
          onSelfDeactivated={() => void signOut()}
          initialFilters={usersFilters}
          filterToken={usersFilterToken}
        />
      ) : (
        // Defensive: no nav item can reach an unrecognized StaffView, but a
        // future destination added without a matching branch here should
        // fail safe (ui-spec.md §2 line 61) rather than render nothing.
        <NotFound onGoToDashboard={() => setStaffView("dashboard")} />
      )}
    </AppShell>
  );
}
