import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  ACCOUNTS,
  DEV_PASSWORD,
  STRONG_PASSWORD,
  VIEWPORTS,
  apiSession,
  createTicketAs,
  createTicketViaApi,
  createUserViaApi,
  expectFocusRing,
  gotoQueue,
  logOut,
  openTicketFromQueue,
  signIn,
} from "./helpers.js";

// Keyboard and automated accessibility checks (docs/lab-03/tests.md §8):
//   A11Y-01  Keyboard: authentication
//   A11Y-02  Keyboard: staff Ticket Detail
//   A11Y-03  Keyboard: User Management
//   A11Y-04  Automated axe scan at 1280px and 390px
//
// The inline confirmation panels are plain `role="dialog"` regions that are
// reachable and operable by Tab/Enter; they do not trap focus or close on
// Escape, and the profile menu is a Tab-reachable disclosure without arrow-key
// navigation. These tests assert the behavior the client implements.

/** Presses Tab until `target` is focused, failing if it is not reached. */
async function tabTo(page: Page, target: Locator, description: string, max = 40) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target, `${description} is reachable by Tab`).toBeFocused();
}

test("A11Y-01 — Login works by keyboard alone with a visible focus ring on every stop", async ({
  page,
}) => {
  await page.goto("/");
  const email = page.getByLabel(/^email/i);
  await expect(email).toBeFocused();

  await page.keyboard.type(ACCOUNTS.requesterA.email);
  await page.keyboard.press("Tab");
  const password = page.getByLabel(/^password/i);
  await expectFocusRing(password, "Password");
  await page.keyboard.type(DEV_PASSWORD);

  // The show/hide toggle is a real button reachable next, and operable with Space.
  await page.keyboard.press("Tab");
  const toggle = page.getByRole("button", { name: /show password/i });
  await expectFocusRing(toggle, "Show password");
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /hide password/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(password).toHaveAttribute("type", "text");
  await page.keyboard.press("Space");
  await expect(password).toHaveAttribute("type", "password");

  await page.keyboard.press("Tab");
  const submit = page.getByRole("button", { name: /^sign in$/i });
  await expectFocusRing(submit, "Sign In");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("signed-in-user")).toHaveText("Requester A");
});

test("A11Y-01 — the profile menu opens with Enter, walks with Tab, and closes with Escape", async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.requesterA.email);
  const trigger = page.getByRole("button", { name: /profile menu/i });
  await trigger.focus();
  await expectFocusRing(trigger, "Profile menu button");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Tab");
  await expectFocusRing(
    page.getByRole("button", { name: /^change password$/i }),
    "Change Password item",
  );
  await page.keyboard.press("Tab");
  await expectFocusRing(page.getByRole("button", { name: /^log out$/i }), "Log Out item");

  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: /^log out$/i })).toHaveCount(0);
  await expectFocusRing(trigger, "Profile menu button after Escape");

  // Enter on Change Password opens the voluntary screen; Cancel returns by keyboard.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /^change password$/i })).toBeVisible();
  await expect(page.getByLabel(/^current password/i)).toBeFocused();

  const cancel = page.getByRole("button", { name: /^cancel$/i });
  await tabTo(page, cancel, "Cancel");
  await expectFocusRing(cancel, "Cancel");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /^my tickets$/i })).toBeVisible();
});

test("A11Y-01 — mandatory Change Password works by keyboard and announces its errors", async ({
  page,
}) => {
  const admin = await apiSession(ACCOUNTS.admin.email);
  const fresh = await createUserViaApi(admin, "a11y mandatory", "Requester");
  await admin.dispose();

  await signIn(page, fresh.email, STRONG_PASSWORD);
  await expect(page.getByRole("heading", { name: /change your password/i })).toBeVisible();

  const current = page.getByLabel(/^current \(temporary\) password/i);
  const newPassword = page.getByLabel(/^new password/i);
  const confirm = page.getByLabel(/^confirm new password/i);

  await expect(current).toBeFocused();
  await expectFocusRing(current, "Current password");
  await page.keyboard.type(STRONG_PASSWORD);
  await page.keyboard.press("Tab"); // show/hide toggle
  await page.keyboard.press("Tab");
  await expectFocusRing(newPassword, "New password");
  await page.keyboard.type("weak");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expectFocusRing(confirm, "Confirm new password");
  await page.keyboard.type("different");

  // Submitting from the keyboard reports every problem in text, tied to its field.
  await page.keyboard.press("Enter");
  await expect(newPassword).toHaveAttribute("aria-invalid", "true");
  await expect(confirm).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Your new password does not meet every rule below.")).toBeVisible();
  await expect(page.getByText("Passwords do not match.")).toBeVisible();
  await expect(page.getByTestId("password-rules")).toContainText("not met");

  // Fix it and save, still by keyboard.
  const fixed = "E2e-Keyboard-Pass9!";
  await newPassword.focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(fixed);
  await confirm.focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(fixed);
  await expect(page.getByTestId("password-rules")).not.toContainText("not met");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("signed-in-user")).toHaveText(fresh.name);
});

test("A11Y-02 — staff Ticket Detail operations and threads are reachable and operable by Tab", async ({
  page,
}) => {
  const ticket = await createTicketAs(ACCOUNTS.requesterB.email, "a11y staff detail");

  // Prepare a claimed, In Progress ticket through the API so the Resolved dialog is reachable.
  const staff = await apiSession(ACCOUNTS.staff1.email);
  const claimed = await staff.post(`/api/tickets/${ticket.id}/claim`, { data: {} });
  expect(claimed.status()).toBe(200);
  for (const status of ["Open", "InProgress"]) {
    const moved = await staff.patch(`/api/tickets/${ticket.id}/status`, {
      data: { currentStatus: status },
    });
    expect(moved.status()).toBe(200);
  }
  await staff.dispose();

  await signIn(page, ACCOUNTS.staff1.email);
  await openTicketFromQueue(page, ticket);
  const operations = page.getByRole("region", { name: /^ticket operations$/i });

  // IT Priority: reach the select and the Save button by Tab, change and save by keyboard.
  const priority = page.getByLabel("IT Priority", { exact: true });
  await page.getByRole("button", { name: /^back to queue$/i }).first().focus();
  await tabTo(page, priority, "IT Priority select");
  await expectFocusRing(priority, "IT Priority select");
  await page.keyboard.press("ArrowDown");
  const save = operations.getByRole("button", { name: /^save it priority$/i });
  await tabTo(page, save, "Save IT Priority");
  await expectFocusRing(save, "Save IT Priority");
  await page.keyboard.press("Enter");
  await expect(operations.getByRole("status")).toContainText("IT Priority updated to");

  // Status: pick Resolved, open the confirmation by keyboard, and operate it by keyboard.
  const status = page.getByLabel("Change status to", { exact: true });
  await tabTo(page, status, "Change status select");
  await status.selectOption({ label: "Resolved" });
  const update = operations.getByRole("button", { name: /^update status$/i });
  await tabTo(page, update, "Update Status");
  await expectFocusRing(update, "Update Status");
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: /confirm resolved/i });
  await expect(dialog).toBeVisible();
  const confirmButton = dialog.getByRole("button", { name: /^mark resolved$/i });
  const keep = dialog.getByRole("button", { name: /^keep current status$/i });
  await tabTo(page, confirmButton, "Mark Resolved");
  await expectFocusRing(confirmButton, "Mark Resolved");
  await page.keyboard.press("Tab");
  await expectFocusRing(keep, "Keep Current Status");
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("detail-status")).toHaveText("In Progress");

  // Threads: composers are reachable, labelled, and post by keyboard.
  const publicSection = page.getByRole("region", { name: /^public comments$/i });
  const internalSection = page.getByRole("region", { name: /^internal notes$/i });
  const publicBox = publicSection.getByLabel(/add a public comment/i);
  await tabTo(page, publicBox, "public comment composer");
  await expectFocusRing(publicBox, "public comment composer");
  await page.keyboard.type("Keyboard-posted public comment.");
  await page.keyboard.press("Tab");
  await expectFocusRing(
    publicSection.getByRole("button", { name: /^post public comment$/i }),
    "Post Public Comment",
  );
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("public-thread-list")).toContainText(
    "Keyboard-posted public comment.",
  );

  const noteBox = internalSection.getByLabel(/add an internal note/i);
  await noteBox.focus();
  await page.keyboard.type("Keyboard-posted internal note.");
  await page.keyboard.press("Tab");
  await expectFocusRing(
    internalSection.getByRole("button", { name: /^post internal note$/i }),
    "Post Internal Note",
  );
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("internal-thread-list")).toContainText(
    "Keyboard-posted internal note.",
  );

  // Empty submissions are announced in text beside the composer.
  await noteBox.focus();
  await page.keyboard.press("Enter"); // a newline: whitespace only
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(noteBox).toHaveAttribute("aria-invalid", "true");
  await expect(internalSection.getByText("Note is required.")).toBeVisible();
});

test("A11Y-03 — User Management panels and the Active switch work by keyboard", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin.email);
  await expect(page.getByTestId("user-rows")).toBeVisible();

  // Open Create User with Enter.
  const create = page.getByRole("button", { name: /^create user$/i });
  await create.focus();
  await expectFocusRing(create, "Create User");
  await page.keyboard.press("Enter");
  const panel = page.getByRole("region", { name: /^create new user$/i });
  await expect(panel).toBeVisible();

  // Submitting empty from a field with Enter announces errors on the fields.
  const name = panel.getByLabel(/^full name/i);
  await name.focus();
  await expectFocusRing(name, "Full Name");
  await page.keyboard.press("Enter");
  for (const field of [name, panel.getByLabel(/^email address/i), panel.getByLabel(/^role/i)]) {
    await expect(field).toHaveAttribute("aria-invalid", "true");
    const describedBy = await field.getAttribute("aria-describedby");
    expect(describedBy, "the invalid field points at its error text").toBeTruthy();
    await expect(page.locator(`#${describedBy}`)).not.toBeEmpty();
  }

  // The Active control is a real switch, operable with Space.
  const active = panel.getByRole("switch", { name: /^active$/i });
  await expect(active).toBeChecked();
  await active.focus();
  await expectFocusRing(active, "Active switch");
  await page.keyboard.press("Space");
  await expect(active).not.toBeChecked();
  await page.keyboard.press("Space");
  await expect(active).toBeChecked();

  // Cancel by keyboard closes the panel.
  await panel.getByRole("button", { name: /^cancel$/i }).focus();
  await page.keyboard.press("Enter");
  await expect(panel).toHaveCount(0);

  // An Edit button opens the edit panel by keyboard; a dirty Cancel asks to Discard or Keep Editing.
  const edit = page
    .getByTestId("user-rows")
    .getByRole("row")
    .filter({ hasText: "requester-a@example.com" })
    .getByRole("button", { name: /^edit/i });
  await edit.focus();
  await expectFocusRing(edit, "Edit button");
  await page.keyboard.press("Enter");
  const editPanel = page.getByRole("region", { name: /^edit user$/i });
  await expect(editPanel.getByLabel(/^full name/i)).toHaveValue("Requester A");

  await editPanel.getByLabel(/^full name/i).focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Requester A Changed");
  await editPanel.getByRole("button", { name: /^cancel$/i }).focus();
  await page.keyboard.press("Enter");
  const discard = page.getByRole("dialog", { name: /discard unsaved changes/i });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: /^keep editing$/i }).focus();
  await page.keyboard.press("Enter");
  await expect(discard).toHaveCount(0);
  await expect(editPanel.getByLabel(/^full name/i)).toHaveValue("Requester A Changed");
});

// ---------------------------------------------------------------------------
// A11Y-04 — automated axe scan
// ---------------------------------------------------------------------------

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

for (const [label, size] of [
  ["1280px", VIEWPORTS.desktop],
  ["390px", VIEWPORTS.mobile],
] as const) {
  test(`A11Y-04 — no serious or critical axe violations at ${label}`, async ({ page }) => {
    await page.setViewportSize(size);

    // Fixtures: a requester's ticket with a comment, and a fresh must-change user.
    const admin = await apiSession(ACCOUNTS.admin.email);
    const fresh = await createUserViaApi(admin, `a11y axe ${label}`, "Requester");
    await admin.dispose();
    const requester = await apiSession(ACCOUNTS.requesterA.email);
    const ticket = await createTicketViaApi(requester, `axe ${label}`, "HIGH");
    await requester.post(`/api/tickets/${ticket.id}/public-comments`, {
      data: { body: "A comment so the thread renders an entry." },
    });
    await requester.dispose();

    // Login.
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
    await expectNoSeriousViolations(page, "Login");

    // Change Password (mandatory).
    await signIn(page, fresh.email, STRONG_PASSWORD);
    await expect(page.getByRole("heading", { name: /change your password/i })).toBeVisible();
    await expectNoSeriousViolations(page, "Change Password");
    await page.getByRole("button", { name: /^log out$/i }).click();
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();

    // Requester: My Tickets and Ticket Detail.
    await signIn(page, ACCOUNTS.requesterA.email);
    await expect(page.getByTestId("ticket-rows")).toBeVisible();
    await expectNoSeriousViolations(page, "My Tickets");
    await page.getByLabel(/^search$/i).fill(ticket.ticketNumber);
    await page.getByRole("button", { name: /^search$/i }).click();
    await page.getByRole("button", { name: new RegExp(ticket.ticketNumber) }).click();
    await expect(page.getByTestId("public-thread-list")).toBeVisible();
    await expectNoSeriousViolations(page, "Requester Ticket Detail");
    await logOut(page);

    // IT Staff: Queue and Ticket Detail.
    await signIn(page, ACCOUNTS.staff1.email);
    await gotoQueue(page);
    await expectNoSeriousViolations(page, "Ticket Queue");
    await openTicketFromQueue(page, ticket);
    await expect(page.getByTestId("public-thread-list")).toBeVisible();
    await expectNoSeriousViolations(page, "Staff Ticket Detail");
    await logOut(page);

    // Administrator: User Management, with the Create panel open.
    await signIn(page, ACCOUNTS.admin.email);
    await expect(page.getByTestId("user-rows")).toBeVisible();
    await expectNoSeriousViolations(page, "User Management");
    await page.getByRole("button", { name: /^create user$/i }).click();
    await expect(page.getByRole("region", { name: /^create new user$/i })).toBeVisible();
    await expectNoSeriousViolations(page, "User Management with the Create panel");
  });
}
