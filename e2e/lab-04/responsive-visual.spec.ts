import { test, expect } from "@playwright/test";
import {
  ACCOUNTS,
  LAB4_VIEWPORT_LIST,
  actionRow,
  addAction,
  apiSession,
  capture,
  claimTicket,
  createTicketAs,
  expectNoHorizontalScroll,
  expectNoOverlap,
  expectNotClipped,
  expectTouchFriendly,
  metricCard,
  openTicketFromQueue,
  signIn,
  signInAndChangePassword,
  uniqueText,
  watchConsoleErrors,
} from "./helpers.js";

// Lab 4 responsive/visual pass (docs/lab-04/tests.md RS-01): no horizontal
// page scroll, no clipped or overlapping controls, and the required
// screenshot evidence at 375 / 768 / 1280px for every major Lab 4 screen.
// AC-34's no-horizontal-scroll assertion is already covered per screen in
// actions-taken-flow.spec.ts and ticket-resolution.spec.ts's E-04 passes;
// this file adds clipping/overlap checks and the screenshot capture that
// ui-spec.md §11 requires, without re-testing what those already cover.

for (const [name, viewport] of LAB4_VIEWPORT_LIST) {
  test(`RS-01 — Requester Dashboard is not clipped or overlapping at ${name} (${viewport.width}px)`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const consoleGuard = watchConsoleErrors(page);
    try {
      await createTicketAs(ACCOUNTS.requesterA.email, `RS-01 requester dashboard ${name}`);
      await signIn(page, ACCOUNTS.requesterA.email);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/welcome/i);

      const openTicketsCard = metricCard(page, "My Open Tickets");
      const attention = page.getByRole("region", { name: /^needs your attention$/i });
      const recent = page.getByRole("region", { name: /^my recent tickets$/i });
      const quickActions = page.getByRole("region", { name: /^quick actions$/i });
      await expectNotClipped(openTicketsCard, "My Open Tickets metric card");
      await expectNotClipped(recent, "My Recent Tickets list");
      await expectNotClipped(quickActions, "Quick Actions");
      await expectTouchFriendly(openTicketsCard, "My Open Tickets metric card");
      await expectNoOverlap([
        { locator: openTicketsCard, name: "My Open Tickets card" },
        { locator: metricCard(page, "Waiting for You"), name: "Waiting for You card" },
      ]);
      await expectNoOverlap([
        { locator: attention, name: "Needs your attention" },
        { locator: recent, name: "My Recent Tickets" },
        { locator: quickActions, name: "Quick Actions" },
      ]);
      await expectNoHorizontalScroll(page);
      await capture(page, "requester-dashboard", "populated", name);
      consoleGuard.assertNone(`Requester Dashboard at ${name}`);
    } finally {
      await context.close();
    }
  });

  test(`RS-01 — Requester Dashboard empty state at ${name} (${viewport.width}px)`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    try {
      // Requester E is seeded with zero tickets and no other Lab 4 fixture
      // touches it (server/prisma/seedTickets.ts) — see dashboards.spec.ts.
      //
      // signInAndChangePassword may probe the seeded password first and fall
      // back to the already-changed one if another spec in this run already
      // completed this account's mandatory change — that probe's expected
      // 401 isn't a dashboard bug, so the console guard starts only once
      // signed in (see dashboards.spec.ts's AC-26 test for the same fix).
      await signInAndChangePassword(page, ACCOUNTS.requesterE.email);
      const consoleGuard = watchConsoleErrors(page);
      const empty = page.getByTestId("empty-state");
      await expect(empty).toBeVisible();
      await expectNotClipped(empty, "Requester empty state");
      await expectTouchFriendly(
        empty.getByRole("button", { name: /create ticket/i }),
        "empty-state Create Ticket button",
      );
      await expectNoHorizontalScroll(page);
      await capture(page, "requester-dashboard", "empty", name);
      consoleGuard.assertNone(`Requester Dashboard empty state at ${name}`);
    } finally {
      await context.close();
    }
  });

  test(`RS-01 — IT Staff Dashboard is not clipped or overlapping at ${name} (${viewport.width}px)`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const consoleGuard = watchConsoleErrors(page);
    try {
      await createTicketAs(ACCOUNTS.requesterB.email, `RS-01 staff dashboard ${name}`, "URGENT");
      await signIn(page, ACCOUNTS.staff1.email);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/welcome back/i);

      const newCard = metricCard(page, "New");
      const urgent = page.getByRole("region", { name: /^urgent tickets$/i });
      const recent = page.getByRole("region", { name: /^recent tickets$/i });
      const quickActions = page.getByRole("region", { name: /^quick actions$/i });
      const glance = page.getByRole("region", { name: /^at a glance$/i });
      await expectNotClipped(newCard, "New metric card");
      await expectNotClipped(urgent, "Urgent Tickets list");
      await expectNotClipped(glance, "At a glance panel");
      await expectTouchFriendly(newCard, "New metric card");
      await expectNoOverlap([
        { locator: newCard, name: "New card" },
        { locator: metricCard(page, "Open"), name: "Open card" },
      ]);
      await expectNoOverlap([
        { locator: urgent, name: "Urgent Tickets" },
        { locator: recent, name: "Recent Tickets" },
        { locator: quickActions, name: "Quick Actions" },
        { locator: glance, name: "At a glance" },
      ]);
      await expectNoHorizontalScroll(page);
      await capture(page, "staff-dashboard", "populated", name);
      consoleGuard.assertNone(`IT Staff Dashboard at ${name}`);
    } finally {
      await context.close();
    }
  });

  test(`RS-01 — Administrator Dashboard is not clipped or overlapping at ${name} (${viewport.width}px)`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const consoleGuard = watchConsoleErrors(page);
    try {
      await signIn(page, ACCOUNTS.admin.email);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/welcome back/i);

      const users = page.getByRole("region", { name: /^users$/i });
      await expectNotClipped(users, "Admin Users card");
      await expectNoHorizontalScroll(page);
      await capture(page, "staff-dashboard", "admin", name);
      consoleGuard.assertNone(`Administrator Dashboard at ${name}`);
    } finally {
      await context.close();
    }
  });

  test(`RS-01 — Actions Taken list, create and edit are not clipped or overlapping at ${name} (${viewport.width}px)`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const consoleGuard = watchConsoleErrors(page);
    try {
      const ticket = await createTicketAs(ACCOUNTS.requesterB.email, `RS-01 actions taken ${name}`);
      await signIn(page, ACCOUNTS.staff1.email);
      await openTicketFromQueue(page, ticket);
      await claimTicket(page);

      const section = page.locator("#actions-taken-section");
      await expectNotClipped(section, "Actions Taken section (empty)");
      await capture(page, "actions-taken", "empty", name);

      const description = uniqueText("RS-01 diagnose slow login");
      await addAction(page, {
        description,
        status: "Planned",
        performedByName: "IT Staff 1",
      });
      await expectNotClipped(section, "Actions Taken section (list)");
      await expectNoHorizontalScroll(page);
      await capture(page, "actions-taken", "list", name);

      await section.getByRole("button", { name: /^\+ add action$/i }).click();
      const createForm = section.getByRole("form", { name: /^add action$/i });
      await expectNotClipped(createForm, "Add Action form");
      await expectTouchFriendly(
        createForm.getByRole("button", { name: /^save action$/i }),
        "Save Action button",
      );
      await expectNoHorizontalScroll(page);
      await capture(page, "actions-taken", "create", name);
      await createForm.getByRole("button", { name: /^cancel$/i }).click();

      await actionRow(page, description).getByRole("button", { name: /^edit$/i }).click();
      const editForm = section.getByRole("form", { name: /^edit action$/i });
      await expectNotClipped(editForm, "Edit Action form");
      await expectNoHorizontalScroll(page);
      await capture(page, "actions-taken", "edit", name);
      await editForm.getByRole("button", { name: /^save changes$/i }).click();
      await expect(editForm).not.toBeVisible();

      consoleGuard.assertNone(`Actions Taken at ${name}`);
    } finally {
      await context.close();
    }
  });

  test(`RS-01 — Actions Taken complete, cancel and 409 dialogs are not clipped at ${name} (${viewport.width}px)`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const consoleGuard = watchConsoleErrors(page);
    try {
      const ticket = await createTicketAs(ACCOUNTS.requesterB.email, `RS-01 actions taken dialogs ${name}`);
      await signIn(page, ACCOUNTS.staff1.email);
      await openTicketFromQueue(page, ticket);
      await claimTicket(page);
      const section = page.locator("#actions-taken-section");

      const completeDescription = uniqueText("RS-01 replace toner");
      await addAction(page, {
        description: completeDescription,
        status: "Planned",
        performedByName: "IT Staff 1",
      });
      await actionRow(page, completeDescription).getByRole("button", { name: /^complete$/i }).click();
      const completeDialog = page.getByRole("dialog", { name: /^complete action$/i });
      await expectNotClipped(completeDialog, "Complete Action dialog");
      await expectNoHorizontalScroll(page);
      await capture(page, "actions-taken", "complete-dialog", name);
      await completeDialog.getByRole("button", { name: /^cancel$/i }).click();

      const cancelDescription = uniqueText("RS-01 reseat cable");
      await addAction(page, {
        description: cancelDescription,
        status: "Planned",
        performedByName: "IT Staff 1",
      });
      await actionRow(page, cancelDescription).getByRole("button", { name: /^cancel$/i }).click();
      const cancelDialog = page.getByRole("dialog", { name: /^cancel action$/i });
      await expectNotClipped(cancelDialog, "Cancel Action dialog");
      await expectNoHorizontalScroll(page);
      await capture(page, "actions-taken", "cancel-dialog", name);
      await cancelDialog.getByRole("button", { name: /^keep action$/i }).click();

      // 409 STALE_UPDATE — open Edit, then let another session change the
      // same action first so the UI's held version is stale on submit.
      const staleDescription = uniqueText("RS-01 stale conflict source");
      await addAction(page, {
        description: staleDescription,
        status: "Planned",
        performedByName: "IT Staff 1",
      });
      await actionRow(page, staleDescription).getByRole("button", { name: /^edit$/i }).click();
      const editForm = section.getByRole("form", { name: /^edit action$/i });
      await editForm.getByLabel(/^description/i).fill(`${staleDescription} — my local edit`);

      const staff2Api = await apiSession(ACCOUNTS.staff2.email);
      const list = await (await staff2Api.get(`/api/tickets/${ticket.id}/actions`)).json();
      const action = list.items.find((a: { description: string }) => a.description === staleDescription);
      await staff2Api.patch(`/api/tickets/${ticket.id}/actions/${action.id}`, {
        data: { description: `${staleDescription} — changed by IT Staff 2`, version: action.version },
      });
      await staff2Api.dispose();

      await editForm.getByRole("button", { name: /^save changes$/i }).click();
      const staleDialog = page.getByRole("dialog", { name: /^action changed by someone else$/i });
      await expect(staleDialog).toBeVisible();
      await expectNotClipped(staleDialog, "Stale-conflict dialog");
      await expectNoHorizontalScroll(page);
      await capture(page, "actions-taken", "409-conflict", name);
      await staleDialog.getByRole("button", { name: /^reload latest$/i }).click();

      consoleGuard.assertNone(`Actions Taken dialogs at ${name}`);
    } finally {
      await context.close();
    }
  });
}
