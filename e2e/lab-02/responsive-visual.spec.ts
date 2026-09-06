import { test, expect, type Page } from "@playwright/test";
import {
  VIEWPORTS,
  captureScreen,
  createTicket,
  expectNoHorizontalScroll,
  expectNoOverlap,
  expectNotClipped,
  expectTouchFriendly,
  expectWithinViewport,
  fillCreateTicketForm,
  gotoCreateTicket,
  gotoMyTickets,
  makePngFile,
  openTicket,
  selectRequester,
  uniqueSummary,
  type ViewportName,
} from "./helpers.js";

// Responsive verification and visual evidence.
//
// For every viewport this suite walks the four requester screens, asserts the
// layout rules from ui-spec.md §9 (no horizontal page scrolling, nothing
// clipped, nothing overlapping, touch-friendly controls), and writes the
// screenshots required by ui-spec.md §11 to:
//
//   artifacts/lab-02/screenshots/requester-selection/<viewport>.png
//   artifacts/lab-02/screenshots/create-ticket/<viewport>.png
//   artifacts/lab-02/screenshots/create-ticket/<viewport>-validation.png
//   artifacts/lab-02/screenshots/my-tickets/<viewport>.png
//   artifacts/lab-02/screenshots/my-tickets/<viewport>-filters.png
//   artifacts/lab-02/screenshots/ticket-detail/<viewport>.png
//   artifacts/lab-02/screenshots/ticket-detail/<viewport>-removed-attachment.png

/** The labelled form controls that must always be readable and reachable. */
const CREATE_TICKET_FIELDS = [
  /ticket number/i,
  /ticket date/i,
  /^requester/i,
  /^category/i,
  /related system/i,
  /ticket summary/i,
  /requested priority/i,
  /^description/i,
] as const;

/** Checks every visible label renders its full text and stays in view. */
async function expectLabelsIntact(page: Page, container = page.locator("body")) {
  const labels = container.locator("label:visible");
  const count = await labels.count();
  expect(count, "expected labelled controls on this screen").toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const label = labels.nth(i);
    const text = ((await label.textContent()) ?? "").trim();
    await expectNotClipped(label, `label "${text}"`);
    await expectWithinViewport(page, label, `label "${text}"`);
  }
}

/** Checks every visible button renders its full text and stays in view. */
async function expectButtonsIntact(page: Page) {
  const buttons = page.getByRole("button");
  const count = await buttons.count();

  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    if (!(await button.isVisible())) continue;
    const name = ((await button.textContent()) ?? "").trim() || "icon button";
    await expectNotClipped(button, `button "${name}"`);
    await expectWithinViewport(page, button, `button "${name}"`);
    await expectTouchFriendly(button, `button "${name}"`);
  }
}

for (const [name, size] of Object.entries(VIEWPORTS)) {
  const viewport = name as ViewportName;

  test(`VIS-${viewport} — layout is intact and screenshots are captured at ${size.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(size);

    // -----------------------------------------------------------------------
    // 1. Requester Selection
    // -----------------------------------------------------------------------
    await page.goto("/");
    await expect(page.getByLabel(/development requester/i)).toBeVisible();

    await expectNoHorizontalScroll(page);
    await expectLabelsIntact(page);
    await expectButtonsIntact(page);
    // The testing-only notice must be readable, not truncated.
    await expectNotClipped(page.getByRole("note"), "testing-only notice");
    await captureScreen(page, "requester-selection", viewport);

    await selectRequester(page, "Requester A");

    // -----------------------------------------------------------------------
    // 2. Create Ticket — filled
    // -----------------------------------------------------------------------
    await gotoCreateTicket(page);
    const summary = uniqueSummary(`visual ${viewport}`);
    await fillCreateTicketForm(page, summary);

    await expectNoHorizontalScroll(page);
    await expectLabelsIntact(page);
    await expectButtonsIntact(page);

    // Every field is present, readable, and inside the viewport.
    for (const label of CREATE_TICKET_FIELDS) {
      const field = page.getByLabel(label);
      await expectWithinViewport(page, field, `field ${label}`);
      await expectTouchFriendly(field, `field ${label}`);
    }

    // A label must never sit on top of its own control.
    await expectNoOverlap([
      { locator: page.locator('label[for="ticket-summary"]'), name: "summary label" },
      { locator: page.getByLabel(/ticket summary/i), name: "summary input" },
      { locator: page.locator('label[for="ticket-description"]'), name: "description label" },
      { locator: page.getByLabel(/^description/i), name: "description textarea" },
    ]);

    await captureScreen(page, "create-ticket", viewport);

    // -----------------------------------------------------------------------
    // 3. Create Ticket — validation messages
    // -----------------------------------------------------------------------
    await page.getByLabel(/ticket summary/i).fill("");
    await page.getByLabel(/^description/i).fill("");
    await page
      .getByRole("form", { name: /create ticket/i })
      .getByRole("button", { name: /^create ticket$/i })
      .click();

    const summaryError = page.getByText(/summary is required/i);
    await expect(summaryError).toBeVisible();

    // AC-24 — a validation message must not be clipped, pushed off screen, or
    // laid over its neighbours.
    await expectNoHorizontalScroll(page);
    await expectNotClipped(summaryError, "summary validation message");
    await expectWithinViewport(page, summaryError, "summary validation message");
    await expectNoOverlap([
      { locator: page.getByLabel(/ticket summary/i), name: "summary input" },
      { locator: summaryError, name: "summary validation message" },
      { locator: page.getByText(/description is required/i), name: "description validation message" },
      { locator: page.getByLabel(/^description/i), name: "description textarea" },
    ]);

    await captureScreen(page, "create-ticket", `${viewport}-validation` as ViewportName);

    // Restore valid values and create the ticket the later screens need.
    await gotoMyTickets(page);
    const ticketNumber = await createTicket(page, summary);
    expect(ticketNumber).toMatch(/^TT-\d{8}-\d{4,}$/);

    // -----------------------------------------------------------------------
    // 4. My Tickets — list, badges, pagination
    // -----------------------------------------------------------------------
    await gotoMyTickets(page);
    await expect(page.getByTestId("ticket-rows")).toBeVisible();

    await expectNoHorizontalScroll(page);
    await expectLabelsIntact(page);
    await expectButtonsIntact(page);

    // The wide table may scroll inside its own container, but the ticket
    // number and summary must still render in full.
    const firstRow = page.getByTestId("ticket-rows").getByRole("row").first();
    await expectNotClipped(firstRow.getByRole("button").first(), "ticket number cell");
    await expectNotClipped(
      page.locator(".zen-badge").first(),
      "priority or status badge",
    );

    await captureScreen(page, "my-tickets", viewport);

    // The filter panel expanded — every control must stay usable.
    await page.getByRole("button", { name: /^filters/i }).click();
    await expect(page.getByLabel(/^category$/i)).toBeVisible();

    await expectNoHorizontalScroll(page);
    await expectLabelsIntact(page);
    for (const label of [
      /^category$/i,
      /requested priority/i,
      /current status/i,
      /sort by/i,
      /^order$/i,
      /per page/i,
    ]) {
      const control = page.getByLabel(label);
      await expectWithinViewport(page, control, `filter ${label}`);
      await expectTouchFriendly(control, `filter ${label}`);
    }

    await captureScreen(page, "my-tickets", `${viewport}-filters` as ViewportName);
    await page.getByRole("button", { name: /hide filters/i }).click();

    // -----------------------------------------------------------------------
    // 5. Ticket Detail — with an active attachment
    // -----------------------------------------------------------------------
    await openTicket(page, ticketNumber);

    const filePath = await makePngFile("responsive-evidence-screenshot.png");
    await page.getByLabel(/add an attachment/i).setInputFiles(filePath);
    const active = page.getByTestId("active-attachment");
    await expect(active).toBeVisible();

    await expectNoHorizontalScroll(page);
    await expectButtonsIntact(page);

    // AC-24 — the attachment filename must be fully readable, and its
    // actions must not sit on top of it.
    const attachmentName = active.getByTestId("attachment-name");
    await expect(attachmentName).toHaveText("responsive-evidence-screenshot.png");
    await expectNotClipped(attachmentName, "attachment filename");
    await expectWithinViewport(page, attachmentName, "attachment filename");
    await expectNoOverlap([
      { locator: attachmentName, name: "attachment filename" },
      { locator: active.getByRole("link", { name: /download/i }), name: "download action" },
      { locator: active.getByRole("button", { name: /^remove/i }), name: "remove action" },
    ]);

    // Read-only ticket values must render in full at every width.
    await expectNotClipped(page.getByTestId("detail-ticket-number"), "ticket number");
    await expectNotClipped(page.getByTestId("detail-description"), "description");

    await captureScreen(page, "ticket-detail", viewport);

    // -----------------------------------------------------------------------
    // 6. Ticket Detail — removed attachment state
    // -----------------------------------------------------------------------
    await active.getByRole("button", { name: /^remove/i }).click();
    await page.getByLabel(/reason for removing/i).fill("Captured for visual evidence");
    await page.getByRole("button", { name: /confirm removal/i }).click();

    const removed = page.getByTestId("removed-attachment");
    await expect(removed).toBeVisible();

    await expectNoHorizontalScroll(page);
    await expectNotClipped(
      removed.getByTestId("attachment-name"),
      "removed attachment filename",
    );
    await expectNotClipped(removed, "removed attachment row");

    await captureScreen(
      page,
      "ticket-detail",
      `${viewport}-removed-attachment` as ViewportName,
    );
  });
}

// ---------------------------------------------------------------------------
// Empty state evidence — a requester with no tickets (BR-28)
// ---------------------------------------------------------------------------
test("VIS-empty — the My Tickets empty state is captured at every width", async ({
  page,
}) => {
  for (const [name, size] of Object.entries(VIEWPORTS)) {
    await page.setViewportSize(size);

    // Requester E is not used by any other spec, so their list stays empty.
    await selectRequester(page, "Requester E");
    await gotoMyTickets(page);

    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNotClipped(page.getByTestId("empty-state"), "empty state");

    await captureScreen(page, "my-tickets", `${name}-empty` as ViewportName);

    await page.getByRole("button", { name: /change requester/i }).click();
  }
});
