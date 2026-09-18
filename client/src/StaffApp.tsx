import AppShell from "./AppShell.js";
import StaffTicketQueue from "./StaffTicketQueue.js";

/**
 * IT Staff and Administrator home — the Ticket Queue (ui-spec.md §2.2).
 * User Management (Administrator's other destination) arrives with its own
 * issue.
 */
export default function StaffApp() {
  return (
    <AppShell>
      <StaffTicketQueue />
    </AppShell>
  );
}
