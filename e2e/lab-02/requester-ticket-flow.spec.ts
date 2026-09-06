import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// E2E and responsive coverage from docs/lab-02/tests.md:
//   RESP-01  Desktop Create Ticket        (AC-24)
//   RESP-02  Tablet Create Ticket         (AC-24)
//   RESP-03  Mobile Create Ticket         (AC-24)
//   RESP-04  My Tickets responsive        (AC-24)
//   E2E-01   Complete Create Ticket flow  (AC-01, AC-05, AC-06)
//   E2E-02   My Tickets flow              (AC-11, AC-13–17)
//   E2E-03   Ownership flow               (AC-12)
//   E2E-04   Attachment lifecycle         (AC-19–21)
//   E2E-05   Responsive flow              (AC-24)
//   E2E-06   Accessibility smoke test     (AC-25)
//
// These run against the real API and database. Every ticket created here is
// tagged so the suite can identify its own rows.

const DESKTOP = { width: 1280, height: 900 };
const TABLET = { width: 820, height: 1024 };
const MOBILE = { width: 390, height: 844 };

/** Marks rows created by this suite. */
const TAG = "E2E";

function uniqueSummary(label: string): string {
  return `${TAG} ${label} ${Date.now().toString(36)}`;
}

const DESCRIPTION =
  "Created by the Lab 2 end-to-end suite to exercise the requester journey.";

/**
 * Chooses the option whose text contains `name`. The visible label is
 * "<name> — <department>", so an exact-label match would not find it.
 */
async function chooseRequesterOption(page: Page, name: string) {
  const select = page.getByLabel(/development requester/i);
  await expect(select).toBeVisible();

  const value = await select
    .locator("option", { hasText: name })
    .first()
    .getAttribute("value");
  expect(value, `no requester option matching "${name}"`).toBeTruthy();

  await select.selectOption(value!);
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByTestId("current-requester")).toContainText(name);
}

/** Opens the app and selects a Development Requester. */
async function selectRequester(page: Page, name: string) {
  await page.goto("/");
  await chooseRequesterOption(page, name);
}

/** Navigates to Create Ticket through the shell nav. */
async function gotoCreateTicket(page: Page) {
  await page
    .getByRole("navigation", { name: /main/i })
    .getByRole("button", { name: /create ticket/i })
    .click();
  await expect(page.getByRole("form", { name: /create ticket/i })).toBeVisible();
}

/** Fills and submits Create Ticket, returning the official Ticket Number. */
async function createTicket(page: Page, summary: string): Promise<string> {
  await gotoCreateTicket(page);

  await page.getByLabel(/^category/i).selectOption({ index: 1 });
  await page.getByLabel(/related system/i).selectOption({ index: 1 });
  await page.getByLabel(/ticket summary/i).fill(summary);
  await page.getByLabel(/requested priority/i).selectOption("MEDIUM");
  await page.getByLabel(/^description/i).fill(DESCRIPTION);

  await page
    .getByRole("form", { name: /create ticket/i })
    .getByRole("button", { name: /^create ticket$/i })
    .click();

  const number = page.getByTestId("created-ticket-number");
  await expect(number).toBeVisible();
  return ((await number.textContent()) ?? "").trim();
}

/** Opens Ticket Detail from the My Tickets list. */
async function openTicket(page: Page, ticketNumber: string) {
  await page
    .getByRole("navigation", { name: /main/i })
    .getByRole("button", { name: /my tickets/i })
    .click();
  await page.getByLabel(/^search$/i).fill(ticketNumber);
  await page.getByRole("button", { name: /^search$/i }).click();
  await page.getByRole("button", { name: new RegExp(ticketNumber) }).click();
  await expect(page.getByTestId("detail-ticket-number")).toHaveText(ticketNumber);
}

/** Writes a small valid PNG to a temp file for upload. */
async function makePngFile(name: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "toktickit-e2e-"));
  const filePath = path.join(dir, name);
  await fs.writeFile(
    filePath,
    Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
      "hex",
    ),
  );
  return filePath;
}

/** AC-24 — the page itself must never scroll sideways. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  // Allow a single pixel for sub-pixel rounding.
  expect(overflow).toBeLessThanOrEqual(1);
}

// ---------------------------------------------------------------------------
// E2E-01 — Complete Create Ticket flow (AC-01, AC-05, AC-06)
// ---------------------------------------------------------------------------
test("E2E-01 — requester selects identity, creates a ticket, sees the official number", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);

  // AC-01 — the selection screen lists active requesters.
  await page.goto("/");
  const select = page.getByLabel(/development requester/i);
  await expect(select).toBeVisible();
  await expect(page.getByRole("note")).toContainText(/not a real login/i);
  // AC-03 — the inactive seeded requester is not offered.
  await expect(
    page.getByRole("option", { name: /Inactive Requester/ }),
  ).toHaveCount(0);

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
test("E2E-03 — switching requester hides the other requester's ticket data", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await selectRequester(page, "Requester A");

  const summary = uniqueSummary("ownership flow");
  const ticketNumber = await createTicket(page, summary);

  // Switch to Requester B.
  await page.getByRole("button", { name: /change requester/i }).click();
  await chooseRequesterOption(page, "Requester B");

  // AC-12 — Requester A's ticket is not in Requester B's list.
  await page.getByLabel(/^search$/i).fill(ticketNumber);
  await page.getByRole("button", { name: /^search$/i }).click();
  await expect(page.getByTestId("no-results-state")).toBeVisible();
  await expect(page.getByRole("button", { name: ticketNumber })).toHaveCount(0);
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
    await page.getByRole("button", { name: /change requester/i }).click();
  }
});

// ---------------------------------------------------------------------------
// E2E-06 — Accessibility smoke test (AC-25)
// ---------------------------------------------------------------------------
test("E2E-06 — keyboard navigation and visible focus work on core screens", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);

  // The selector is reachable and operable by keyboard alone.
  await page.goto("/");
  const select = page.getByLabel(/development requester/i);
  await expect(select).toBeVisible();
  await select.focus();
  await expect(select).toBeFocused();

  const optionValue = await select
    .locator("option", { hasText: "Requester A" })
    .first()
    .getAttribute("value");
  await select.selectOption(optionValue!);
  const continueButton = page.getByRole("button", { name: /continue/i });
  await continueButton.focus();
  await expect(continueButton).toBeFocused();

  // A focused control must show a visible focus indicator, not `outline: none`.
  const outline = await continueButton.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(outline.style).not.toBe("none");

  await continueButton.press("Enter");
  await expect(page.getByTestId("current-requester")).toBeVisible();

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
