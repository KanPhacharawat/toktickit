import {
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  VIEWPORTS,
  expectNoHorizontalScroll,
  expectNotClipped,
  expectTouchFriendly,
  expectWithinViewport,
  type ViewportName,
} from "../lab-02/helpers.js";

// Shared helpers for the Lab 3 end-to-end, accessibility and visual suites.

export {
  VIEWPORTS,
  expectNoHorizontalScroll,
  expectNoOverlap,
  expectNotClipped,
  expectTouchFriendly,
  expectWithinViewport,
  makePngFile,
  type ViewportName,
} from "../lab-02/helpers.js";

export const API = "http://localhost:3000";
export const APP = "http://localhost:5173";

/** The shared development password of every seeded account (specification.md §7.8). */
export const DEV_PASSWORD = "TokTickIT-Dev1!";

/** Seeded accounts (server/prisma/seedData.ts). Global setup re-seeds them each run. */
export const ACCOUNTS = {
  requesterA: { email: "requester-a@example.com", name: "Requester A", role: "Requester" },
  requesterB: { email: "requester-b@example.com", name: "Requester B", role: "Requester" },
  requesterC: { email: "requester-c@example.com", name: "Requester C", role: "Requester" },
  requesterD: { email: "requester-d@example.com", name: "Requester D", role: "Requester" },
  requesterE: { email: "requester-e@example.com", name: "Requester E", role: "Requester" },
  staff1: { email: "itstaff-1@example.com", name: "IT Staff 1", role: "IT Staff" },
  staff2: { email: "itstaff-2@example.com", name: "IT Staff 2", role: "IT Staff" },
  staff3: { email: "itstaff-3@example.com", name: "IT Staff 3", role: "IT Staff" },
  admin: { email: "admin@example.com", name: "Administrator", role: "Administrator" },
} as const;

export const VIEWPORT_LIST = Object.entries(VIEWPORTS) as Array<
  [ViewportName, (typeof VIEWPORTS)[ViewportName]]
>;

let counter = 0;

/** Summaries start with "E2E " so global setup can find and remove the tickets. */
export function uniqueText(label: string): string {
  counter += 1;
  return `E2E ${label} ${Date.now().toString(36)}${counter}`;
}

/** An address on the reserved test domain; global setup removes these users. */
export function uniqueEmail(label: string): string {
  counter += 1;
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `e2e-${slug}-${Date.now().toString(36)}${counter}@toktickit.test`;
}

export const STRONG_PASSWORD = "E2e-Initial-Pass1!";

// ---------------------------------------------------------------------------
// Browser sign-in
// ---------------------------------------------------------------------------

/** Submits the Login form without waiting for the outcome. */
export async function attemptSignIn(page: Page, email: string, password = DEV_PASSWORD) {
  await page.goto("/");
  await page.getByLabel(/^email/i).fill(email);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByLabel(/^password/i).press("Enter");
}

/** Signs in and waits for the signed-in shell (or the mandatory password change). */
export async function signIn(page: Page, email: string, password = DEV_PASSWORD) {
  await attemptSignIn(page, email, password);
  await expect(
    page
      .getByTestId("signed-in-user")
      .or(page.getByRole("heading", { name: /change your password/i })),
  ).toBeVisible();
}

export async function logOut(page: Page) {
  await page.getByRole("button", { name: /profile menu/i }).click();
  await page.getByRole("button", { name: /^log out$/i }).click();
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
}

/** A second, independent browser session for one account (two-user journeys). */
export async function openSessionAs(
  browser: Browser,
  email: string,
  viewport: { width: number; height: number } = VIEWPORTS.desktop,
  password = DEV_PASSWORD,
) {
  const context = await browser.newContext({ viewport, baseURL: APP });
  const page = await context.newPage();
  await signIn(page, email, password);
  return { context, page };
}

// ---------------------------------------------------------------------------
// Direct API access (fast fixtures, and authorization evidence that bypasses the UI)
// ---------------------------------------------------------------------------

/** Signs in through the API; the returned context keeps the session cookie. */
export async function apiSession(
  email: string,
  password = DEV_PASSWORD,
): Promise<APIRequestContext> {
  const context = await playwrightRequest.newContext({ baseURL: API });
  const res = await context.post("/api/auth/login", { data: { email, password } });
  expect(res.status(), `API sign-in for ${email}`).toBe(200);
  return context;
}

async function firstReferenceId(api: APIRequestContext, url: string): Promise<number> {
  const body = await (await api.get(url)).json();
  const list = (Array.isArray(body) ? body : body.data) as Array<{ id: number }>;
  return list[0].id;
}

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface FixtureTicket {
  id: number;
  ticketNumber: string;
  summary: string;
}

/** Creates a ticket as the signed-in Requester of `api`; the summary carries the E2E tag. */
export async function createTicketViaApi(
  api: APIRequestContext,
  label: string,
  requestedPriority: Priority = "MEDIUM",
): Promise<FixtureTicket> {
  const summary = uniqueText(label);
  const res = await api.post("/api/tickets", {
    data: {
      categoryId: await firstReferenceId(api, "/api/categories"),
      relatedSystemId: await firstReferenceId(api, "/api/related-systems"),
      summary,
      description: "Created by the Lab 3 end-to-end suite to exercise the staff and requester journeys.",
      requestedPriority,
    },
  });
  expect(res.status(), `create ticket "${summary}"`).toBe(201);
  const data = (await res.json()).data as { id: number; ticketNumber: string };
  return { id: data.id, ticketNumber: data.ticketNumber, summary };
}

/** Creates a fixture ticket as `email` and returns it. */
export async function createTicketAs(
  email: string,
  label: string,
  priority: Priority = "MEDIUM",
): Promise<FixtureTicket> {
  const api = await apiSession(email);
  try {
    return await createTicketViaApi(api, label, priority);
  } finally {
    await api.dispose();
  }
}

export interface CreatedUser {
  id: number;
  name: string;
  email: string;
}

/** Creates a user through the admin API. Global setup removes these accounts on the next run. */
export async function createUserViaApi(
  admin: APIRequestContext,
  label: string,
  role: "Requester" | "ITStaff" | "Administrator" = "ITStaff",
): Promise<CreatedUser> {
  const email = uniqueEmail(label);
  const name = `E2E ${label}`;
  const res = await admin.post("/api/admin/users", {
    data: { name, email, role, isActive: true, initialPassword: STRONG_PASSWORD },
  });
  expect(res.status(), `create user ${email}`).toBe(201);
  const data = (await res.json()).data as { id: number };
  return { id: data.id, name, email };
}

export async function currentUserId(api: APIRequestContext): Promise<number> {
  const me = await api.get(`${API}/api/auth/me`);
  return ((await me.json()) as { data: { id: number } }).data.id;
}

/**
 * Runs `fn` while `adminId` is the only active Administrator. Other active
 * Administrators (for example accounts left by manual testing) are switched
 * off for the duration and restored afterwards.
 */
export async function withSoleActiveAdministrator(
  api: APIRequestContext,
  adminId: number,
  fn: () => Promise<void>,
) {
  const listed = await api.get(`${API}/api/admin/users?role=Administrator`);
  const others = ((await listed.json()) as { data: Array<{ id: number; isActive: boolean }> }).data.filter(
    (a) => a.isActive && a.id !== adminId,
  );
  for (const other of others) {
    const off = await api.patch(`${API}/api/admin/users/${other.id}`, { data: { isActive: false } });
    expect(off.status(), `deactivate Administrator ${other.id}`).toBe(200);
  }
  try {
    await fn();
  } finally {
    for (const other of others) {
      await api.patch(`${API}/api/admin/users/${other.id}`, { data: { isActive: true } });
    }
  }
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export function mainNav(page: Page) {
  return page.getByRole("navigation", { name: /^main$/i });
}

/** Opens the Ticket Queue from whichever role's shell is showing. */
export async function gotoQueue(page: Page) {
  const button = mainNav(page).getByRole("button", { name: /^ticket queue$/i });
  if (await button.count()) await button.click();
  await expect(page.getByRole("heading", { name: /^ticket queue$/i })).toBeVisible();
  await expect(
    page
      .getByTestId("queue-rows")
      .or(page.getByTestId("no-results-state"))
      .or(page.getByTestId("empty-state")),
  ).toBeVisible();
}

/** Searches the queue for a ticket number and opens its detail. */
export async function openTicketFromQueue(page: Page, ticket: FixtureTicket) {
  await gotoQueue(page);
  await page.getByRole("button", { name: /^all$/i }).click();
  await page.getByLabel(/^search$/i).fill(ticket.ticketNumber);
  await page.getByRole("button", { name: /^search$/i }).click();
  await page.getByRole("button", { name: new RegExp(ticket.ticketNumber) }).click();
  await expect(page.getByTestId("detail-ticket-number")).toHaveText(ticket.ticketNumber);
}

// ---------------------------------------------------------------------------
// Layout integrity — the automated half of the visual checklist (ui-spec.md §16)
// ---------------------------------------------------------------------------

/**
 * No horizontal page scroll, and every visible button and label renders its
 * full text inside the viewport. Buttons must also stay comfortably tappable.
 * Visually hidden helper text (1px boxes) is ignored.
 */
export async function expectLayoutIntact(page: Page) {
  await expectNoHorizontalScroll(page);

  const buttons = page.getByRole("button");
  const buttonCount = await buttons.count();
  for (let i = 0; i < buttonCount; i++) {
    const button = buttons.nth(i);
    const box = await button.boundingBox();
    if (!box || box.width < 4 || box.height < 4) continue;
    const name = ((await button.textContent()) ?? "").trim() || "icon button";
    // Tables scroll sideways inside their own card (ui-spec.md §9). A button in
    // one only has to be reachable by scrolling that card, so bring it into view.
    if (await button.evaluate((el) => el.closest(".table-responsive") !== null)) {
      await button.scrollIntoViewIfNeeded();
    }
    await expectNotClipped(button, `button "${name}"`);
    await expectWithinViewport(page, button, `button "${name}"`);
    await expectTouchFriendly(button, `button "${name}"`);
  }
  // Leave every table scrolled back to its start so screenshots show the first column.
  await page.evaluate(() => {
    document.querySelectorAll(".table-responsive").forEach((el) => {
      el.scrollLeft = 0;
    });
  });

  const labels = page.locator("label:visible");
  const labelCount = await labels.count();
  for (let i = 0; i < labelCount; i++) {
    const label = labels.nth(i);
    const box = await label.boundingBox();
    if (!box || box.width < 4 || box.height < 4) continue;
    const text = ((await label.textContent()) ?? "").trim();
    await expectNotClipped(label, `label "${text}"`);
    await expectWithinViewport(page, label, `label "${text}"`);
  }
}

/** A focused control must show an outline or a ring, never `outline: none` alone. */
export async function expectFocusRing(locator: Locator, description: string) {
  await expect(locator, `${description} is focused`).toBeFocused();
  const ring = await locator.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      boxShadow: style.boxShadow,
    };
  });
  const visible =
    (ring.outlineStyle !== "none" && ring.outlineWidth > 0) || ring.boxShadow !== "none";
  expect(visible, `${description} has no visible focus ring (${JSON.stringify(ring)})`).toBe(true);
}

// ---------------------------------------------------------------------------
// Visual evidence — ui-spec.md §16
// ---------------------------------------------------------------------------

export const SCREENSHOT_ROOT = path.resolve(process.cwd(), "artifacts/lab-03/screenshots");

/**
 * Saves a full-page screenshot to
 * artifacts/lab-03/screenshots/<folder>/<viewport>-<state>.png.
 */
export async function capture(
  page: Page,
  folder: string,
  state: string,
  viewport: ViewportName,
) {
  const dir = path.join(SCREENSHOT_ROOT, folder);
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${viewport}-${state}.png`), fullPage: true });
}
