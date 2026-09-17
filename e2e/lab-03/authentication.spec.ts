import { test, expect, type Page } from "@playwright/test";

// Authentication journeys from docs/lab-03/tests.md §8:
//   E2E-01  Login per role                       (AC-01, AC-18 — identity part)
//   E2E-02  Initial password login and change    (AC-02, AC-10)
//   E2E-03  Login failures                       (AC-05, AC-06, AC-08)
//   E2E-04  Access blocked after logout          (AC-13)
//   E2E-05  Voluntary password change            (AC-11)
//
// Role navigation and Forbidden screens (E2E-01 nav, E2E-06) arrive with the
// Authorization middleware issue. Global setup re-seeds the accounts below.

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

test("E2E-01 — each role signs in and sees their name and role", async ({ page }) => {
  const accounts = [
    { email: "requester-a@example.com", name: "Requester A", role: "Requester" },
    { email: "itstaff-1@example.com", name: "IT Staff 1", role: "IT Staff" },
    { email: "admin@example.com", name: "Administrator", role: "Administrator" },
  ];

  for (const account of accounts) {
    await signIn(page, account.email);
    await expect(page.getByTestId("signed-in-user")).toHaveText(account.name);
    await expect(page.getByTestId("signed-in-role")).toHaveText(account.role);
    await logOut(page);
  }
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
