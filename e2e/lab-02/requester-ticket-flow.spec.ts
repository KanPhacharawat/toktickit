import { test, expect } from "@playwright/test";
import {
  VIEWPORTS,
  createTicket,
  expectNoHorizontalScroll,
  gotoCreateTicket,
  gotoMyTickets,
  E2E_LOGIN,
  makePngFile,
  openApp,
  openTicket,
  selectRequester,
  signOut,
  uniqueSummary,
} from "./helpers.js";

// E2E and responsive coverage from docs/lab-02/tests.md:
//   RESP-01  Desktop Create Ticket        (AC-24)
//   RESP-02  Tablet Create Ticket         (AC-24)
//   RESP-03  Mobile Create Ticket         (AC-24)
//   RESP-04  My Tickets responsive        (AC-24)
//   E2E-01   Complete Create Ticket flow  (AC-01, AC-05, AC-06)
//   E2E-02   My Tickets flow              (AC-11, AC-13-17)
//   E2E-03   Ownership flow               (AC-12)
//   E2E-04   Attachment lifecycle         (AC-19-21)
//   E2E-05   Responsive flow              (AC-24)
//   E2E-06   Accessibility smoke test     (AC-25)
//
// These run against the real API and database. Every ticket created here is
// tagged so the E2E cleanup script can identify its own rows. Shared page
// helpers live in ./helpers.ts, which the responsive/visual suite also uses.

const DESKTOP = VIEWPORTS.desktop;
const TABLET = VIEWPORTS.tablet;
const MOBILE = VIEWPORTS.mobile;


// ---------------------------------------------------------------------------
// E2E-01 — Complete Create Ticket flow (AC-01, AC-05, AC-06)
// ---------------------------------------------------------------------------
test("E2E-01 — requester signs in, creates a ticket, sees the official number", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);

  // Lab 3 — identity comes from the login; the Development Requester selector
  // and its testing-only notice are gone (FR-19).
  await openApp(page);
  await expect(page.getByLabel(/development requester/i)).toHaveCount(0);
  await expect(page.getByRole("note")).toHaveCount(0);

  await selectRequester(page, "Requester A");

  const summary = uniqueSummary("create flow");
  const ticketNumber = await createTicket(page, summary);

  // AC-05 — the backend generated the number.
  expect(ticketNumber).toMatch(/^TT-\d{8}-\d{4,}$/);
  // AC-06 — status is New and the date came from the backend.
  await expect(page.getByTestId("created-status")).toHaveText("New");

  await openTicket(page, ticketNumber);
  await expect(page.getByTestId("detail-status")).toHaveText("New");
});

// ---------------------------------------------------------------------------
// E2E-02 — My Tickets flow (AC-11, AC-13–17)
// ---------------------------------------------------------------------------
test("E2E-02 — created ticket appears and search/filter/sort/pagination work", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await selectRequester(page, "Requester A");

  const summary = uniqueSummary("list flow");
  const ticketNumber = await createTicket(page, summary);

  await page
    .getByRole("navigation", { name: /main/i })
    .getByRole("button", { name: /my tickets/i })
    .click();

  // AC-11 — the new ticket is in the requester's own list.
  await expect(page.getByTestId("ticket-rows")).toBeVisible();

  // AC-13 — search by summary.
  await page.getByLabel(/^search$/i).fill(summary);
  await page.getByRole("button", { name: /^search$/i }).click();
  await expect(page.getByTestId("ticket-rows").getByRole("row")).toHaveCount(1);
  await expect(page.getByRole("button", { name: ticketNumber })).toBeVisible();

  // AC-17 — a search with no matches shows the dedicated no-results state.
  await page.getByLabel(/^search$/i).fill("no-such-ticket-anywhere-xyz");
  await page.getByRole("button", { name: /^search$/i }).click();
  await expect(page.getByTestId("no-results-state")).toBeVisible();
  await expect(page.getByTestId("ticket-rows")).toHaveCount(0);

  // Clearing the filters restores the list.
  await page.getByTestId("no-results-state").getByRole("button", { name: /clear filters/i }).click();
  await expect(page.getByTestId("ticket-rows")).toBeVisible();

  // AC-14 / AC-15 / AC-16 — the filter, sort and page-size controls live in
  // the collapsible panel.
  await page.getByRole("button", { name: /^filters/i }).click();

  await page.getByLabel(/requested priority/i).selectOption("MEDIUM");
  await expect(page.getByTestId("ticket-rows")).toBeVisible();

  await page.getByLabel(/sort by/i).selectOption("ticketNumber");
  await page.getByLabel(/^order$/i).selectOption("asc");
  await expect(page.getByTestId("ticket-rows")).toBeVisible();

  await page.getByLabel(/per page/i).selectOption("10");
  await expect(page.getByTestId("page-indicator")).toContainText(/page 1 of/i);
});

// ---------------------------------------------------------------------------
// E2E-03 — Ownership flow (AC-12)
// ---------------------------------------------------------------------------
test("E2E-03 — signing in as another requester hides the first requester's ticket data", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await selectRequester(page, "Requester A");

  const summary = uniqueSummary("ownership flow");
  const ticketNumber = await createTicket(page, summary);

  // The owner can open it before the switch.
  await openTicket(page, ticketNumber);

  // Sign out and sign in as Requester B.
  await signOut(page);
  await selectRequester(page, "Requester B");
  await gotoMyTickets(page);

  // AC-12 — Requester A's ticket is not in Requester B's list.
  await page.getByLabel(/^search$/i).fill(ticketNumber);
  await page.getByRole("button", { name: /^search$/i }).click();
  await expect(page.getByTestId("no-results-state")).toBeVisible();
  await expect(page.getByRole("button", { name: ticketNumber })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// E2E-03b — a cross-requester ticket cannot be reached directly either
// (AC-12, BR-09). Hiding it from the list is not enough: the resource itself
// must refuse another requester.
// ---------------------------------------------------------------------------
test("E2E-03b — another requester's ticket cannot be fetched directly", async ({
  page,
  request,
}) => {
  await page.setViewportSize(DESKTOP);
  await selectRequester(page, "Requester A");

  const summary = uniqueSummary("direct access");
  const ticketNumber = await createTicket(page, summary);

  // Lab 3 — routes are keyed on the session, not a requester id in the path,
  // and another requester's ticket answers 404 exactly like a missing one
  // (BR-09). This `request` fixture is a separate context from `page`'s
  // browser cookies, so it signs in on its own.
  const owner = await request.post("http://localhost:3000/api/auth/login", { data: E2E_LOGIN });
  expect(owner.status()).toBe(200);
  const list = await request.get(`http://localhost:3000/api/tickets/mine?search=${ticketNumber}`);
  const rows = (await list.json()).data as Array<{ id: number }>;
  expect(rows).toHaveLength(1);
  const ticketId = rows[0].id;

  // The owner can read it.
  expect((await request.get(`http://localhost:3000/api/tickets/${ticketId}`)).status()).toBe(200);

  // Another requester cannot — and learns nothing about it.
  await request.post("http://localhost:3000/api/auth/logout");
  const other = await request.post("http://localhost:3000/api/auth/login", {
    data: { email: "requester-b@example.com", password: E2E_LOGIN.password },
  });
  expect(other.status()).toBe(200);
  const asOther = await request.get(`http://localhost:3000/api/tickets/${ticketId}`);
  expect(asOther.status()).toBe(404);
  const body = JSON.stringify(await asOther.json());
  expect(body).not.toContain(ticketNumber);
  expect(body).not.toContain(summary);

  // Their attachment endpoints are closed too (AC-22).
  const attachments = await request.get(
    `http://localhost:3000/api/tickets/${ticketId}/attachments`,
  );
  expect(attachments.status()).toBe(404);
});
// ---------------------------------------------------------------------------
// E2E-04 — Attachment lifecycle (AC-19–21)
// ---------------------------------------------------------------------------
test("E2E-04 — upload, view metadata, soft remove, and blocked download", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await selectRequester(page, "Requester A");

  const summary = uniqueSummary("attachment flow");
  const ticketNumber = await createTicket(page, summary);
  await openTicket(page, ticketNumber);

  // AC-19 — upload a permitted attachment.
  const filePath = await makePngFile("e2e-screenshot.png");
  await page.getByLabel(/add an attachment/i).setInputFiles(filePath);

  const active = page.getByTestId("active-attachment");
  await expect(active).toBeVisible();
  await expect(active.getByTestId("attachment-name")).toHaveText(
    "e2e-screenshot.png",
  );
  await expect(active).toContainText(/PNG image/);

  // The active attachment is downloadable.
  const downloadHref = await active
    .getByRole("link", { name: /download/i })
    .getAttribute("href");
  expect(downloadHref).toBeTruthy();
  const okResponse = await page.request.get(downloadHref!);
  expect(okResponse.status()).toBe(200);
  expect(okResponse.headers()["content-type"]).toContain("image/png");

  // AC-20 — soft removal requires a reason.
  await active.getByRole("button", { name: /^remove/i }).click();
  await page.getByRole("button", { name: /confirm removal/i }).click();
  await expect(page.getByText(/a removal reason is required/i)).toBeVisible();

  await page.getByLabel(/reason for removing/i).fill("Duplicate screenshot");
  await page.getByRole("button", { name: /confirm removal/i }).click();

  // Metadata remains and is marked removed (BR-38).
  const removed = page.getByTestId("removed-attachment");
  await expect(removed).toBeVisible();
  await expect(removed).toContainText(/Duplicate screenshot/);
  await expect(removed.getByText(/^removed$/i)).toBeVisible();

  // AC-21 — no download action is offered...
  await expect(removed.getByRole("link")).toHaveCount(0);
  // ...and the endpoint refuses to serve the content.
  const goneResponse = await page.request.get(downloadHref!);
  expect(goneResponse.status()).toBe(410);
});

// ---------------------------------------------------------------------------
// RESP-01 / RESP-02 / RESP-03 — Create Ticket across viewports (AC-24)
// ---------------------------------------------------------------------------
for (const [id, label, viewport] of [
  ["RESP-01", "desktop", DESKTOP],
  ["RESP-02", "tablet", TABLET],
  ["RESP-03", "mobile", MOBILE],
] as const) {
  test(`${id} — Create Ticket is usable on ${label}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await selectRequester(page, "Requester A");
    await gotoCreateTicket(page);

    // Every control is visible and reachable at this size.
    for (const label of [
      /^category/i,
      /related system/i,
      /ticket summary/i,
      /requested priority/i,
      /^description/i,
    ]) {
      await expect(page.getByLabel(label)).toBeVisible();
    }

    const submit = page
      .getByRole("form", { name: /create ticket/i })
      .getByRole("button", { name: /^create ticket$/i });
    await expect(submit).toBeVisible();

    // Touch-friendly target height.
    const box = await submit.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(38);

    // AC-24 — no horizontal page scrolling at any size.
    await expectNoHorizontalScroll(page);
  });
}

// ---------------------------------------------------------------------------
// RESP-04 — My Tickets across viewports (AC-24)
// ---------------------------------------------------------------------------
test("RESP-04 — My Tickets stays usable across viewport sizes", async ({ page }) => {
  await selectRequester(page, "Requester A");

  for (const viewport of [DESKTOP, TABLET, MOBILE]) {
    await page.setViewportSize(viewport);
    await page
      .getByRole("navigation", { name: /main/i })
      .getByRole("button", { name: /my tickets/i })
      .click();

    await expect(page.getByRole("heading", { name: /my tickets/i })).toBeVisible();
    await expect(page.getByLabel(/^search$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^filters/i })).toBeVisible();

    // The wide table scrolls inside its own container, not the page.
    await expectNoHorizontalScroll(page);
  }
});

// ---------------------------------------------------------------------------
// E2E-05 — the main journey succeeds at every viewport size (AC-24)
// ---------------------------------------------------------------------------
test("E2E-05 — the requester journey succeeds on desktop, tablet, and mobile", async ({
  page,
}) => {
  for (const viewport of [DESKTOP, TABLET, MOBILE]) {
    await page.setViewportSize(viewport);

    await selectRequester(page, "Requester A");
    const summary = uniqueSummary(`journey ${viewport.width}`);
    const ticketNumber = await createTicket(page, summary);
    expect(ticketNumber).toMatch(/^TT-\d{8}-\d{4,}$/);

    await openTicket(page, ticketNumber);
    await expectNoHorizontalScroll(page);

    // Reset for the next size.
    await signOut(page);
  }
});

// ---------------------------------------------------------------------------
// E2E-06 — Accessibility smoke test (AC-25)
// ---------------------------------------------------------------------------
test("E2E-06 — keyboard navigation and visible focus work on core screens", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);

  // Signing in is operable by keyboard alone, and the focused control shows a
  // visible focus indicator, not `outline: none`.
  await selectRequester(page, "Requester A");
  await signOut(page);
  const email = page.getByLabel(/^email/i);
  await email.focus();
  await expect(email).toBeFocused();
  await page.keyboard.press("Tab");
  const password = page.getByLabel(/^password/i);
  await expect(password).toBeFocused();
  const outline = await password.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(outline.style).not.toBe("none");
  await selectRequester(page, "Requester A");
  // Create Ticket: every field has an accessible label.
  await gotoCreateTicket(page);
  for (const label of [
    /ticket number/i,
    /ticket date/i,
    /^requester/i,
    /^category/i,
    /related system/i,
    /ticket summary/i,
    /requested priority/i,
    /^description/i,
  ]) {
    await expect(page.getByLabel(label)).toHaveCount(1);
  }

  // Validation is announced in text beside the field, not by colour alone.
  await page
    .getByRole("form", { name: /create ticket/i })
    .getByRole("button", { name: /^create ticket$/i })
    .click();
  const summaryField = page.getByLabel(/ticket summary/i);
  await expect(summaryField).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText(/summary is required/i)).toBeVisible();
});
