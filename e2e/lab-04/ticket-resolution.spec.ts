import { test, expect } from "@playwright/test";
import {
  ACCOUNTS,
  LAB4_VIEWPORT_LIST,
  addAction,
  apiSession,
  claimTicket,
  completeAction,
  confirmStatusChange,
  createTicketAs,
  expectNoHorizontalScroll,
  indicateProblemResolved,
  logOut,
  openResolveDialog,
  openSessionAs,
  openStatusDialog,
  openHistoryTab,
  openTicketFromQueue,
  reopenTicket,
  resolveTicket,
  signIn,
  statusHistoryList,
  statusLine,
  uniqueText,
  watchConsoleErrors,
} from "./helpers.js";

// Lab 4 ticket resolution flow (docs/lab-04/tests.md E-02): gate blocks a
// premature Resolve, completing the pending action clears it, the Requester
// can indicate the problem appears resolved and later Reopen, and Closed is
// a true dead end. Covers AC-16, AC-18, AC-19, AC-20, AC-23, AC-36.

test("resolution gate blocks a premature Resolve, then the full lifecycle completes with history recorded (AC-16, AC-18, AC-19, AC-20, AC-23, AC-36)", async ({
  page,
  browser,
}) => {
  const consoleGuard = watchConsoleErrors(page);
  const ticket = await createTicketAs(ACCOUNTS.requesterB.email, "Resolution lifecycle");

  await signIn(page, ACCOUNTS.staff1.email);
  await openTicketFromQueue(page, ticket);
  await claimTicket(page);
  await openStatusDialog(page, "In Progress");
  await confirmStatusChange(page, "In Progress");
  await expect(statusLine(page)).toContainText("Status: In Progress");

  const pendingDescription = uniqueText("Investigate VPN drop");
  await addAction(page, {
    description: pendingDescription,
    status: "Planned",
    performedByName: "IT Staff 1",
  });

  // --- AC-18 — Resolve is blocked while the gate fails ------------------------
  const gateDialog = await openResolveDialog(page);
  const checklist = gateDialog.getByTestId("resolution-gate-checklist");
  await expect(checklist).toContainText("≥ 1 completed action");
  await expect(checklist).toContainText("No planned actions");
  await expect(gateDialog.getByRole("button", { name: /^confirm resolve$/i })).toBeDisabled();

  // AC-18 also holds when the gate is bypassed via a direct API call.
  const staff1Api = await apiSession(ACCOUNTS.staff1.email);
  const meRes = await staff1Api.get("/api/auth/me");
  const ticketRes = await staff1Api.get(`/api/tickets/${ticket.id}`);
  const ticketBody = await ticketRes.json();
  const directResolve = await staff1Api.post(`/api/tickets/${ticket.id}/status`, {
    data: { toStatus: "Resolved", reason: "Attempting to bypass the UI gate.", version: ticketBody.data.version },
  });
  expect(directResolve.status(), "direct API resolve while gate fails").toBe(422);
  expect((await directResolve.json()).error.code).toBe("RESOLUTION_GATE_FAILED");
  await staff1Api.dispose();
  void meRes;

  await gateDialog.getByRole("button", { name: /^cancel$/i }).click();
  await expect(gateDialog).not.toBeVisible();

  // --- AC-19 — Requester indicates the problem appears resolved --------------
  const { context: requesterContext, page: requesterPage } = await openSessionAs(
    browser,
    ACCOUNTS.requesterB.email,
  );
  await requesterPage.getByRole("button", { name: new RegExp(ticket.ticketNumber) }).first().click();
  await expect(requesterPage.getByTestId("detail-ticket-number")).toHaveText(ticket.ticketNumber);
  await indicateProblemResolved(requesterPage);
  await expect(
    requesterPage.getByRole("button", { name: /^marked as resolved on/i }),
  ).toBeVisible();
  await requesterContext.close();

  // --- Complete the pending action, clearing the gate -------------------------
  await completeAction(page, pendingDescription, "VPN client reinstalled; connection stable for 10 minutes.");

  // --- AC-16 / AC-18 — Resolve now succeeds -----------------------------------
  await resolveTicket(page, "VPN issue traced to a stale client profile; reinstalled and verified.");
  await expect(statusLine(page)).toContainText("Status: Resolved");

  // --- AC-20 — the owning Requester can Reopen a Resolved ticket -------------
  const { context: reopenContext, page: reopenPage } = await openSessionAs(browser, ACCOUNTS.requesterB.email);
  await reopenPage.getByRole("button", { name: new RegExp(ticket.ticketNumber) }).first().click();
  await expect(reopenPage.getByTestId("detail-ticket-number")).toHaveText(ticket.ticketNumber);
  await reopenTicket(reopenPage, "The VPN dropped again after a reboot.");
  await expect(statusLine(reopenPage)).toContainText("Status: Reopened");
  await reopenContext.close();

  // --- Take it through the lifecycle again to a true dead end: Closed --------
  await openTicketFromQueue(page, ticket);
  await openStatusDialog(page, "In Progress");
  await confirmStatusChange(page, "In Progress");
  await resolveTicket(page, "Root cause was an expired certificate; renewed and reconnected successfully.");
  await openStatusDialog(page, "Closed");
  await confirmStatusChange(page, "Closed");
  await expect(statusLine(page)).toContainText("Status: Closed");
  await expect(page.getByText(/no status changes available/i)).toBeVisible();

  // --- AC-23 — History tab lists every transition oldest → newest -----------
  await openHistoryTab(page);
  const historyText = await statusHistoryList(page).innerText();
  const historyLines = historyText.split("\n").filter((l) => l.includes("changed status"));
  const expectedSequence = [
    "New → In Progress",
    "In Progress → Resolved",
    "Resolved → Reopened",
    "Reopened → In Progress",
    "In Progress → Resolved",
    "Resolved → Closed",
  ];
  expect(historyLines.length, "one history row per transition").toBe(expectedSequence.length);
  expectedSequence.forEach((fragment, index) => {
    expect(historyLines[index], `history row ${index}`).toContain(fragment);
  });
  // History is read-only — no edit/delete affordance anywhere in the tab.
  await expect(
    page.getByTestId("status-history-list").getByRole("button"),
  ).toHaveCount(0);

  // AC-36 — no browser console errors across the whole flow. Checked before
  // logging out: a session teardown can race an in-flight request into a
  // benign 401 that Chromium logs as a console error but isn't an app bug.
  consoleGuard.assertNone("ticket resolution flow");
  await logOut(page);
});

// ---------------------------------------------------------------------------
// E-04 — the same key screen (Ticket Workflow status panel) at
// 375 / 768 / 1280px: no horizontal scroll, the Resolve dialog stays usable.
// ---------------------------------------------------------------------------
for (const [name, viewport] of LAB4_VIEWPORT_LIST) {
  test(`Ticket workflow layout has no horizontal scroll at ${name} (${viewport.width}px) (AC-34)`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const consoleGuard = watchConsoleErrors(page);
    try {
      const ticket = await createTicketAs(ACCOUNTS.requesterC.email, `Resolution ${name} viewport`);
      await signIn(page, ACCOUNTS.staff2.email);
      await openTicketFromQueue(page, ticket);
      await claimTicket(page);
      await openStatusDialog(page, "In Progress");
      await confirmStatusChange(page, "In Progress");
      const dialog = await openResolveDialog(page);
      await expect(dialog).toBeVisible();
      await expectNoHorizontalScroll(page);
      await dialog.getByRole("button", { name: /^cancel$/i }).click();
      consoleGuard.assertNone(`Ticket workflow at ${name}`);
    } finally {
      await context.close();
    }
  });
}
