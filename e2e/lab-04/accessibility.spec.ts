import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  ACCOUNTS,
  LAB4_VIEWPORT_LIST,
  addAction,
  claimTicket,
  confirmStatusChange,
  createTicketAs,
  expectFocusRing,
  logOut,
  metricCard,
  openResolveDialog,
  openSessionAs,
  openStatusDialog,
  openTicketFromQueue,
  signIn,
  uniqueText,
  workflowSection,
} from "./helpers.js";

// Lab 4 accessibility pass (docs/lab-04/tests.md AX-01): axe scan +
// keyboard-only walkthrough of dashboards, Actions Taken, and the workflow
// dialogs. Covers AC-35. Actions Taken's own keyboard operability (Add,
// Edit, Complete, Cancel) is already exercised end-to-end at the component
// level in client/tests/lab-04/ActionsTaken.test.tsx ("Keyboard-only
// operation"); this file focuses on the e2e-only surfaces — dashboards and
// the ticket workflow dialogs — plus the automated axe sweep across every
// Lab 4 screen at the three required widths.

/** Presses Tab until `target` is focused, failing if it is not reached. */
async function tabTo(page: Page, target: Locator, description: string, max = 40) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target, `${description} is reachable by Tab`).toBeFocused();
}

async function expectNoSeriousViolations(page: Page, screen: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} — ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ")}`,
    );
  expect(serious, `axe violations on ${screen}`).toEqual([]);
}

// ---------------------------------------------------------------------------
// Keyboard-only walkthrough
// ---------------------------------------------------------------------------

test("AX-01 — Requester and Staff dashboards are reachable and operable by keyboard", async ({ page }) => {
  await createTicketAs(ACCOUNTS.requesterA.email, "AX-01 requester dashboard keyboard");
  await signIn(page, ACCOUNTS.requesterA.email);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/welcome/i);

  const openTicketsCard = metricCard(page, "My Open Tickets");
  await tabTo(page, openTicketsCard, "My Open Tickets metric card");
  await expectFocusRing(openTicketsCard, "My Open Tickets metric card");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /my tickets/i })).toBeVisible();
  await logOut(page);

  await createTicketAs(ACCOUNTS.requesterB.email, "AX-01 staff dashboard keyboard", "URGENT");
  await signIn(page, ACCOUNTS.staff1.email);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/welcome back/i);

  const newCard = metricCard(page, "New");
  await tabTo(page, newCard, "New metric card");
  await expectFocusRing(newCard, "New metric card");

  // Tab onward into "At a glance": priority chips are real buttons, reachable
  // and operable the same way (ui-spec.md §3.2).
  const glance = page.getByRole("region", { name: /^at a glance$/i });
  const urgentChip = glance.getByRole("button", { name: /^▲▲ urgent: /i });
  await tabTo(page, urgentChip, "By priority: Urgent chip");
  await expectFocusRing(urgentChip, "By priority: Urgent chip");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("queue-rows")).toBeVisible();
});

test("AX-01 — the ticket workflow status dialog and Resolve gate checklist are reachable and operable by keyboard", async ({
  page,
}) => {
  const ticket = await createTicketAs(ACCOUNTS.requesterA.email, "AX-01 workflow keyboard");
  await signIn(page, ACCOUNTS.staff1.email);
  await openTicketFromQueue(page, ticket);
  await claimTicket(page);

  const workflow = workflowSection(page);
  const statusSelect = workflow.getByLabel("Change status to", { exact: true });
  await tabTo(page, statusSelect, "Change status select");
  await expectFocusRing(statusSelect, "Change status select");
  await statusSelect.selectOption({ label: "In Progress" });
  const update = workflow.getByRole("button", { name: /^update status$/i });
  await tabTo(page, update, "Update Status");
  await expectFocusRing(update, "Update Status");
  await page.keyboard.press("Enter");

  const confirmDialog = page.getByRole("dialog", { name: /^change status to in progress$/i });
  await expect(confirmDialog).toBeVisible();
  const confirmButton = confirmDialog.getByRole("button", { name: /^update status$/i });
  await tabTo(page, confirmButton, "Update Status (confirm)");
  await expectFocusRing(confirmButton, "Update Status (confirm)");
  await page.keyboard.press("Enter");
  await expect(confirmDialog).toHaveCount(0);
  await expect(workflow).toContainText("Status: In Progress");

  // A Planned action keeps the gate failing, so the checklist below shows a
  // mix of passed/failed rows — real content for the keyboard/axe pass.
  await addAction(page, {
    description: uniqueText("AX-01 pending diagnostic"),
    status: "Planned",
    performedByName: "IT Staff 1",
  });

  const statusSelect2 = workflow.getByLabel("Change status to", { exact: true });
  await statusSelect2.focus();
  await statusSelect2.selectOption({ label: "Resolved" });
  const update2 = workflow.getByRole("button", { name: /^update status$/i });
  await update2.focus();
  await page.keyboard.press("Enter");

  const resolveDialog = page.getByRole("dialog", { name: /^resolve ticket/i });
  await expect(resolveDialog).toBeVisible();
  const checklist = resolveDialog.getByTestId("resolution-gate-checklist");
  // Every row is conveyed by text, not color alone (ui-spec.md §9).
  await expect(checklist).toContainText("Has owner");
  await expect(checklist).toContainText("≥ 1 completed action");
  await expect(checklist).toContainText("No planned actions");

  const summary = resolveDialog.getByLabel(/^resolution summary/i);
  await tabTo(page, summary, "Resolution summary");
  await expectFocusRing(summary, "Resolution summary");
  await page.keyboard.type("Reachable by keyboard, gate still failing.");
  // The gate is not satisfied yet (a Planned action remains), so Confirm
  // stays disabled even with the summary filled in — a disabled button isn't
  // focusable, so Tab skips straight past it to Cancel below.
  const confirmResolve = resolveDialog.getByRole("button", { name: /^confirm resolve$/i });
  await expect(confirmResolve).toBeDisabled();
  const cancel = resolveDialog.getByRole("button", { name: /^cancel$/i });
  await tabTo(page, cancel, "Cancel");
  await expectFocusRing(cancel, "Cancel");
  await page.keyboard.press("Enter");
  await expect(resolveDialog).toHaveCount(0);
});

test("AX-01 — Cancel Ticket and Reopen dialogs are reachable and operable by keyboard", async ({
  page,
  browser,
}) => {
  const cancelTicket = await createTicketAs(ACCOUNTS.requesterA.email, "AX-01 cancel keyboard");
  await signIn(page, ACCOUNTS.staff1.email);
  await openTicketFromQueue(page, cancelTicket);
  const workflow = workflowSection(page);
  const statusSelect = workflow.getByLabel("Change status to", { exact: true });
  await statusSelect.focus();
  await statusSelect.selectOption({ label: "Cancelled" });
  const update = workflow.getByRole("button", { name: /^update status$/i });
  await update.focus();
  await page.keyboard.press("Enter");

  const cancelDialog = page.getByRole("dialog", { name: /^cancel ticket$/i });
  await expect(cancelDialog).toBeVisible();
  const reason = cancelDialog.getByLabel(/^reason/i);
  await tabTo(page, reason, "Cancel reason");
  await expectFocusRing(reason, "Cancel reason");
  await page.keyboard.type("AX-01 keyboard cancel reason.");
  const confirmCancel = cancelDialog.getByRole("button", { name: /^cancel ticket$/i });
  await tabTo(page, confirmCancel, "Cancel Ticket (confirm)");
  await expectFocusRing(confirmCancel, "Cancel Ticket (confirm)");
  await page.keyboard.press("Enter");
  await expect(cancelDialog).toHaveCount(0);
  await expect(workflow).toContainText("Status: Cancelled");

  // Reopen: staff resolves a second ticket, then the owning Requester reopens
  // it by keyboard.
  const reopenTicketFixture = await createTicketAs(ACCOUNTS.requesterB.email, "AX-01 reopen keyboard");
  await openTicketFromQueue(page, reopenTicketFixture);
  await claimTicket(page);
  await openStatusDialog(page, "In Progress");
  await confirmStatusChange(page, "In Progress");
  // The resolution gate needs a completed action (BR-20) before Resolve is
  // enabled at all.
  await addAction(page, {
    description: uniqueText("AX-01 reopen fixture action"),
    status: "Completed",
    result: "Done for the AX-01 reopen check.",
    performedByName: "IT Staff 1",
  });
  const resolveDialog = await openResolveDialog(page);
  await resolveDialog.getByLabel(/^resolution summary/i).fill("Resolved for the AX-01 reopen check.");
  await resolveDialog.getByRole("button", { name: /^confirm resolve$/i }).click();
  await expect(resolveDialog).toHaveCount(0);

  const { context: requesterContext, page: requesterPage } = await openSessionAs(
    browser,
    ACCOUNTS.requesterB.email,
  );
  await requesterPage
    .getByRole("button", { name: new RegExp(reopenTicketFixture.ticketNumber) })
    .first()
    .click();
  await expect(requesterPage.getByTestId("detail-ticket-number")).toHaveText(
    reopenTicketFixture.ticketNumber,
  );
  const requesterWorkflow = workflowSection(requesterPage);
  const reopenButton = requesterWorkflow.getByRole("button", { name: /^reopen$/i });
  await tabTo(requesterPage, reopenButton, "Reopen");
  await expectFocusRing(reopenButton, "Reopen");
  await requesterPage.keyboard.press("Enter");

  const reopenDialog = requesterPage.getByRole("dialog", { name: /^reopen ticket$/i });
  await expect(reopenDialog).toBeVisible();
  const reopenReason = reopenDialog.getByLabel(/^reason/i);
  await tabTo(requesterPage, reopenReason, "Reopen reason");
  await expectFocusRing(reopenReason, "Reopen reason");
  await requesterPage.keyboard.type("AX-01 keyboard reopen reason.");
  const confirmReopen = reopenDialog.getByRole("button", { name: /^reopen ticket$/i });
  await tabTo(requesterPage, confirmReopen, "Reopen Ticket (confirm)");
  await expectFocusRing(confirmReopen, "Reopen Ticket (confirm)");
  await requesterPage.keyboard.press("Enter");
  await expect(reopenDialog).toHaveCount(0);
  await expect(requesterWorkflow).toContainText("Status: Reopened");
  await requesterContext.close();
});

// ---------------------------------------------------------------------------
// Automated axe scan across every Lab 4 screen at 375 / 768 / 1280px
// ---------------------------------------------------------------------------

for (const [name, viewport] of LAB4_VIEWPORT_LIST) {
  test(`AX-01 — no serious or critical axe violations on Lab 4 screens at ${name} (${viewport.width}px)`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    try {
      await createTicketAs(ACCOUNTS.requesterA.email, `AX-01 axe ${name}`);
      await signIn(page, ACCOUNTS.requesterA.email);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/welcome/i);
      await expectNoSeriousViolations(page, "Requester Dashboard");
      await logOut(page);

      const ticket = await createTicketAs(ACCOUNTS.requesterB.email, `AX-01 axe workflow ${name}`);
      await signIn(page, ACCOUNTS.staff1.email);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/welcome back/i);
      await expectNoSeriousViolations(page, "IT Staff Dashboard");

      await openTicketFromQueue(page, ticket);
      await claimTicket(page);
      await expectNoSeriousViolations(page, "Staff Ticket Detail with Actions Taken");

      const section = page.locator("#actions-taken-section");
      await section.getByRole("button", { name: /^\+ add action$/i }).click();
      await expect(section.getByRole("form", { name: /^add action$/i })).toBeVisible();
      await expectNoSeriousViolations(page, "Actions Taken — Add Action form");
      await section.getByRole("form", { name: /^add action$/i }).getByRole("button", { name: /^cancel$/i }).click();

      await openStatusDialog(page, "In Progress");
      await expect(page.getByRole("dialog", { name: /^change status to in progress$/i })).toBeVisible();
      await expectNoSeriousViolations(page, "Ticket Workflow — status change dialog");
      await confirmStatusChange(page, "In Progress");

      const resolveDialog = await openResolveDialog(page);
      await expectNoSeriousViolations(page, "Ticket Workflow — Resolve dialog (gate failing)");
      await resolveDialog.getByRole("button", { name: /^cancel$/i }).click();
      await logOut(page);

      await signIn(page, ACCOUNTS.admin.email);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/welcome back/i);
      await expectNoSeriousViolations(page, "Administrator Dashboard");
    } finally {
      await context.close();
    }
  });
}
