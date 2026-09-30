import { test, expect, type Page } from "@playwright/test";
import {
  ACCOUNTS,
  API,
  APP,
  STRONG_PASSWORD,
  apiSession,
  attemptSignIn,
  createTicketAs,
  createUserViaApi,
  currentUserId,
  gotoQueue,
  openSessionAs,
  signIn,
  uniqueEmail,
  withSoleActiveAdministrator,
} from "./helpers.js";

// Administrator user management (docs/lab-03/tests.md §8):
//   E2E-15  Create user and first login         (AC-46, AC-47)
//   E2E-16  Admin validation                    (AC-48, AC-49)
//   E2E-17  Edit, reset, deactivate             (AC-50, AC-51, AC-54)
//   E2E-18  Administrator safety rules          (AC-52, AC-53)
//
// Accounts these tests create use the reserved @toktickit.test domain; global
// setup removes them before the next run.

const createPanel = (page: Page) => page.getByRole("region", { name: /^create new user$/i });
const editPanel = (page: Page) => page.getByRole("region", { name: /^edit user$/i });
const userRow = (page: Page, text: string) =>
  page.getByTestId("user-rows").getByRole("row").filter({ hasText: text });

async function searchUsers(page: Page, text: string) {
  await page.getByLabel(/^search$/i).fill(text);
  await page.getByRole("button", { name: /^search$/i }).click();
}

async function fillCreateForm(
  page: Page,
  values: { name: string; email: string; role?: string; password?: string; confirm?: string },
) {
  const panel = createPanel(page);
  await panel.getByLabel(/^full name/i).fill(values.name);
  await panel.getByLabel(/^email address/i).fill(values.email);
  if (values.role) await panel.getByLabel(/^role/i).selectOption({ label: values.role });
  await panel.getByLabel(/^initial password/i).fill(values.password ?? "");
  await panel.getByLabel(/^confirm initial password/i).fill(values.confirm ?? values.password ?? "");
}

test("E2E-15 — an Administrator searches, filters, creates an IT Staff user, and that user must change their password", async ({
  page,
  browser,
}) => {
  await signIn(page, ACCOUNTS.admin.email);
  await expect(page.getByRole("heading", { name: /^user management$/i })).toBeVisible();
  await expect(page.getByTestId("user-rows")).toBeVisible();

  // The list shows every kind of account, with the signed-in admin marked.
  await expect(userRow(page, "Administrator (you)").first()).toBeVisible();
  await expect(userRow(page, "requester-a@example.com")).toBeVisible();

  // Search by email, case-insensitively.
  await searchUsers(page, "REQUESTER-A@example");
  await expect(page.getByTestId("user-rows").getByRole("row")).toHaveCount(1);
  await expect(userRow(page, "Requester A")).toBeVisible();

  // Filter by role, then clear.
  await page.getByRole("button", { name: /^clear$/i }).first().click();
  await page.locator("#user-role-filter").selectOption({ label: "IT Staff" });
  await expect(userRow(page, "itstaff-1@example.com")).toBeVisible();
  await expect(userRow(page, "requester-a@example.com")).toHaveCount(0);
  const roles = page.getByTestId("user-rows").getByRole("row").locator("td:nth-child(3)");
  for (const text of await roles.allTextContents()) expect(text.trim()).toBe("IT Staff");
  await page.getByRole("button", { name: /^clear$/i }).first().click();
  await expect(userRow(page, "requester-a@example.com")).toBeVisible();

  // No pagination or sort controls exist (BR-56).
  await expect(page.getByRole("navigation", { name: /pagination/i })).toHaveCount(0);
  await expect(page.getByLabel(/sort by/i)).toHaveCount(0);

  // Create an IT Staff user.
  const email = uniqueEmail("first-login");
  const name = "E2E First Login";
  await page.getByRole("button", { name: /^create user$/i }).click();
  await expect(createPanel(page).getByRole("switch", { name: /^active$/i })).toBeChecked();
  await fillCreateForm(page, { name, email, role: "IT Staff", password: STRONG_PASSWORD });
  await createPanel(page).getByRole("button", { name: /^save user$/i }).click();

  await expect(page.getByRole("status").filter({ hasText: `Saved changes to ${name}.` })).toBeVisible();
  await expect(createPanel(page)).toHaveCount(0);

  await searchUsers(page, email);
  const row = userRow(page, email);
  await expect(row).toContainText("IT Staff");
  await expect(row).toContainText("Active");
  await expect(row).toContainText("Must change password");

  // The new user signs in and is held on the mandatory password change.
  const newUser = await openSessionAs(browser, email, undefined, STRONG_PASSWORD);
  await expect(newUser.page.getByRole("heading", { name: /change your password/i })).toBeVisible();
  await expect(newUser.page.getByTestId("signed-in-user")).toHaveCount(0);
  await expect(newUser.page.getByRole("navigation", { name: /^main$/i })).toHaveCount(0);
  await newUser.context.close();
});

test("E2E-16 — duplicate emails, a missing role, and a weak password are all rejected", async ({
  page,
}) => {
  const admin = await apiSession(ACCOUNTS.admin.email);
  const existing = await createUserViaApi(admin, "duplicate source");
  await admin.dispose();

  let creates = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/admin/users") {
      creates += 1;
    }
  });

  await signIn(page, ACCOUNTS.admin.email);
  await expect(page.getByTestId("user-rows")).toBeVisible();
  await page.getByRole("button", { name: /^create user$/i }).click();
  const panel = createPanel(page);

  // Missing role and a weak password block saving, with no request sent.
  await fillCreateForm(page, {
    name: "E2E Validation",
    email: uniqueEmail("validation"),
    password: "weak",
    confirm: "weak",
  });
  await panel.getByRole("button", { name: /^save user$/i }).click();
  await expect(panel.getByText("Select a role.")).toBeVisible();
  await expect(panel.getByText("Password does not meet every rule above.")).toBeVisible();
  await expect(panel.getByLabel(/^role/i)).toHaveAttribute("aria-invalid", "true");
  expect(creates, "no request while validation fails").toBe(0);
  await expect(panel.getByTestId("password-rules")).toContainText("not met");

  // A mismatched confirmation is caught too.
  await panel.getByLabel(/^role/i).selectOption({ label: "Requester" });
  await panel.getByLabel(/^initial password/i).fill(STRONG_PASSWORD);
  await panel.getByLabel(/^confirm initial password/i).fill(`${STRONG_PASSWORD}x`);
  await panel.getByRole("button", { name: /^save user$/i }).click();
  await expect(panel.getByText("Passwords do not match.")).toBeVisible();
  expect(creates).toBe(0);

  // A duplicate email in a different case is refused by the server, and the
  // entered values stay in the form.
  const duplicate = existing.email.toUpperCase();
  await fillCreateForm(page, {
    name: "E2E Duplicate",
    email: duplicate,
    role: "Requester",
    password: STRONG_PASSWORD,
  });
  await panel.getByRole("button", { name: /^save user$/i }).click();
  await expect(panel.getByText("This email is already used by another account.")).toBeVisible();
  await expect(panel.getByLabel(/^email address/i)).toHaveValue(duplicate);
  await expect(panel.getByLabel(/^full name/i)).toHaveValue("E2E Duplicate");
  expect(creates).toBe(1);

  // Editing an existing user onto someone else's email fails the same way.
  await panel.getByRole("button", { name: /^cancel$/i }).click();
  await searchUsers(page, "requester-a@example.com");
  await userRow(page, "requester-a@example.com").getByRole("button", { name: /^edit/i }).click();
  await editPanel(page).getByLabel(/^email address/i).fill(existing.email.toUpperCase());
  await editPanel(page).getByRole("button", { name: /^save changes$/i }).click();
  await expect(
    editPanel(page).getByText("This email is already used by another account."),
  ).toBeVisible();
});

test("E2E-17 — an Administrator edits a user, sets a new initial password, then deactivates them", async ({
  page,
  browser,
}) => {
  const adminApi = await apiSession(ACCOUNTS.admin.email);
  const user = await createUserViaApi(adminApi, "lifecycle");
  const newPassword = "E2e-Reset-Pass2!";

  // The user owns an active ticket, so deactivation has something to unassign.
  const ticket = await createTicketAs(ACCOUNTS.requesterA.email, "owned by deactivated user");
  const assign = await adminApi.patch(`/api/tickets/${ticket.id}/owner`, {
    data: { ticketOwnerId: user.id },
  });
  expect(assign.status()).toBe(200);

  // A live session for the user, which the password reset must end.
  const userApi = await apiSession(user.email, STRONG_PASSWORD);
  expect((await userApi.get("/api/auth/me")).status()).toBe(200);

  try {
    await signIn(page, ACCOUNTS.admin.email);
    await expect(page.getByTestId("user-rows")).toBeVisible();

    // Edit: rename and change role. Save stays disabled until something changes.
    await searchUsers(page, user.email);
    await userRow(page, user.email).getByRole("button", { name: /^edit/i }).click();
    const save = editPanel(page).getByRole("button", { name: /^save changes$/i });
    await expect(save).toBeDisabled();
    await expect(editPanel(page).getByLabel(/^full name/i)).toHaveValue(user.name);

    const renamed = `${user.name} Renamed`;
    await editPanel(page).getByLabel(/^full name/i).fill(renamed);
    await editPanel(page).getByLabel(/^role/i).selectOption({ label: "Administrator" });
    await expect(editPanel(page)).toContainText("Their active tickets will become unassigned.");
    await expect(save).toBeEnabled();
    await save.click();
    await expect(
      page.getByRole("status").filter({ hasText: new RegExp(`Saved changes to ${renamed}\\.`) }),
    ).toBeVisible();
    await expect(userRow(page, user.email)).toContainText("Administrator");
    await expect(userRow(page, user.email)).toContainText(renamed);

    // Set a new initial password: it needs a confirmation, and signs the user out.
    await userRow(page, user.email).getByRole("button", { name: /^edit/i }).click();
    await editPanel(page).getByLabel("New Initial Password", { exact: true }).fill(newPassword);
    await editPanel(page).getByLabel("Confirm New Initial Password", { exact: true }).fill(newPassword);
    await editPanel(page).getByRole("button", { name: "Set New Initial Password" }).click();

    const confirm = page.getByRole("dialog", { name: /confirm new initial password/i });
    await expect(confirm).toContainText(`Sign ${renamed} out and require a password change?`);
    await confirm.getByRole("button", { name: /^cancel$/i }).click();
    expect((await userApi.get("/api/auth/me")).status(), "cancel changes nothing").toBe(200);

    await editPanel(page).getByRole("button", { name: "Set New Initial Password" }).click();
    await confirm.getByRole("button", { name: /^confirm$/i }).click();
    await expect(
      editPanel(page)
        .getByRole("status")
        .filter({ hasText: `New initial password set. ${renamed} has been signed out.` }),
    ).toBeVisible();
    expect((await userApi.get("/api/auth/me")).status(), "the live session ended").toBe(401);

    // Their next login requires a change.
    const relogin = await openSessionAs(browser, user.email, undefined, newPassword);
    await expect(relogin.page.getByRole("heading", { name: /change your password/i })).toBeVisible();
    await relogin.context.close();

    // Deactivate: the account stays listed, and its ticket becomes unassigned.
    await editPanel(page).getByRole("switch", { name: /^active$/i }).uncheck();
    await expect(editPanel(page)).toContainText("Deactivating signs the user out immediately");
    await editPanel(page).getByRole("button", { name: /^save changes$/i }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /1 active tickets were unassigned\./ }),
    ).toBeVisible();
    await expect(userRow(page, user.email)).toContainText("Inactive");

    // Their login now shows the inactive banner.
    const inactive = await browser.newContext({ baseURL: APP });
    const inactivePage = await inactive.newPage();
    await attemptSignIn(inactivePage, user.email, newPassword);
    await expect(inactivePage.getByRole("alert")).toHaveText(
      "This account cannot sign in. Contact your administrator.",
    );
    await inactive.close();

    // The ticket shows Unassigned in the queue.
    await gotoQueue(page);
    await page.getByRole("button", { name: /^all$/i }).click();
    await page.getByLabel(/^search$/i).fill(ticket.ticketNumber);
    await page.getByRole("button", { name: /^search$/i }).click();
    await expect(page.getByTestId("queue-rows").getByRole("row").first()).toContainText("Unassigned");
  } finally {
    // Never leave an active extra Administrator behind (E2E-18 needs a sole one).
    await adminApi.patch(`/api/admin/users/${user.id}`, { data: { isActive: false } });
    await userApi.dispose();
    await adminApi.dispose();
  }
});

test("E2E-18 — an Administrator cannot deactivate themselves or remove the last administrator", async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.admin.email);
  await expect(page.getByTestId("user-rows")).toBeVisible();
  const myId = await currentUserId(page.request);

  await withSoleActiveAdministrator(page.request, myId, async () => {
    // The Active control is disabled on their own row, with the reason.
    await userRow(page, "(you)").getByRole("button", { name: /^edit/i }).click();
    await expect(editPanel(page).getByRole("switch", { name: /^active$/i })).toBeDisabled();
    await expect(editPanel(page)).toContainText("You cannot deactivate your own account.");

    // A direct API attempt is refused too.
    const selfDeactivate = await page.request.patch(`${API}/api/admin/users/${myId}`, {
      data: { isActive: false },
    });
    expect(selfDeactivate.status()).toBe(409);
    expect((await selfDeactivate.json()).error.code).toBe("SELF_DEACTIVATION_BLOCKED");

    // The sole active Administrator changing their own role sees the banner.
    await editPanel(page).getByLabel(/^role/i).selectOption({ label: "IT Staff" });
    await editPanel(page).getByRole("button", { name: /^save changes$/i }).click();
    await expect(editPanel(page).getByRole("alert")).toHaveText(
      "At least one active administrator is required. Make another user an active administrator first.",
    );

    // Nothing changed: still an active Administrator.
    await expect(page.getByTestId("signed-in-role")).toHaveText("Administrator");
    const me = await page.request.get(`${API}/api/admin/users/${myId}`);
    const meBody = (await me.json()) as { data: { role: string; isActive: boolean } };
    expect(meBody.data).toMatchObject({ role: "Administrator", isActive: true });
  });
});
