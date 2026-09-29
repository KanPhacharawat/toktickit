import { expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { attemptSignIn, DEV_PASSWORD, STRONG_PASSWORD } from "../lab-03/helpers.js";

// Shared helpers for the Lab 4 end-to-end suite (Actions Taken, ticket
// resolution workflow, dashboards). Builds on the Lab 2/3 helpers rather
// than duplicating login/API/navigation plumbing.

export {
  ACCOUNTS,
  API,
  APP,
  DEV_PASSWORD,
  STRONG_PASSWORD,
  type FixtureTicket,
  type Priority,
  apiSession,
  attemptSignIn,
  createTicketAs,
  createTicketViaApi,
  currentUserId,
  expectFocusRing,
  expectLayoutIntact,
  expectNoHorizontalScroll,
  expectNotClipped,
  expectTouchFriendly,
  expectWithinViewport,
  gotoQueue,
  logOut,
  mainNav,
  openSessionAs,
  openTicketFromQueue,
  signIn,
  uniqueEmail,
  uniqueText,
} from "../lab-03/helpers.js";

/**
 * Signs in an account seeded with `mustChangePassword: true`, completing the
 * mandatory Change Password screen if it's still pending. Global setup
 * reseeds the account's password at the start of the run, but another spec
 * in the same run may have already completed this same account's mandatory
 * change (e.g. e2e/lab-02/responsive-visual.spec.ts's VIS-empty test also
 * signs in as Requester E) — so this tries the seeded password first, and
 * falls back to the already-changed one rather than assuming which state
 * the account is in.
 */
export async function signInAndChangePassword(
  page: Page,
  email: string,
  currentPassword = DEV_PASSWORD,
  newPassword = STRONG_PASSWORD,
) {
  await attemptSignIn(page, email, currentPassword);
  const changePassword = page.getByRole("heading", { name: /change your password/i });
  const shellReady = page.getByTestId("signed-in-user");
  const invalidCredentials = page.getByRole("alert").filter({ hasText: /invalid email or password/i });
  await expect(changePassword.or(shellReady).or(invalidCredentials).first()).toBeVisible();

  if (await invalidCredentials.isVisible()) {
    // Another spec already completed this account's mandatory change.
    await attemptSignIn(page, email, newPassword);
    await expect(shellReady).toBeVisible();
    return;
  }

  if (await changePassword.isVisible()) {
    const form = page.getByRole("form", { name: /change password/i });
    // getByLabel would also match each field's "Show <label>" toggle button
    // (its own accessible name repeats the field label), so scope to the
    // textbox role specifically.
    await form.getByRole("textbox", { name: /current \(temporary\) password/i }).fill(currentPassword);
    await form.getByRole("textbox", { name: /^new password/i }).fill(newPassword);
    await form.getByRole("textbox", { name: /^confirm new password/i }).fill(newPassword);
    await form.getByRole("button", { name: /^save password$/i }).click();
  }
  await expect(shellReady).toBeVisible();
}

/**
 * ui-spec.md §11 / AC-34 literally names 375 / 768 / 1280px, unlike the Lab
 * 2/3 suites' `VIEWPORTS` (390/820/1280). Lab 4's E-04 viewport pass follows
 * the AC's exact numbers.
 */
export const LAB4_VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 900 },
} as const;

export type Lab4ViewportName = keyof typeof LAB4_VIEWPORTS;

export const LAB4_VIEWPORT_LIST = Object.entries(LAB4_VIEWPORTS) as Array<
  [Lab4ViewportName, (typeof LAB4_VIEWPORTS)[Lab4ViewportName]]
>;

export const SCREENSHOT_ROOT = path.resolve(process.cwd(), "artifacts/lab-04/screenshots");

/** Saves a full-page screenshot to artifacts/lab-04/screenshots/<folder>/<viewport>-<state>.png. */
export async function capture(page: Page, folder: string, state: string, viewport: string) {
  const dir = path.join(SCREENSHOT_ROOT, folder);
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${viewport}-${state}.png`), fullPage: true });
}

// ---------------------------------------------------------------------------
// AC-36 — no browser console errors on any major screen during E2E runs.
// ---------------------------------------------------------------------------

/**
 * Collects `console.error` messages and uncaught page errors for the life of
 * `page`. Call `assertNone()` at the end of a test (or in a `finally`) to
 * enforce AC-36. A handful of known-noisy, harmless browser messages are
 * ignored (see `IGNORED_PATTERNS`) so the guard stays meaningful.
 */
export function watchConsoleErrors(page: Page) {
  const errors: string[] = [];

  const IGNORED_PATTERNS = [
    // Vite's dev-server client logs this at HMR connect time; not an app error.
    /\[vite\] connecting/i,
  ];

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_PATTERNS.some((p) => p.test(text))) return;
    // AuthContext's start-up session check (GET /api/auth/me) is expected to
    // 401 on every anonymous page load — it's how the app learns there's no
    // session yet (authApi.ts: "resolves to null when there is no valid
    // session"), not an app error. React.StrictMode's dev-only double effect
    // invocation logs it twice per load. Chromium auto-logs any non-2xx
    // resource load as a console error regardless, so this one specific,
    // expected request is excluded; any other endpoint returning 401
    // unexpectedly still fails the AC-36 check.
    if (text.includes("401") && msg.location().url.endsWith("/api/auth/me")) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => {
    errors.push(err.message);
  });

  return {
    errors,
    assertNone(context = "") {
      expect(errors, `Browser console errors${context ? ` (${context})` : ""}:\n${errors.join("\n")}`).toEqual(
        [],
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Actions Taken (ui-spec.md §5)
// ---------------------------------------------------------------------------

export interface ActionFixture {
  actionAt?: Date;
  description: string;
  status?: "Planned" | "Completed";
  result?: string;
  performedByName: string;
  followUpRequired?: boolean;
  followUpNote?: string;
}

/** Selects an option by a substring of its visible text (`selectOption` only does exact matches). */
async function selectByVisibleText(select: ReturnType<Page["getByLabel"]>, text: string) {
  const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
  if (!value) throw new Error(`No <option> matching "${text}"`);
  await select.selectOption(value);
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Opens "+ Add Action" and submits the form (ui-spec.md §5.2). */
export async function addAction(page: Page, fixture: ActionFixture) {
  const section = page.locator("#actions-taken-section");
  await section.getByRole("button", { name: /^\+ add action$/i }).click();
  const form = section.getByRole("form", { name: /^add action$/i });

  if (fixture.status) {
    await form.getByRole("radio", { name: new RegExp(`^${fixture.status}$`, "i") }).check();
  }
  // The datetime-local input has minute precision, but a ticket's createdAt
  // does not — a bare "now" can truncate down to a moment that reads as
  // before the ticket's precise creation instant if both land in the same
  // minute (as they often do in a fast E2E run). A one-minute pad keeps the
  // truncated value safely after it, well inside BR-06's 5-minute-future cap.
  await form
    .getByLabel(/^action date\/time/i)
    .fill(toDatetimeLocalValue(fixture.actionAt ?? new Date(Date.now() + 60_000)));
  await form.getByLabel(/^description/i).fill(fixture.description);
  if (fixture.result) await form.getByLabel(/^result/i).fill(fixture.result);
  await selectByVisibleText(form.getByLabel(/^performed by/i), fixture.performedByName);
  if (fixture.followUpRequired) {
    await form.getByLabel(/^follow-up required/i).check();
    if (fixture.followUpNote) await form.getByLabel(/^follow-up note/i).fill(fixture.followUpNote);
  }
  await form.getByRole("button", { name: /^save action$/i }).click();
  await expect(form).not.toBeVisible();
}

/** Finds an Actions Taken row (desktop table row or mobile card) by its description text. */
export function actionRow(page: Page, description: string) {
  return page
    .locator('[data-testid="action-row"], [data-testid="action-card"]')
    .filter({ hasText: description })
    .first();
}

export async function completeAction(page: Page, description: string, result: string) {
  await actionRow(page, description).getByRole("button", { name: /^complete$/i }).click();
  const dialog = page.getByRole("dialog", { name: /^complete action$/i });
  await dialog.getByLabel(/^result/i).fill(result);
  await dialog.getByRole("button", { name: /^complete action$/i }).click();
  await expect(dialog).not.toBeVisible();
}

export async function cancelAction(page: Page, description: string, reason: string) {
  await actionRow(page, description).getByRole("button", { name: /^cancel$/i }).click();
  const dialog = page.getByRole("dialog", { name: /^cancel action$/i });
  await dialog.getByLabel(/^reason/i).fill(reason);
  await dialog.getByRole("button", { name: /^cancel action$/i }).click();
  await expect(dialog).not.toBeVisible();
}

export async function editAction(page: Page, description: string, patch: { description?: string }) {
  await actionRow(page, description).getByRole("button", { name: /^edit$/i }).click();
  const form = page.getByRole("form", { name: /^edit action$/i });
  if (patch.description) {
    await form.getByLabel(/^description/i).fill(patch.description);
  }
  await form.getByRole("button", { name: /^save changes$/i }).click();
  await expect(form).not.toBeVisible();
}

// ---------------------------------------------------------------------------
// Ticket workflow (ui-spec.md §6)
// ---------------------------------------------------------------------------

export function workflowSection(page: Page) {
  return page.getByTestId("ticket-workflow");
}

/**
 * Picks `toLabel` in the status combobox and clicks Update Status, opening
 * the target's dialog. Does not submit the dialog — callers finish the
 * dialog themselves (Resolve/Cancel/Reopen have distinct shapes; the plain
 * "Change status to X" dialog is completed via `confirmStatusChange`).
 */
export async function openStatusDialog(page: Page, toLabel: string) {
  const section = workflowSection(page);
  await section.getByLabel("Change status to").selectOption({ label: toLabel });
  // Only the picker's own button matches before the dialog opens.
  await section.getByRole("button", { name: "Update Status" }).click();
}

/** Completes the generic "Change status to X" dialog (no special shape). */
export async function confirmStatusChange(page: Page, toLabel: string, reason?: string) {
  const dialog = page.getByRole("dialog", { name: new RegExp(`^change status to ${toLabel}$`, "i") });
  if (reason) await dialog.getByLabel(/reason|note/i).fill(reason);
  await dialog.getByRole("button", { name: "Update Status" }).click();
  await expect(dialog).not.toBeVisible();
}

/** Drives New/Open/WaitingForRequester/InProgress/Closed transitions in one call. */
export async function changeStatus(page: Page, toLabel: string, reason?: string) {
  await openStatusDialog(page, toLabel);
  await confirmStatusChange(page, toLabel, reason);
}

export async function claimTicket(page: Page) {
  await page.getByRole("button", { name: /^claim ticket$/i }).click();
  await expect(page.getByRole("button", { name: /^claiming…$/i })).toHaveCount(0);
}

export async function cancelTicket(page: Page, reason: string) {
  await openStatusDialog(page, "Cancelled");
  const dialog = page.getByRole("dialog", { name: /^cancel ticket$/i });
  await dialog.getByLabel(/^reason/i).fill(reason);
  await dialog.getByRole("button", { name: /^cancel ticket$/i }).click();
  await expect(dialog).not.toBeVisible();
}

export async function reopenTicket(page: Page, reason: string) {
  const section = workflowSection(page);
  await section.getByRole("button", { name: /^reopen$/i }).click();
  const dialog = page.getByRole("dialog", { name: /^reopen ticket$/i });
  await dialog.getByLabel(/^reason/i).fill(reason);
  await dialog.getByRole("button", { name: /^reopen ticket$/i }).click();
  await expect(dialog).not.toBeVisible();
}

export async function indicateProblemResolved(page: Page) {
  await workflowSection(page)
    .getByRole("button", { name: /^problem appears resolved$/i })
    .click();
}

/** Opens the Resolve dialog for inspection (e.g. the gate checklist) without submitting. */
export async function openResolveDialog(page: Page) {
  await openStatusDialog(page, "Resolved");
  return page.getByRole("dialog", { name: /^resolve ticket/i });
}

export async function resolveTicket(page: Page, resolutionSummary: string, acknowledgeFollowUp = false) {
  const dialog = await openResolveDialog(page);
  if (acknowledgeFollowUp) {
    await dialog.getByLabel(/acknowledge the outstanding follow-up/i).check();
  }
  await dialog.getByLabel(/^resolution summary/i).fill(resolutionSummary);
  await dialog.getByRole("button", { name: /^confirm resolve$/i }).click();
  await expect(dialog).not.toBeVisible();
}

export function statusLine(page: Page) {
  return page.getByTestId("workflow-status-line");
}

export async function openHistoryTab(page: Page) {
  await workflowSection(page)
    .getByRole("tab", { name: /^history$/i })
    .click();
}

export function statusHistoryList(page: Page) {
  return page.getByTestId("status-history-list");
}

// ---------------------------------------------------------------------------
// Dashboards (ui-spec.md §3–4)
// ---------------------------------------------------------------------------

/** Locates a metric card by its label; its accessible name also carries the count. */
export function metricCard(page: Page, label: string) {
  return page.getByRole("button", { name: new RegExp(`^${label}: \\d+, view all$`, "i") });
}

/** Reads the numeric value out of a metric card's accessible name. */
export async function metricValue(page: Page, label: string): Promise<number> {
  const name = await metricCard(page, label).getAttribute("aria-label");
  const match = name?.match(/:\s*(\d+),/);
  if (!match) throw new Error(`Could not read metric value for "${label}" from "${name}"`);
  return Number(match[1]);
}

/**
 * After clicking a metric card's drill-down, asserts the resulting list's
 * total matches the card's count (AC-25): a "Showing X–Y of N" total when
 * N > 0, or the empty/no-results state when N === 0.
 */
export async function expectDrillDownTotal(page: Page, expected: number) {
  if (expected === 0) {
    await expect(
      page.getByTestId("empty-state").or(page.getByTestId("no-results-state")),
    ).toBeVisible();
    return;
  }
  const status = page.getByRole("status").filter({ hasText: /of \d+/ });
  await expect(status).toContainText(`of ${expected}`);
}
