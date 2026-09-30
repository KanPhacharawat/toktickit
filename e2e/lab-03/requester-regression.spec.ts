import { test, expect } from "@playwright/test";
import {
  createTicket,
  gotoMyTickets,
  makePngFile,
  openTicket,
  uniqueSummary,
} from "../lab-02/helpers.js";
import { ACCOUNTS, apiSession, createTicketAs, signIn } from "./helpers.js";

// Requester journeys under authenticated identity (docs/lab-03/tests.md §8):
//   E2E-07  Requester Lab 2 journey                  (AC-19, AC-22)
//   E2E-08  Public Comment and resolution signal      (AC-23, AC-24)
//   E2E-09  Cross-Requester direct access             (AC-21)

test("E2E-07 — a signed-in Requester creates, finds, and manages a ticket with an attachment", async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.requesterA.email);
  await expect(page.getByRole("heading", { name: /^my tickets$/i })).toBeVisible();

  // No Development Requester selector anywhere (AC-19).
  await expect(page.getByLabel(/development requester/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /change requester/i })).toHaveCount(0);

  // Create a ticket; the Requester is the signed-in user, read-only (AC-22).
  const summary = uniqueSummary("lab3 requester journey");
  await page
    .getByRole("navigation", { name: /^main$/i })
    .getByRole("button", { name: /^create ticket$/i })
    .click();
  await expect(page.getByLabel(/^requester/i)).toHaveValue(/Requester A/);
  await expect(page.getByLabel(/development requester/i)).toHaveCount(0);
  const ticketNumber = await createTicket(page, summary);
  expect(ticketNumber).toMatch(/^TT-\d{8}-\d{4,}$/);

  // Find it in My Tickets with search, then filter.
  await gotoMyTickets(page);
  await page.getByLabel(/^search$/i).fill(summary);
  await page.getByRole("button", { name: /^search$/i }).click();
  await expect(page.getByTestId("ticket-rows").getByRole("row")).toHaveCount(1);
  await expect(page.getByTestId("ticket-rows")).toContainText("Unassigned");

  await page.getByRole("button", { name: /^filters/i }).click();
  await page.getByLabel(/requested priority/i).selectOption("MEDIUM");
  await expect(page.getByTestId("ticket-rows").getByRole("row")).toHaveCount(1);
  await page.getByLabel(/requested priority/i).selectOption("URGENT");
  await expect(page.getByTestId("no-results-state")).toBeVisible();
  await page.getByLabel(/requested priority/i).selectOption("");
  await expect(page.getByTestId("ticket-rows").getByRole("row")).toHaveCount(1);
  await page.getByRole("button", { name: /hide filters/i }).click();

  // Open the detail: staff-only information is not present (AC-25).
  await openTicket(page, ticketNumber);
  await expect(page.getByText(/internal notes/i)).toHaveCount(0);
  await expect(page.getByText(/^IT Priority$/)).toHaveCount(0);

  // Upload, download, then soft-remove with a reason.
  await page.getByLabel(/add an attachment/i).setInputFiles(await makePngFile("lab3-journey.png"));
  const active = page.getByTestId("active-attachment");
  await expect(active.getByTestId("attachment-name")).toHaveText("lab3-journey.png");

  const href = await active.getByRole("link", { name: /download/i }).getAttribute("href");
  const download = await page.request.get(href!);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toContain("image/png");

  await active.getByRole("button", { name: /^remove/i }).click();
  await page.getByRole("button", { name: /confirm removal/i }).click();
  await expect(page.getByText(/a removal reason is required/i)).toBeVisible();
  await page.getByLabel(/reason for removing/i).fill("Uploaded to the wrong ticket");
  await page.getByRole("button", { name: /confirm removal/i }).click();

  const removed = page.getByTestId("removed-attachment");
  await expect(removed).toContainText("Uploaded to the wrong ticket");
  await expect(removed.getByRole("link")).toHaveCount(0);
  expect((await page.request.get(href!)).status()).toBe(410);
});

test("E2E-08 — a Requester posts a Public Comment and reports Problem Appears Resolved", async ({
  page,
}) => {
  const ticket = await createTicketAs(ACCOUNTS.requesterA.email, "comment and resolution");
  await signIn(page, ACCOUNTS.requesterA.email);
  await openTicket(page, ticket.ticketNumber);
  await expect(page.getByTestId("detail-status")).toHaveText("New");

  // Public Comment: posted, appended, composer cleared.
  const comment = "The printer is still jammed when I print double-sided.";
  const publicSection = page.getByRole("region", { name: /^public comments$/i });
  await publicSection.getByLabel(/add a public comment/i).fill(comment);
  await publicSection.getByRole("button", { name: /^post public comment$/i }).click();
  await expect(page.getByTestId("public-thread-list")).toContainText(comment);
  await expect(page.getByTestId("public-thread-list")).toContainText("Requester A (you)");
  await expect(publicSection.getByLabel(/add a public comment/i)).toHaveValue("");

  // Problem Appears Resolved: Cancel sends nothing, Send Report records it.
  await page.getByRole("button", { name: /^problem appears resolved$/i }).click();
  const dialog = page.getByRole("dialog", { name: /report problem appears resolved/i });
  await dialog.getByRole("button", { name: /^cancel$/i }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: /^problem appears resolved$/i }).click();
  await dialog.getByLabel(/add a note/i).fill("Restarted the spooler and it works now.");
  await dialog.getByRole("button", { name: /^send report$/i }).click();

  await expect(page.getByText("Thanks — IT Staff have been notified.")).toBeVisible();
  await expect(page.getByText(/you reported that the problem appears resolved/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^problem appears resolved$/i })).toHaveCount(0);
  await expect(page.getByTestId("public-thread-list")).toContainText("Problem appears resolved.");
  await expect(page.getByTestId("public-thread-list")).toContainText(
    "Restarted the spooler and it works now.",
  );

  // The signal never changes the status — including after a full reload.
  await expect(page.getByTestId("detail-status")).toHaveText("New");
  await page.reload();
  await openTicket(page, ticket.ticketNumber);
  await expect(page.getByTestId("detail-status")).toHaveText("New");
  await expect(page.getByText(/you reported that the problem appears resolved/i)).toBeVisible();
});

test("E2E-09 — another Requester cannot see or fetch a ticket, and learns nothing about it", async ({
  page,
}) => {
  const ticket = await createTicketAs(ACCOUNTS.requesterA.email, "cross requester");

  // Requester B's own list never contains it.
  await signIn(page, ACCOUNTS.requesterB.email);
  await gotoMyTickets(page);
  await page.getByLabel(/^search$/i).fill(ticket.ticketNumber);
  await page.getByRole("button", { name: /^search$/i }).click();
  await expect(page.getByTestId("no-results-state")).toBeVisible();
  await expect(page.getByRole("button", { name: ticket.ticketNumber })).toHaveCount(0);

  // Direct API calls with B's session answer 404, and the body reveals nothing.
  const asB = await apiSession(ACCOUNTS.requesterB.email);
  for (const url of [
    `/api/tickets/${ticket.id}`,
    `/api/tickets/${ticket.id}/attachments`,
    `/api/tickets/${ticket.id}/public-comments`,
  ]) {
    const res = await asB.get(url);
    expect(res.status(), `Requester B GET ${url}`).toBe(404);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain(ticket.ticketNumber);
    expect(body).not.toContain(ticket.summary);
  }

  const comment = await asB.post(`/api/tickets/${ticket.id}/public-comments`, {
    data: { body: "I should not be able to post here." },
  });
  expect(comment.status()).toBe(404);
  await asB.dispose();

  // The owner still reaches it and sees no stray comment.
  const asA = await apiSession(ACCOUNTS.requesterA.email);
  expect((await asA.get(`/api/tickets/${ticket.id}`)).status()).toBe(200);
  const thread = (await (await asA.get(`/api/tickets/${ticket.id}/public-comments`)).json()) as {
    data: unknown[];
  };
  expect(thread.data).toHaveLength(0);
  await asA.dispose();
});
