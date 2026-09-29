import { test, expect } from "@playwright/test";
import {
  ACCOUNTS,
  LAB4_VIEWPORTS,
  apiSession,
  createTicketAs,
  expectDrillDownTotal,
  expectNoHorizontalScroll,
  logOut,
  mainNav,
  metricCard,
  metricValue,
  signIn,
  signInAndChangePassword,
  watchConsoleErrors,
} from "./helpers.js";

// Lab 4 dashboards (docs/lab-04/tests.md E-03): role landing on /dashboard,
// metric-card drill-down counts, Requester isolation, and the zero-ticket
// empty state. Covers AC-02, AC-24, AC-25, AC-26, AC-27, AC-30, AC-36.

test("Requester lands on the Dashboard, and a metric card's drill-down matches its count (AC-25, AC-30, AC-36)", async ({
  page,
}) => {
  const consoleGuard = watchConsoleErrors(page);
  await signIn(page, ACCOUNTS.requesterA.email);

  // AC-30 — after login, the Requester lands on the Dashboard, marked active.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/welcome/i);
  await expect(mainNav(page).getByRole("button", { name: "Dashboard" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // AC-25 — the "My Open Tickets" card's drill-down list total matches its count.
  const value = await metricValue(page, "My Open Tickets");
  await metricCard(page, "My Open Tickets").click();
  await expect(page.getByRole("heading", { name: /my tickets/i })).toBeVisible();
  await expectDrillDownTotal(page, value);

  consoleGuard.assertNone("Requester dashboard drill-down");
  await logOut(page);
});

test("Requester dashboards never show another Requester's tickets (AC-02)", async ({ browser }) => {
  const ticketA = await createTicketAs(ACCOUNTS.requesterA.email, "Isolation check A");
  const ticketB = await createTicketAs(ACCOUNTS.requesterB.email, "Isolation check B");

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  const guardA = watchConsoleErrors(pageA);
  await signIn(pageA, ACCOUNTS.requesterA.email);
  await expect(pageA.getByText(ticketB.ticketNumber)).toHaveCount(0);
  guardA.assertNone("Requester A dashboard");
  await contextA.close();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const guardB = watchConsoleErrors(pageB);
  await signIn(pageB, ACCOUNTS.requesterB.email);
  await expect(pageB.getByText(ticketA.ticketNumber)).toHaveCount(0);
  guardB.assertNone("Requester B dashboard");
  await contextB.close();
});

test("a Requester with no tickets sees a zero-count empty state with Create Ticket (AC-26)", async ({
  page,
}) => {
  // Requester E is seeded with zero tickets (server/prisma/seedTickets.ts),
  // and no other Lab 4 E2E fixture touches this account. It's also seeded
  // with mustChangePassword: true, so this signs in through that mandatory
  // screen first; global setup resets the password on the next run.
  //
  // signInAndChangePassword may probe the seeded password first and fall
  // back to the already-changed one if another spec in this run already
  // completed this account's mandatory change — that probe's expected 401
  // isn't a dashboard bug, so the console guard starts only once signed in.
  await signInAndChangePassword(page, ACCOUNTS.requesterE.email);
  const consoleGuard = watchConsoleErrors(page);

  for (const label of ["My Open Tickets", "Waiting for You", "In Progress", "Resolved", "Closed"]) {
    await expect(metricCard(page, label)).toHaveAttribute("aria-label", `${label}: 0, view all`);
  }
  const empty = page.getByTestId("empty-state");
  await expect(empty).toBeVisible();
  await expect(empty).toContainText(/haven't submitted any tickets yet/i);

  // The CTA leads to Create Ticket, without actually submitting one — this
  // account must stay at zero tickets for the next E2E run.
  await empty.getByRole("button", { name: /create ticket/i }).click();
  await expect(page.getByRole("form", { name: /create ticket/i })).toBeVisible();

  consoleGuard.assertNone("Requester empty-state dashboard");
  await logOut(page);
});

test("IT Staff lands on the Dashboard, and a metric card's drill-down matches its count (AC-24, AC-25, AC-30)", async ({
  page,
}) => {
  const consoleGuard = watchConsoleErrors(page);
  await signIn(page, ACCOUNTS.staff1.email);

  await expect(page.getByRole("heading", { level: 1 })).toContainText(/welcome back/i);
  await expect(mainNav(page).getByRole("button", { name: "Dashboard" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  const value = await metricValue(page, "New");
  await metricCard(page, "New").click();
  await expect(page.getByRole("heading", { name: /ticket queue/i })).toBeVisible();
  await expectDrillDownTotal(page, value);

  consoleGuard.assertNone("Staff dashboard drill-down");
  await logOut(page);
});

test("Administrator lands on the Dashboard, marked active (AC-30)", async ({ page }) => {
  const consoleGuard = watchConsoleErrors(page);
  await signIn(page, ACCOUNTS.admin.email);

  await expect(page.getByRole("heading", { level: 1 })).toContainText(/welcome back/i);
  await expect(mainNav(page).getByRole("button", { name: "Dashboard" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("region", { name: "Users" })).toBeVisible();

  consoleGuard.assertNone("Admin dashboard");
  await logOut(page);
});

test("a Requester is forbidden from the staff/admin dashboard APIs (AC-27)", async () => {
  const api = await apiSession(ACCOUNTS.requesterA.email);
  const staffRes = await api.get("/api/dashboard/staff");
  expect(staffRes.status(), "Requester GET /api/dashboard/staff").toBe(403);
  const adminRes = await api.get("/api/dashboard/admin");
  expect(adminRes.status(), "Requester GET /api/dashboard/admin").toBe(403);
  await api.dispose();
});

// ---------------------------------------------------------------------------
// E-04 — Requester and Staff dashboards at 375 / 768 / 1280px: no horizontal
// scroll at any width.
// ---------------------------------------------------------------------------
const KEY_SCREENS = [
  { role: "Requester", email: ACCOUNTS.requesterA.email },
  { role: "IT Staff", email: ACCOUNTS.staff1.email },
] as const;

for (const screen of KEY_SCREENS) {
  for (const [name, viewport] of Object.entries(LAB4_VIEWPORTS)) {
    test(`${screen.role} dashboard has no horizontal scroll at ${name} (${viewport.width}px) (AC-34)`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const consoleGuard = watchConsoleErrors(page);
      try {
        await signIn(page, screen.email);
        await expect(page.getByRole("heading", { level: 1 })).toContainText(/welcome/i);
        await expectNoHorizontalScroll(page);
        consoleGuard.assertNone(`${screen.role} dashboard at ${name}`);
      } finally {
        await context.close();
      }
    });
  }
}
