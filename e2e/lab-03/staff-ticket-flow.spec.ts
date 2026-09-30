import { test, expect, type Page } from "@playwright/test";
import {
  ACCOUNTS,
  apiSession,
  createTicketAs,
  createTicketViaApi,
  gotoQueue,
  openSessionAs,
  openTicketFromQueue,
  signIn,
  type FixtureTicket,
} from "./helpers.js";

// IT Staff ticket journeys (docs/lab-03/tests.md §8):
//   E2E-10  Queue work-finding             (AC-28 to AC-31)
//   E2E-11  Claim and progress a ticket     (AC-34, AC-38, AC-39)
//   E2E-12  Assign and reassign             (AC-36, AC-37)
//   E2E-13  Public vs Internal separation   (AC-04, AC-27, AC-43)
//   E2E-14  Stale update across two sessions (AC-44)

const operations = (page: Page) => page.getByRole("region", { name: /^ticket operations$/i });
const ownerText = (page: Page) => operations(page).locator("p.zen-readonly-value").first();

async function search(page: Page, text: string) {
  await page.getByLabel(/^search$/i).fill(text);
  await page.getByRole("button", { name: /^search$/i }).click();
}

async function openFilters(page: Page) {
  const toggle = page.getByRole("button", { name: /^filters/i });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}

test("E2E-10 — IT Staff find work with quick views, search, filter, sort and paging", async ({
  page,
}) => {
  // Eleven tickets sharing one token: three with distinct priorities, eight MEDIUM.
  const token = `queue ${Date.now().toString(36)}`;
  const requesterA = await apiSession(ACCOUNTS.requesterA.email);
  const requesterB = await apiSession(ACCOUNTS.requesterB.email);
  const urgent = await createTicketViaApi(requesterA, `${token} urgent`, "URGENT");
  const low = await createTicketViaApi(requesterB, `${token} low`, "LOW");
  await createTicketViaApi(requesterA, `${token} high`, "HIGH");
  for (let i = 0; i < 8; i++) await createTicketViaApi(requesterA, `${token} medium ${i}`, "MEDIUM");
  await requesterA.dispose();
  await requesterB.dispose();

  await signIn(page, ACCOUNTS.staff1.email);
  await gotoQueue(page);

  // Quick views: Active is selected by default, and every view shows its count.
  const quickViews = page.getByRole("group", { name: /^quick views$/i });
  await expect(quickViews.getByRole("button", { name: /^Active \(\d+\)$/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(quickViews.getByRole("button", { name: /^Assigned to Me \(\d+\)$/ })).toBeVisible();
  // Search by the shared token finds all eleven, and they are all unassigned.
  await search(page, token);
  await expect(page.getByRole("status").filter({ hasText: /of 11 tickets/ })).toBeVisible();
  const unassigned = quickViews.getByRole("button", { name: /^Unassigned \(\d+\)$/ });
  await unassigned.click();
  await expect(unassigned).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status").filter({ hasText: /of 11 tickets/ })).toBeVisible();
  await quickViews.getByRole("button", { name: /^Active \(\d+\)$/ }).click();

  // Search by Requester name narrows.
  await search(page, "Requester B");
  await expect(page.getByTestId("queue-rows")).toContainText(low.ticketNumber);
  await expect(page.getByTestId("queue-rows")).not.toContainText(urgent.ticketNumber);
  await search(page, token);

  // Filter by IT Priority.
  await openFilters(page);
  await page.getByLabel(/^it priority$/i).selectOption("URGENT");
  await expect(page.getByTestId("queue-rows").getByRole("row")).toHaveCount(1);
  await expect(page.getByTestId("queue-rows")).toContainText(urgent.ticketNumber);
  await expect(page.getByTestId("queue-rows")).toContainText("IT: Urgent");
  await page.getByLabel(/^it priority$/i).selectOption("");

  // Sort by IT Priority, highest first.
  await page.getByLabel(/^sort by$/i).selectOption("itPriority");
  await page.getByLabel(/^order$/i).selectOption("desc");
  const rows = page.getByTestId("queue-rows").getByRole("row");
  await expect(rows.first()).toContainText(urgent.ticketNumber);
  await expect(rows.first()).toContainText("IT: Urgent");
  await expect(rows.nth(1)).toContainText("IT: High");

  // Page through: ten per page, then the last one.
  await page.getByLabel(/^per page$/i).selectOption("10");
  await expect(page.getByTestId("page-indicator")).toHaveText("Page 1 of 2");
  await expect(rows).toHaveCount(10);
  const pagination = page.getByRole("navigation", { name: /queue pagination/i });
  await expect(pagination.getByRole("button", { name: /^previous$/i })).toBeDisabled();
  await pagination.getByRole("button", { name: /^next$/i }).click();
  await expect(page.getByTestId("page-indicator")).toHaveText("Page 2 of 2");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(low.ticketNumber);
  await expect(pagination.getByRole("button", { name: /^next$/i })).toBeDisabled();

  // Open a ticket from the queue, then return.
  await page.getByRole("button", { name: new RegExp(low.ticketNumber) }).click();
  await expect(page.getByRole("heading", { name: `Ticket ${low.ticketNumber}` })).toBeVisible();
  await page.getByRole("button", { name: /^back to queue$/i }).first().click();
  await expect(page.getByRole("heading", { name: /^ticket queue$/i })).toBeVisible();
});

test("E2E-11 — IT Staff claim a ticket, set IT Priority, and move it to Resolved", async ({
  page,
  browser,
}) => {
  const ticket = await createTicketAs(ACCOUNTS.requesterA.email, "claim and progress", "MEDIUM");

  await signIn(page, ACCOUNTS.staff1.email);
  await openTicketFromQueue(page, ticket);
  await expect(ownerText(page)).toHaveText("Unassigned");

  // Until claimed there is no way to change priority or move the ticket forward.
  await expect(page.getByLabel("IT Priority", { exact: true })).toHaveCount(0);
  await expect(operations(page)).toContainText("Claim this ticket to change IT Priority.");
  await expect(operations(page)).toContainText("Read-only status: New.");
  await expect(page.getByLabel("Change status to", { exact: true })).toHaveCount(0);

  // Claim.
  await operations(page).getByRole("button", { name: /^claim ticket$/i }).click();
  await expect(ownerText(page)).toHaveText("IT Staff 1");
  await expect(page.getByTestId("detail-status")).toHaveText("New");

  // IT Priority: Save stays disabled until the value changes; requested priority is untouched.
  const save = operations(page).getByRole("button", { name: /^save it priority$/i });
  await expect(save).toBeDisabled();
  await page.getByLabel("IT Priority", { exact: true }).selectOption("HIGH");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(operations(page).getByRole("status")).toHaveText("IT Priority updated to HIGH.");
  await expect(operations(page)).toContainText("Requested by requester: Medium");

  // Status: New -> Open -> In Progress are direct.
  const statusSelect = page.getByLabel("Change status to", { exact: true });
  const update = operations(page).getByRole("button", { name: /^update status$/i });
  await statusSelect.selectOption({ label: "Open" });
  await update.click();
  await expect(page.getByTestId("detail-status")).toHaveText("Open");
  await statusSelect.selectOption({ label: "In Progress" });
  await update.click();
  await expect(page.getByTestId("detail-status")).toHaveText("In Progress");

  // Resolved needs confirmation: Keep Current Status sends nothing.
  await statusSelect.selectOption({ label: "Resolved" });
  await update.click();
  const dialog = page.getByRole("dialog", { name: /confirm resolved/i });
  await expect(dialog).toContainText(`Mark ticket ${ticket.ticketNumber} as Resolved?`);
  await dialog.getByRole("button", { name: /^keep current status$/i }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("detail-status")).toHaveText("In Progress");

  await update.click();
  await page
    .getByRole("dialog", { name: /confirm resolved/i })
    .getByRole("button", { name: /^mark resolved$/i })
    .click();
  await expect(page.getByTestId("detail-status")).toHaveText("Resolved");

  // The queue reflects every change.
  await page.getByRole("button", { name: /^back to queue$/i }).first().click();
  await page.getByRole("button", { name: /^all$/i }).click();
  await search(page, ticket.ticketNumber);
  const row = page.getByTestId("queue-rows").getByRole("row").first();
  await expect(row).toContainText("Resolved");
  await expect(row).toContainText("You");
  await expect(row).toContainText("IT: High");

  // The Requester sees the new status and the assigned owner.
  const requester = await openSessionAs(browser, ACCOUNTS.requesterA.email);
  await requester.page.getByLabel(/^search$/i).fill(ticket.ticketNumber);
  await requester.page.getByRole("button", { name: /^search$/i }).click();
  await requester.page.getByRole("button", { name: new RegExp(ticket.ticketNumber) }).click();
  await expect(requester.page.getByTestId("detail-status")).toHaveText("Resolved");
  await expect(requester.page.getByText("IT Staff 1", { exact: true })).toBeVisible();
  await requester.context.close();
});

test("E2E-12 — a ticket is assigned, reassigned, and then read-only for the former assigner", async ({
  page,
  browser,
}) => {
  const ticket = await createTicketAs(ACCOUNTS.requesterB.email, "assign and reassign");

  // IT Staff 1 assigns the unassigned ticket to IT Staff 2.
  await signIn(page, ACCOUNTS.staff1.email);
  await openTicketFromQueue(page, ticket);
  await page.getByLabel("Assign to", { exact: true }).selectOption({ label: "IT Staff 2 (IT Staff)" });
  await operations(page).getByRole("button", { name: /^assign$/i }).click();
  await expect(ownerText(page)).toHaveText("IT Staff 2");

  // IT Staff 1 no longer owns it: read-only, with the reason.
  await expect(operations(page)).toContainText(
    "Only the ticket owner or an administrator can reassign this ticket.",
  );
  await expect(page.getByLabel("Reassign to", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Change status to", { exact: true })).toHaveCount(0);

  // IT Staff 2 owns it and reassigns to IT Staff 3; the current owner is not offered.
  const staff2 = await openSessionAs(browser, ACCOUNTS.staff2.email);
  await openTicketFromQueue(staff2.page, ticket);
  await expect(ownerText(staff2.page)).toHaveText("IT Staff 2");
  const reassign = staff2.page.getByLabel("Reassign to", { exact: true });
  await expect(reassign.locator("option", { hasText: "IT Staff 2" })).toHaveCount(0);
  await reassign.selectOption({ label: "IT Staff 3 (IT Staff)" });
  await staff2.page.getByRole("button", { name: /^reassign$/i }).click();
  await expect(ownerText(staff2.page)).toHaveText("IT Staff 3");
  await expect(staff2.page.getByLabel("Reassign to", { exact: true })).toHaveCount(0);
  await staff2.context.close();

  // IT Staff 1 reopens it and still sees read-only ownership under the new owner.
  await page.getByRole("button", { name: /^back to queue$/i }).first().click();
  await openTicketFromQueue(page, ticket);
  await expect(ownerText(page)).toHaveText("IT Staff 3");
  await expect(operations(page)).toContainText(
    "Only the ticket owner or an administrator can reassign this ticket.",
  );
});

test("E2E-13 — Internal Notes never reach the Requester; Public Comments render as literal text", async ({
  page,
  browser,
}) => {
  const ticket = await createTicketAs(ACCOUNTS.requesterA.email, "public vs internal");
  const publicText = "Please <b>restart</b> the printer <script>window.__pwned = true</script>";
  const noteText = "Internal only: spooler log shows a corrupted driver package.";

  await signIn(page, ACCOUNTS.staff1.email);
  await openTicketFromQueue(page, ticket);

  const internal = page.getByRole("region", { name: /^internal notes$/i });
  const publicSection = page.getByRole("region", { name: /^public comments$/i });
  await expect(internal).toContainText("Internal — never visible to the requester");
  await expect(publicSection).toContainText("Public — visible to the requester");

  await internal.getByLabel(/add an internal note/i).fill(noteText);
  await internal.getByRole("button", { name: /^post internal note$/i }).click();
  await expect(page.getByTestId("internal-thread-list")).toContainText(noteText);
  await expect(internal.getByRole("heading", { name: "Internal Notes (1)" })).toBeVisible();

  await publicSection.getByLabel(/add a public comment/i).fill(publicText);
  await publicSection.getByRole("button", { name: /^post public comment$/i }).click();
  await expect(page.getByTestId("public-thread-list")).toContainText(publicText);
  await expect(page.getByTestId("public-thread-list")).not.toContainText(noteText);
  await expect(page.getByTestId("public-thread-list").locator("b, script")).toHaveCount(0);

  // The Requester sees only the public comment, as literal text.
  const requester = await openSessionAs(browser, ACCOUNTS.requesterA.email);
  const rp = requester.page;
  await rp.getByLabel(/^search$/i).fill(ticket.ticketNumber);
  await rp.getByRole("button", { name: /^search$/i }).click();
  await rp.getByRole("button", { name: new RegExp(ticket.ticketNumber) }).click();
  const thread = rp.getByTestId("public-thread-list");
  await expect(thread).toContainText(publicText);
  await expect(thread.locator("b, script")).toHaveCount(0);
  expect(
    await rp.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned),
  ).toBeUndefined();
  await expect(rp.getByText(noteText)).toHaveCount(0);
  await expect(rp.getByText(/internal notes/i)).toHaveCount(0);

  // Direct API evidence: the Requester's request is refused and leaks nothing.
  const asRequester = await apiSession(ACCOUNTS.requesterA.email);
  const denied = await asRequester.get(`/api/tickets/${ticket.id}/internal-notes`);
  expect(denied.status()).toBe(403);
  expect(JSON.stringify(await denied.json())).not.toContain("spooler");
  const write = await asRequester.post(`/api/tickets/${ticket.id}/internal-notes`, {
    data: { body: "I should not be able to write this." },
  });
  expect(write.status()).toBe(403);
  await asRequester.dispose();
  await requester.context.close();
});

test("E2E-14 — a stale update in a second session is refused and Reload shows the new state", async ({
  page,
  browser,
}) => {
  const ticket: FixtureTicket = await createTicketAs(ACCOUNTS.requesterB.email, "stale update");

  // Both sessions open the same unassigned ticket.
  await signIn(page, ACCOUNTS.staff1.email);
  await openTicketFromQueue(page, ticket);
  const admin = await openSessionAs(browser, ACCOUNTS.admin.email);
  await admin.page
    .getByRole("navigation", { name: /^main$/i })
    .getByRole("button", { name: /^ticket queue$/i })
    .click();
  await admin.page.getByRole("button", { name: /^all$/i }).click();
  await search(admin.page, ticket.ticketNumber);
  await admin.page.getByRole("button", { name: new RegExp(ticket.ticketNumber) }).click();
  await expect(ownerText(admin.page)).toHaveText("Unassigned");

  // IT Staff 1 claims it, so the Administrator's copy is now out of date.
  await operations(page).getByRole("button", { name: /^claim ticket$/i }).click();
  await expect(ownerText(page)).toHaveText("IT Staff 1");

  // The Administrator's change is refused with the stale-ticket banner.
  await admin.page.getByLabel("IT Priority", { exact: true }).selectOption("URGENT");
  await operations(admin.page).getByRole("button", { name: /^save it priority$/i }).click();
  const banner = operations(admin.page).getByRole("alert");
  await expect(banner).toContainText("This ticket changed since you opened it.");

  // Reload shows the current owner, and the refused change was not saved.
  await banner.getByRole("button", { name: /^reload ticket$/i }).click();
  await expect(banner).toHaveCount(0);
  await expect(ownerText(admin.page)).toHaveText("IT Staff 1");
  await expect(admin.page.getByLabel("IT Priority", { exact: true })).toHaveValue("MEDIUM");

  await admin.context.close();
});
