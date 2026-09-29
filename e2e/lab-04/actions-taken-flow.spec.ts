import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  ACCOUNTS,
  LAB4_VIEWPORT_LIST,
  addAction,
  apiSession,
  cancelAction,
  claimTicket,
  completeAction,
  confirmStatusChange,
  createTicketAs,
  editAction,
  expectNoHorizontalScroll,
  logOut,
  openSessionAs,
  openStatusDialog,
  openTicketFromQueue,
  resolveTicket,
  signIn,
  uniqueText,
  watchConsoleErrors,
  type FixtureTicket,
} from "./helpers.js";

// Lab 4 Actions Taken flow (docs/lab-04/tests.md E-01): two different IT
// Staff add/edit/complete/cancel actions on one ticket, a double-submit
// attempt is idempotent, and a Closed ticket locks the section.
// Covers AC-01, AC-03, AC-11, AC-13, AC-14, AC-32, AC-36.

test("full Actions Taken lifecycle across two IT Staff, with idempotent double-submit and a Closed-ticket lock (AC-01, AC-03, AC-11, AC-13, AC-14, AC-32, AC-36)", async ({
  page,
  browser,
}) => {
  const consoleGuard = watchConsoleErrors(page);
  const ticket: FixtureTicket = await createTicketAs(ACCOUNTS.requesterA.email, "Actions Taken flow");

  // --- Staff 1: claim, then add a Planned action (AC-01) ---------------------
  await signIn(page, ACCOUNTS.staff1.email);
  await openTicketFromQueue(page, ticket);
  await claimTicket(page);

  const plannedDescription = uniqueText("Diagnose printer jam");
  await addAction(page, {
    description: plannedDescription,
    status: "Planned",
    performedByName: "IT Staff 1",
  });
  await expect(page.getByTestId("actions-taken-table")).toContainText(plannedDescription);
  await expect(page.getByTestId("actions-taken-table")).toContainText("IT Staff 1 (owner)");

  // --- AC-11 / AC-32 — a repeated clientRequestId is idempotent --------------
  // The UI regenerates its clientRequestId only after a successful submit, so
  // the contract itself is exercised directly against the running API: this
  // is the same double-submit a slow network would produce from one real
  // click, reaching the same server the browser just used.
  const staff1Api = await apiSession(ACCOUNTS.staff1.email);
  const clientRequestId = randomUUID();
  const doubleSubmitDescription = uniqueText("Reseat network cable");
  const body = {
    clientRequestId,
    actionAt: new Date().toISOString(),
    description: doubleSubmitDescription,
    status: "Planned",
    performedById: (await (await staff1Api.get("/api/auth/me")).json()).data.id,
  };
  const first = await staff1Api.post(`/api/tickets/${ticket.id}/actions`, { data: body });
  expect(first.status(), "first create").toBe(201);
  const firstId = (await first.json()).data.id;
  const second = await staff1Api.post(`/api/tickets/${ticket.id}/actions`, { data: body });
  expect(second.status(), "repeated clientRequestId").toBe(200);
  expect((await second.json()).data.id, "repeated call returns the same record").toBe(firstId);
  const list = await (await staff1Api.get(`/api/tickets/${ticket.id}/actions`)).json();
  expect(
    list.items.filter((a: { description: string }) => a.description === doubleSubmitDescription).length,
    "exactly one record for the double-submitted action",
  ).toBe(1);
  await staff1Api.dispose();
  await openTicketFromQueue(page, ticket);
  await expect(page.getByTestId("actions-taken-table")).toContainText(doubleSubmitDescription);

  // --- Edit (staff1's own action) ---------------------------------------------
  const editedDescription = `${plannedDescription} — narrowed to the tray sensor`;
  await editAction(page, plannedDescription, { description: editedDescription });
  await expect(page.getByTestId("actions-taken-table")).toContainText(editedDescription);

  // --- Staff 2 signs in independently and adds their own action (AC-14) ------
  const { context: staff2Context, page: staff2Page } = await openSessionAs(browser, ACCOUNTS.staff2.email);
  await openTicketFromQueue(staff2Page, ticket);
  const staff2Description = uniqueText("Replace toner cartridge");
  await addAction(staff2Page, {
    description: staff2Description,
    status: "Completed",
    result: "New cartridge installed; test page printed cleanly.",
    performedByName: "IT Staff 2",
  });
  await expect(staff2Page.getByTestId("actions-taken-table")).toContainText(staff2Description);
  // Staff 2 is not the ticket owner, so no "(owner)" suffix on their row.
  const staff2Row = staff2Page
    .locator('[data-testid="action-row"]')
    .filter({ hasText: staff2Description });
  await expect(staff2Row).toContainText("IT Staff 2");
  await expect(staff2Row).not.toContainText("IT Staff 2 (owner)");

  // Both staff members' rows are visible to each other (AC-14: correct
  // "Performed by" per row, in stable order).
  await openTicketFromQueue(page, ticket);
  const table = page.getByTestId("actions-taken-table");
  await expect(table).toContainText(editedDescription);
  await expect(table).toContainText("IT Staff 1 (owner)");
  await expect(table).toContainText(staff2Description);
  await expect(table).toContainText("IT Staff 2");

  // --- Complete the Planned action (AC-03) ------------------------------------
  await completeAction(page, editedDescription, "Cleared a jammed roller; printer test passed.");
  const completedRow = page.locator('[data-testid="action-row"]').filter({ hasText: editedDescription });
  await expect(completedRow).toContainText("Completed");

  // --- Cancel the double-submit-fixture action --------------------------------
  await cancelAction(page, doubleSubmitDescription, "Duplicate — superseded by the toner replacement.");
  const cancelledRow = page.locator('[data-testid="action-row"]').filter({ hasText: doubleSubmitDescription });
  await expect(cancelledRow).toContainText("Cancelled");
  // A Cancelled action is read-only: only "View" remains (AC-12).
  await expect(cancelledRow.getByRole("button", { name: /^edit$/i })).toHaveCount(0);
  await expect(cancelledRow.getByRole("button", { name: /^cancel$/i })).toHaveCount(0);
  await expect(cancelledRow.getByRole("button", { name: /^view$/i })).toBeVisible();

  await staff2Context.close();

  // --- Move the ticket to Closed, then verify the section locks (AC-13) ------
  // Matrix path: New (claimed above) → InProgress → Resolved → Closed. Both
  // actions above are Completed/Cancelled, so the resolution gate is already
  // satisfiable once the ticket is InProgress.
  await openStatusDialog(page, "In Progress");
  await confirmStatusChange(page, "In Progress");
  await resolveTicket(page, "Printer jam cleared and toner replaced; verified with a test page.");
  await openStatusDialog(page, "Closed");
  await confirmStatusChange(page, "Closed");
  await expect(page.getByTestId("workflow-status-line")).toContainText("Status: Closed");

  await expect(page.locator("#actions-taken-section")).toContainText("This ticket is closed — actions are read-only.");
  await expect(page.getByRole("button", { name: /^\+ add action$/i })).toHaveCount(0);
  const lockedRow = page.locator('[data-testid="action-row"]').filter({ hasText: staff2Description });
  await expect(lockedRow.getByRole("button", { name: /^edit$/i })).toHaveCount(0);
  await expect(lockedRow.getByRole("button", { name: /^complete$/i })).toHaveCount(0);
  await expect(lockedRow.getByRole("button", { name: /^cancel$/i })).toHaveCount(0);
  await expect(lockedRow.getByRole("button", { name: /^view$/i })).toBeVisible();

  // AC-36 — no browser console errors across the whole flow. Checked before
  // logging out: a session teardown can race an in-flight request into a
  // benign 401 that Chromium logs as a console error but isn't an app bug.
  consoleGuard.assertNone("Actions Taken flow");
  await logOut(page);
});

// ---------------------------------------------------------------------------
// E-04 — the same key screen (Actions Taken on a Ticket Detail) at
// 375 / 768 / 1280px: no horizontal scroll, section usable at every width.
// ---------------------------------------------------------------------------
for (const [name, viewport] of LAB4_VIEWPORT_LIST) {
  test(`Actions Taken layout has no horizontal scroll at ${name} (${viewport.width}px) (AC-34)`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const consoleGuard = watchConsoleErrors(page);
    try {
      const ticket = await createTicketAs(ACCOUNTS.requesterB.email, `Actions Taken ${name} viewport`);
      await signIn(page, ACCOUNTS.staff1.email);
      await openTicketFromQueue(page, ticket);
      await claimTicket(page);
      await addAction(page, {
        description: uniqueText("Viewport check action"),
        status: "Planned",
        performedByName: "IT Staff 1",
      });
      await expectNoHorizontalScroll(page);
      consoleGuard.assertNone(`Actions Taken at ${name}`);
    } finally {
      await context.close();
    }
  });
}
