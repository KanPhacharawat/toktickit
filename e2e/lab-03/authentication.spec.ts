import { test, expect, type Page } from "@playwright/test";

// Authentication journeys from docs/lab-03/tests.md §8:
//   E2E-01  Login per role                       (AC-01, AC-18 — identity part)
//   E2E-02  Initial password login and change    (AC-02, AC-10)
//   E2E-03  Login failures                       (AC-05, AC-06, AC-08)
//   E2E-04  Access blocked after logout          (AC-13)
//   E2E-05  Voluntary password change            (AC-11)
//
//   E2E-06  Forbidden destinations               (AC-18, AC-55)
//
// Global setup re-seeds the accounts below.
//
// The client is a single-page app with no URL routes, so "typing /queue" cannot
// open a screen: E2E-06 proves the same rule from both ends instead — the
// navigation never offers a destination the role may not use, and the API
// refuses the direct call with 403.

const API = "http://localhost:3000";
const DEV_PASSWORD = "TokTickIT-Dev1!";

async function signIn(page: Page, email: string, password = DEV_PASSWORD) {
  await page.goto("/");
  await page.getByLabel(/^email/i).fill(email);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
}

async function logOut(page: Page) {
  await page.getByRole("button", { name: /profile menu/i }).click();
  await page.getByRole("button", { name: /^log out$/i }).click();
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
}

test("E2E-01 — each role signs in, lands on its home, and sees the right navigation", async ({
  page,
}) => {
  const nav = page.getByRole("navigation", { name: /^main$/i });

  // Requester — My Tickets home, with Create Ticket.
  await signIn(page, "requester-a@example.com");
  await expect(page.getByTestId("signed-in-user")).toHaveText("Requester A");
  await expect(page.getByTestId("signed-in-role")).toHaveText("Requester");
  await expect(page.getByRole("heading", { name: /^my tickets$/i })).toBeVisible();
  await expect(nav.getByRole("button", { name: /^my tickets$/i })).toBeVisible();
  await expect(nav.getByRole("button", { name: /^create ticket$/i })).toBeVisible();
  await expect(nav.getByText(/ticket queue|user management/i)).toHaveCount(0);
  await logOut(page);

  // IT Staff — Ticket Queue home, and nothing else to navigate to.
  await signIn(page, "itstaff-1@example.com");
  await expect(page.getByTestId("signed-in-user")).toHaveText("IT Staff 1");
  await expect(page.getByTestId("signed-in-role")).toHaveText("IT Staff");
  await expect(page.getByRole("heading", { name: /^ticket queue$/i })).toBeVisible();
  await expect(nav).toHaveText("Ticket Queue");
  await expect(nav.getByText(/user management|my tickets|create ticket/i)).toHaveCount(0);
  await logOut(page);

  // Administrator — User Management home, with Ticket Queue as the second destination.
  await signIn(page, "admin@example.com");
  await expect(page.getByTestId("signed-in-user")).toHaveText("Administrator");
  await expect(page.getByTestId("signed-in-role")).toHaveText("Administrator");
  await expect(page.getByRole("heading", { name: /^user management$/i })).toBeVisible();
  await expect(nav.getByRole("button", { name: /^user management$/i })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await nav.getByRole("button", { name: /^ticket queue$/i }).click();
  await expect(page.getByRole("heading", { name: /^ticket queue$/i })).toBeVisible();
  await expect(nav.getByText(/my tickets|create ticket/i)).toHaveCount(0);
  await logOut(page);
});

test("E2E-02 — initial password login and change", async ({ page }) => {
  await signIn(page, "requester-d@example.com");

  await expect(page.getByRole("heading", { name: /change your password/i })).toBeVisible();
  await expect(page.getByText(/you must change your password before continuing/i)).toBeVisible();

  // Reloading does not get past the change.
  await page.reload();
  await expect(page.getByRole("heading", { name: /change your password/i })).toBeVisible();
  await expect(page.getByTestId("signed-in-user")).toHaveCount(0);

  const newPassword = `Changed-${Date.now()}!a`;
  await page.getByLabel(/^current/i).fill(DEV_PASSWORD);
  await page.getByLabel(/^new password/i).fill(newPassword);
  await page.getByLabel(/^confirm new password/i).fill(newPassword);
  await page.getByRole("button", { name: /save password/i }).click();

  await expect(page.getByTestId("signed-in-user")).toHaveText("Requester D");
  await expect(page.getByText("Your password has been changed.")).toBeVisible();

  // The initial password no longer works; the new one does.
  const oldLogin = await page.request.post(`${API}/api/auth/login`, {
    data: { email: "requester-d@example.com", password: DEV_PASSWORD },
  });
  expect(oldLogin.status()).toBe(401);
  const newLogin = await page.request.post(`${API}/api/auth/login`, {
    data: { email: "requester-d@example.com", password: newPassword },
  });
  expect(newLogin.status()).toBe(200);
  expect((await newLogin.json()).data.user.mustChangePassword).toBe(false);
});

test("E2E-03 — login failures show safe feedback", async ({ page }) => {
  await page.goto("/");
  const signInButton = page.getByRole("button", { name: /^sign in$/i });

  // Empty fields: validation, no request.
  await signInButton.click();
  await expect(page.getByText("Email is required.")).toBeVisible();
  await expect(page.getByText("Password is required.")).toBeVisible();

  // Wrong password: generic message, email kept, password cleared.
  await page.getByLabel(/^email/i).fill("requester-b@example.com");
  await page.getByLabel(/^password/i).fill("Wrong-Pass1!");
  await signInButton.click();
  await expect(page.getByRole("alert")).toHaveText("Invalid email or password. Please try again.");
  await expect(page.getByLabel(/^email/i)).toHaveValue("requester-b@example.com");
  await expect(page.getByLabel(/^password/i)).toHaveValue("");

  // Inactive account with the correct password.
  await page.getByLabel(/^email/i).fill("inactive-requester@example.com");
  await page.getByLabel(/^password/i).fill(DEV_PASSWORD);
  await signInButton.click();
  await expect(page.getByRole("alert")).toHaveText(
    "This account cannot sign in. Contact your administrator.",
  );
  await expect(page.getByTestId("signed-in-user")).toHaveCount(0);
});

test("E2E-03 — the Sign In button is busy while the request is pending", async ({ page }) => {
  await page.goto("/");
  await page.route(`${API}/api/auth/login`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });

  await page.getByLabel(/^email/i).fill("requester-a@example.com");
  await page.getByLabel(/^password/i).fill(DEV_PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  await expect(page.getByRole("button", { name: /signing in/i })).toBeDisabled();
  await expect(page.getByTestId("signed-in-user")).toHaveText("Requester A");
});

test("E2E-04 — access is blocked after logout", async ({ page, context }) => {
  await signIn(page, "requester-a@example.com");
  await expect(page.getByTestId("signed-in-user")).toBeVisible();

  const [cookie] = (await context.cookies()).filter((c) => c.name === "toktickit_session");
  expect(cookie, "session cookie is set").toBeDefined();
  expect(cookie.httpOnly).toBe(true);

  await logOut(page);
  await expect(page.getByText("You have signed out.")).toBeVisible();

  // Reloading, or typing the app URL again, lands on Login with no app data.
  await page.reload();
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  await expect(page.getByTestId("signed-in-user")).toHaveCount(0);
  await expect(page.getByLabel(/development requester/i)).toHaveCount(0);

  // Replaying the old token directly against the API is refused.
  const replay = await page.request.get(`${API}/api/auth/me`, {
    headers: { Cookie: `toktickit_session=${cookie.value}` },
  });
  expect(replay.status()).toBe(401);
});

test("E2E-05 — voluntary password change from the profile menu", async ({ page }) => {
  await signIn(page, "requester-c@example.com");
  await expect(page.getByTestId("signed-in-user")).toHaveText("Requester C");

  await page.getByRole("button", { name: /profile menu/i }).click();
  await page.getByRole("button", { name: /^change password$/i }).click();
  await expect(page.getByRole("heading", { name: /^change password$/i })).toBeVisible();

  const newPassword = `Voluntary-${Date.now()}#A`;
  await page.getByLabel(/^current password/i).fill(DEV_PASSWORD);
  await page.getByLabel(/^new password/i).fill(newPassword);
  await page.getByLabel(/^confirm new password/i).fill(newPassword);
  await page.getByRole("button", { name: /save password/i }).click();
  await expect(page.getByText("Your password has been changed.")).toBeVisible();

  await logOut(page);
  await signIn(page, "requester-c@example.com", newPassword);
  await expect(page.getByTestId("signed-in-user")).toHaveText("Requester C");
});

test("E2E-06 — a Requester is never shown, and cannot call, staff or admin destinations", async ({
  page,
}) => {
  await signIn(page, "requester-b@example.com");
  await expect(page.getByTestId("signed-in-user")).toHaveText("Requester B");

  // Typing a staff URL still lands on the Requester app: there is no such route.
  for (const url of ["/queue", "/admin/users"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: /^my tickets$/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /ticket queue|user management/i })).toHaveCount(0);
  }
  await expect(
    page.getByRole("navigation", { name: /^main$/i }).getByText(/ticket queue|user management/i),
  ).toHaveCount(0);

  // The API refuses the same destinations directly, with no data in the body.
  for (const url of ["/api/tickets/queue", "/api/admin/users", "/api/users/assignable"]) {
    const res = await page.request.get(`${API}${url}`);
    expect(res.status(), `Requester GET ${url}`).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.data).toBeUndefined();
  }
});

test("E2E-06 — IT Staff are never shown, and cannot call, the admin destination", async ({
  page,
}) => {
  await signIn(page, "itstaff-2@example.com");
  await expect(page.getByTestId("signed-in-user")).toHaveText("IT Staff 2");

  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: /^ticket queue$/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /user management/i })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: /^main$/i })).not.toContainText(
    /user management/i,
  );

  for (const request of [
    () => page.request.get(`${API}/api/admin/users`),
    () =>
      page.request.post(`${API}/api/admin/users`, {
        data: {
          name: "Should Not Exist",
          email: "should-not-exist@toktickit.test",
          role: "ITStaff",
          isActive: true,
          initialPassword: "Should-Not-Pass1!",
        },
      }),
    () => page.request.patch(`${API}/api/admin/users/1`, { data: { name: "Nope Nope" } }),
  ]) {
    const res = await request();
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  }
});
