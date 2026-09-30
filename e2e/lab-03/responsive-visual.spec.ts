import { test, expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ACCOUNTS,
  DEV_PASSWORD,
  SCREENSHOT_ROOT,
  STRONG_PASSWORD,
  VIEWPORT_LIST,
  apiSession,
  capture,
  createTicketAs,
  createTicketViaApi,
  createUserViaApi,
  currentUserId,
  expectLayoutIntact,
  expectNoHorizontalScroll,
  gotoQueue,
  logOut,
  mainNav,
  openSessionAs,
  openTicketFromQueue,
  signIn,
  uniqueEmail,
  withSoleActiveAdministrator,
  type ViewportName,
} from "./helpers.js";

// Responsive layout checks and visual evidence (docs/lab-03/tests.md §8):
//   RESP-01 to RESP-06   layout at 1280, 820 and 390px
//   VIS-01 to VIS-05     screenshots for every ui-spec.md §16 folder, at every size
//
// Every screenshot is taken only after the automated checklist passes for that
// state: no horizontal page scroll, no clipped button or label, everything
// inside the viewport. Screenshots are written to
// artifacts/lab-03/screenshots/<folder>/<viewport>-<state>.png.
//
// The client lays out with Bootstrap's responsive grid (tables scroll inside
// their card, panels stack below the list on narrow screens). These checks
// assert that implemented behavior.

/** Lists the elements reaching past the right edge of the viewport, for failure messages. */
async function overflowingElements(page: Page): Promise<string> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    return Array.from(document.body.querySelectorAll("*"))
      .filter((el) => el.getBoundingClientRect().right > limit + 1)
      .slice(0, 5)
      .map((el) => `<${el.tagName.toLowerCase()} class="${el.className}"> right=${Math.round(el.getBoundingClientRect().right)}`)
      .join("; ");
  });
}

async function snap(page: Page, folder: string, state: string, viewport: ViewportName) {
  try {
    await expectLayoutIntact(page);
  } catch (error) {
    const offenders = await overflowingElements(page);
    throw new Error(
      `[${folder}/${viewport}-${state}] ${(error as Error).message}${offenders ? `\nElements past the right edge: ${offenders}` : ""}`,
    );
  }
  await capture(page, folder, state, viewport);
}

async function box(locator: Locator, description: string) {
  await expect(locator, `${description} is visible`).toBeVisible();
  const b = await locator.boundingBox();
  expect(b, `${description} has a layout box`).not.toBeNull();
  return b!;
}

const centerY = (b: { y: number; height: number }) => b.y + b.height / 2;

// ---------------------------------------------------------------------------
// RESP — layout rules per viewport
// ---------------------------------------------------------------------------

for (const [viewport, size] of VIEWPORT_LIST) {
  const isDesktop = size.width >= 992;

  test(`RESP-01 — Login and Change Password layout at ${viewport} (${size.width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize(size);

    async function expectCard(screen: string) {
      await expectNoHorizontalScroll(page);
      const card = await box(page.locator("main .zen-card").first(), `${screen} card`);
      expect(card.width, `${screen} card fits the viewport`).toBeLessThanOrEqual(size.width);
      if (isDesktop || size.width > 480) {
        const offset = Math.abs(card.x + card.width / 2 - size.width / 2);
        expect(offset, `${screen} card is centered`).toBeLessThanOrEqual(2);
      } else {
        expect(card.width, `${screen} card is full width on mobile`).toBeGreaterThanOrEqual(
          size.width - 40,
        );
      }
      const submit = await box(
        page.getByRole("button", { name: /^(sign in|save password)$/i }),
        `${screen} submit`,
      );
      expect(submit.width, `${screen} submit fills the card`).toBeGreaterThanOrEqual(card.width * 0.5);
    }

    await page.goto("/");
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
    await expectCard("Login");
    // On mobile the button spans the card.
    if (size.width <= 480) {
      const card = await box(page.locator("main .zen-card").first(), "Login card");
      const button = await box(page.getByRole("button", { name: /^sign in$/i }), "Sign In");
      expect(button.width).toBeGreaterThanOrEqual(card.width * 0.8);
    }

    const admin = await apiSession(ACCOUNTS.admin.email);
    const fresh = await createUserViaApi(admin, `resp login ${viewport}`, "Requester");
    await admin.dispose();
    await signIn(page, fresh.email, STRONG_PASSWORD);
    await expect(page.getByRole("heading", { name: /change your password/i })).toBeVisible();
    await expectCard("Change Password");
  });

  test(`RESP-02 — shell layout at ${viewport} (${size.width}px)`, async ({ page }) => {
    await page.setViewportSize(size);

    for (const account of [ACCOUNTS.requesterA, ACCOUNTS.staff1, ACCOUNTS.admin]) {
      await signIn(page, account.email);
      await expectNoHorizontalScroll(page);

      const header = page.locator(".zen-shell-header");
      const brand = await box(header.getByText("TokTickIT", { exact: true }), "brand");
      const profile = await box(page.getByRole("button", { name: /profile menu/i }), "profile menu");
      const nav = await box(mainNav(page), "main navigation");
      for (const [name, b] of [["brand", brand], ["navigation", nav], ["profile menu", profile]] as const) {
        expect(b.x, `${name} starts inside the viewport`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, `${name} ends inside the viewport`).toBeLessThanOrEqual(size.width + 1);
      }

      // Desktop keeps the whole header on one row.
      if (isDesktop) {
        expect(Math.abs(centerY(brand) - centerY(profile))).toBeLessThanOrEqual(12);
        expect(Math.abs(centerY(brand) - centerY(nav))).toBeLessThanOrEqual(12);
      }

      // Every navigation item is reachable and tappable.
      for (const item of await mainNav(page).getByRole("button").all()) {
        const b = await box(item, "navigation item");
        expect(b.height, "navigation item is tappable").toBeGreaterThanOrEqual(24);
        expect(b.x + b.width).toBeLessThanOrEqual(size.width + 1);
      }

      // The profile menu opens fully inside the viewport, with tappable items.
      await page.getByRole("button", { name: /profile menu/i }).click();
      const menu = await box(page.locator("#profile-menu"), "profile menu panel");
      expect(menu.x).toBeGreaterThanOrEqual(-1);
      expect(menu.x + menu.width).toBeLessThanOrEqual(size.width + 1);
      for (const item of await page.locator("#profile-menu button").all()) {
        expect((await box(item, "profile menu item")).height).toBeGreaterThanOrEqual(32);
      }
      await expectNoHorizontalScroll(page);
      await page.getByRole("button", { name: /^log out$/i }).click();
      await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
    }
  });

  test(`RESP-03 — Ticket Queue layout at ${viewport} (${size.width}px)`, async ({ page }) => {
    await page.setViewportSize(size);
    await createTicketAs(ACCOUNTS.requesterA.email, `resp queue ${viewport}`, "HIGH");
    await signIn(page, ACCOUNTS.staff1.email);
    await gotoQueue(page);
    await expectNoHorizontalScroll(page);

    // The seven columns are all present; the table scrolls inside its own card.
    await expect(page.getByRole("columnheader")).toHaveCount(7);
    const scroller = page.locator(".table-responsive").first();
    const overflow = await scroller.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    if (isDesktop) {
      expect(overflow.scrollWidth, "desktop shows the table without inner scroll").toBeLessThanOrEqual(
        overflow.clientWidth + 1,
      );
    }
    const card = await box(scroller, "table card");
    expect(card.x + card.width, "table card stays inside the viewport").toBeLessThanOrEqual(size.width + 1);

    // Quick views wrap inside the viewport instead of overflowing it.
    for (const button of await page.getByRole("group", { name: /^quick views$/i }).getByRole("button").all()) {
      const b = await box(button, "quick view");
      expect(b.x).toBeGreaterThanOrEqual(-1);
      expect(b.x + b.width).toBeLessThanOrEqual(size.width + 1);
    }

    // Search and filters stay usable.
    await page.getByRole("button", { name: /^filters/i }).click();
    for (const label of [/^status$/i, /^ownership$/i, /^it priority$/i, /^sort by$/i, /^per page$/i]) {
      const control = await box(page.getByLabel(label), `filter ${label}`);
      expect(control.x + control.width).toBeLessThanOrEqual(size.width + 1);
    }
    await expectNoHorizontalScroll(page);
  });

  test(`RESP-04 — staff Ticket Detail layout at ${viewport} (${size.width}px)`, async ({ page }) => {
    await page.setViewportSize(size);
    const ticket = await createTicketAs(ACCOUNTS.requesterB.email, `resp staff detail ${viewport}`);
    await signIn(page, ACCOUNTS.staff1.email);
    await openTicketFromQueue(page, ticket);
    await expectNoHorizontalScroll(page);

    const info = await box(page.getByRole("region", { name: /^ticket information$/i }), "information");
    const ops = await box(page.getByRole("region", { name: /^ticket operations$/i }), "operations");
    const pub = await box(page.getByRole("region", { name: /^public comments$/i }), "public comments");
    const internal = await box(page.getByRole("region", { name: /^internal notes$/i }), "internal notes");

    if (isDesktop) {
      // Two columns: information and Public Comments left; operations and Internal Notes right.
      expect(ops.x, "operations sit right of information").toBeGreaterThan(info.x + info.width - 2);
      expect(Math.abs(ops.y - info.y), "columns start level").toBeLessThanOrEqual(40);
      expect(internal.x, "Internal Notes are in the other column from Public Comments").toBeGreaterThan(
        pub.x + pub.width - 2,
      );
    } else {
      // One column: operations first, all cards the same width and left edge.
      expect(ops.y, "operations come before information").toBeLessThan(info.y);
      for (const [name, b] of [["operations", ops], ["public comments", pub], ["internal notes", internal]] as const) {
        expect(Math.abs(b.x - info.x), `${name} aligns with information`).toBeLessThanOrEqual(2);
        expect(Math.abs(b.width - info.width), `${name} matches the information width`).toBeLessThanOrEqual(2);
      }
    }
    for (const b of [info, ops, pub, internal]) {
      expect(b.x + b.width).toBeLessThanOrEqual(size.width + 1);
    }
  });

  test(`RESP-05 — Requester screens do not clip comments at ${viewport} (${size.width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    const requester = await apiSession(ACCOUNTS.requesterA.email);
    const ticket = await createTicketViaApi(requester, `resp requester ${viewport}`, "HIGH");
    const longWord = "x".repeat(300);
    await requester.post(`/api/tickets/${ticket.id}/public-comments`, {
      data: { body: `An unbroken token: ${longWord}` },
    });
    await requester.dispose();

    await signIn(page, ACCOUNTS.requesterA.email);
    await expect(page.getByTestId("ticket-rows")).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByLabel(/^search$/i).fill(ticket.ticketNumber);
    await page.getByRole("button", { name: /^search$/i }).click();
    await page.getByRole("button", { name: new RegExp(ticket.ticketNumber) }).click();
    await expect(page.getByTestId("public-thread-list")).toContainText(longWord);

    // The long token wraps inside its card instead of pushing the page sideways.
    await expectNoHorizontalScroll(page);
    const card = await box(page.getByRole("region", { name: /^public comments$/i }), "comments card");
    const entry = await box(page.getByTestId("public-thread-list").locator("p").first(), "comment text");
    expect(entry.x + entry.width, "comment stays inside its card").toBeLessThanOrEqual(card.x + card.width + 1);

    // The resolution dialog fits the viewport.
    await page.getByRole("button", { name: /^problem appears resolved$/i }).click();
    const dialog = await box(
      page.getByRole("dialog", { name: /report problem appears resolved/i }),
      "resolution dialog",
    );
    expect(dialog.x).toBeGreaterThanOrEqual(-1);
    expect(dialog.x + dialog.width).toBeLessThanOrEqual(size.width + 1);
    await expectNoHorizontalScroll(page);
  });

  test(`RESP-06 — User Management layout at ${viewport} (${size.width}px)`, async ({ page }) => {
    await page.setViewportSize(size);
    const admin = await apiSession(ACCOUNTS.admin.email);
    const longEmail = `e2e-${"long".repeat(35)}-${Date.now().toString(36)}@toktickit.test`;
    const res = await admin.post("/api/admin/users", {
      data: {
        name: "E2E Long Email",
        email: longEmail,
        role: "Requester",
        isActive: true,
        initialPassword: STRONG_PASSWORD,
      },
    });
    expect(res.status()).toBe(201);
    await admin.dispose();

    await signIn(page, ACCOUNTS.admin.email);
    await expect(page.getByTestId("user-rows")).toBeVisible();
    await expectNoHorizontalScroll(page);

    // A very long email wraps inside its cell instead of widening the page.
    await page.getByLabel(/^search$/i).fill(longEmail);
    await page.getByRole("button", { name: /^search$/i }).click();
    const row = page.getByTestId("user-rows").getByRole("row").filter({ hasText: longEmail });
    await expect(row).toHaveCount(1);
    await expect(row).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: /^clear$/i }).first().click();

    // Opening a panel: beside the list on desktop, stacked below it on narrower screens.
    await page.getByRole("button", { name: /^create user$/i }).click();
    const panel = await box(page.getByRole("region", { name: /^create new user$/i }), "Create panel");
    const table = await box(page.locator(".table-responsive").first(), "user table");
    if (isDesktop) {
      expect(panel.x, "the panel sits beside the list").toBeGreaterThan(table.x + table.width - 2);
      expect(table.width / (table.width + panel.width + 24), "list takes about 7/12").toBeGreaterThan(0.5);
    } else {
      expect(panel.y, "the panel stacks below the list").toBeGreaterThan(table.y + table.height - 2);
      expect(Math.abs(panel.width - table.width)).toBeLessThanOrEqual(2);
    }
    expect(panel.x + panel.width).toBeLessThanOrEqual(size.width + 1);
    await expectNoHorizontalScroll(page);
  });
}

// ---------------------------------------------------------------------------
// VIS-01 — authentication/
// ---------------------------------------------------------------------------

for (const [viewport, size] of VIEWPORT_LIST) {
  test(`VIS-01 — authentication screens at ${viewport} (${size.width}px)`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(size);
    const shot = (state: string) => snap(page, "authentication", state, viewport);

    // Login: default, validation, invalid credentials, inactive account, throttled.
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
    await shot("login-default");

    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page.getByText("Email is required.")).toBeVisible();
    await shot("login-validation");

    // An address that does not exist, so real accounts are never throttled by this suite.
    const nobody = uniqueEmail("nobody");
    const email = page.getByLabel(/^email/i);
    const password = page.getByLabel(/^password/i);
    await email.fill(nobody);
    await password.fill("Wrong-Pass1!");
    await password.press("Enter");
    await expect(page.getByRole("alert")).toHaveText("Invalid email or password. Please try again.");
    await shot("login-invalid-credentials");

    await email.fill(ACCOUNTS.requesterA.email.replace("requester-a", "inactive-requester"));
    await password.fill(DEV_PASSWORD);
    await password.press("Enter");
    await expect(page.getByRole("alert")).toHaveText(
      "This account cannot sign in. Contact your administrator.",
    );
    await shot("login-inactive");

    await email.fill(nobody);
    for (let attempt = 0; attempt < 8; attempt++) {
      await password.fill("Wrong-Pass1!");
      const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith("/api/auth/login")),
        password.press("Enter"),
      ]);
      if (response.status() === 429) break;
    }
    await expect(page.getByRole("alert")).toHaveText("Too many sign-in attempts. Try again in 15 minutes.");
    await shot("login-throttled");

    // Mandatory Change Password, with rule validation.
    const admin = await apiSession(ACCOUNTS.admin.email);
    const fresh = await createUserViaApi(admin, `vis auth ${viewport}`, "Requester");
    await admin.dispose();
    await signIn(page, fresh.email, STRONG_PASSWORD);
    await expect(page.getByRole("heading", { name: /change your password/i })).toBeVisible();
    await shot("change-password-mandatory");

    await page.getByLabel(/^current \(temporary\) password/i).fill(STRONG_PASSWORD);
    await page.getByLabel(/^new password/i).fill("weak");
    await page.getByLabel(/^confirm new password/i).fill("different");
    await page.getByRole("button", { name: /^save password$/i }).click();
    await expect(page.getByText("Passwords do not match.")).toBeVisible();
    await shot("change-password-validation");
    await page.getByRole("button", { name: /^log out$/i }).click();
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();

    // The shell with the profile menu open, for each role.
    for (const [slug, account] of [
      ["requester", ACCOUNTS.requesterA],
      ["it-staff", ACCOUNTS.staff1],
      ["administrator", ACCOUNTS.admin],
    ] as const) {
      await signIn(page, account.email);
      await page.getByRole("button", { name: /profile menu/i }).click();
      await expect(page.getByRole("button", { name: /^log out$/i })).toBeVisible();
      await shot(`shell-${slug}`);

      if (slug === "requester") {
        await page.getByRole("button", { name: /^change password$/i }).click();
        await expect(page.getByRole("heading", { name: /^change password$/i })).toBeVisible();
        await shot("change-password-voluntary");
        await page.getByRole("button", { name: /^cancel$/i }).click();
        await expect(page.getByRole("heading", { name: /^my tickets$/i })).toBeVisible();
        await logOut(page);
      } else {
        await page.getByRole("button", { name: /^log out$/i }).click();
        await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
      }
    }

    await expect(page.getByText("You have signed out.")).toBeVisible();
    await shot("signed-out");
  });
}

// ---------------------------------------------------------------------------
// VIS-02 — requester-tickets/
// ---------------------------------------------------------------------------

for (const [viewport, size] of VIEWPORT_LIST) {
  test(`VIS-02 — requester ticket screens at ${viewport} (${size.width}px)`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    const shot = (state: string) => snap(page, "requester-tickets", state, viewport);

    // A ticket with a Requester comment (including markup that must show literally) and a staff reply.
    const requester = await apiSession(ACCOUNTS.requesterA.email);
    const ticket = await createTicketViaApi(requester, `vis requester ${viewport}`, "HIGH");
    await requester.post(`/api/tickets/${ticket.id}/public-comments`, {
      data: { body: "The printer shows <b>Paper jam</b> even with the tray empty." },
    });
    await requester.dispose();
    const staff = await apiSession(ACCOUNTS.staff1.email);
    await staff.post(`/api/tickets/${ticket.id}/public-comments`, {
      data: { body: "Thanks — we are looking into the printer now." },
    });
    await staff.dispose();

    await signIn(page, ACCOUNTS.requesterA.email);
    await expect(page.getByTestId("ticket-rows")).toBeVisible();
    await expect(page.getByLabel(/development requester/i)).toHaveCount(0);
    await page.getByLabel(/^search$/i).fill(ticket.ticketNumber);
    await page.getByRole("button", { name: /^search$/i }).click();
    await expect(page.getByTestId("ticket-rows").getByRole("row")).toHaveCount(1);
    await shot("my-tickets");

    await page.getByRole("button", { name: new RegExp(ticket.ticketNumber) }).click();
    const thread = page.getByTestId("public-thread-list");
    await expect(thread).toContainText("<b>Paper jam</b>");
    await expect(thread.locator("b")).toHaveCount(0);
    await expect(thread).toContainText("IT Staff 1");
    await shot("ticket-detail-comments");

    await page.getByRole("button", { name: /^problem appears resolved$/i }).click();
    await expect(page.getByRole("dialog", { name: /report problem appears resolved/i })).toBeVisible();
    await shot("resolution-dialog");

    await page.getByLabel(/add a note/i).fill("Restarted the spooler and it works now.");
    await page.getByRole("button", { name: /^send report$/i }).click();
    await expect(page.getByText("Thanks — IT Staff have been notified.")).toBeVisible();
    await expect(page.getByText(/you reported that the problem appears resolved/i)).toBeVisible();
    await shot("resolution-reported");
  });
}

// ---------------------------------------------------------------------------
// VIS-03 — staff-queue/
// ---------------------------------------------------------------------------

const EMPTY_QUEUE = {
  data: [],
  meta: {
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0,
    counts: { active: 0, unassigned: 0, assignedToMe: 0 },
  },
};
const QUEUE_URL = "**/api/tickets/queue*";

for (const [viewport, size] of VIEWPORT_LIST) {
  test(`VIS-03 — staff queue screens at ${viewport} (${size.width}px)`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    const shot = (state: string) => snap(page, "staff-queue", state, viewport);

    const token = `vis queue ${viewport}`;
    const requester = await apiSession(ACCOUNTS.requesterA.email);
    await createTicketViaApi(requester, `${token} urgent`, "URGENT");
    await createTicketViaApi(requester, `${token} low`, "LOW");
    await createTicketViaApi(requester, `${token} high`, "HIGH");
    await requester.dispose();

    await signIn(page, ACCOUNTS.staff1.email);
    await gotoQueue(page);
    await expect(page.getByRole("button", { name: /^Active \(\d+\)$/ })).toHaveAttribute("aria-pressed", "true");
    await shot("active");

    await page.getByRole("button", { name: /^filters/i }).click();
    await expect(page.getByLabel(/^it priority$/i)).toBeVisible();
    await shot("filters-expanded");

    await page.getByLabel(/^sort by$/i).selectOption("itPriority");
    await page.getByLabel(/^order$/i).selectOption("desc");
    await expect(page.getByTestId("queue-rows").getByRole("row").first()).toContainText("IT: Urgent");
    await shot("sorted-it-priority");
    await page.getByRole("button", { name: /^hide filters/i }).click();

    // No results.
    await page.getByLabel(/^search$/i).fill("no-such-ticket-anywhere-xyz");
    await page.getByRole("button", { name: /^search$/i }).click();
    await expect(page.getByTestId("no-results-state")).toBeVisible();
    await shot("no-results");
    await page.getByTestId("no-results-state").getByRole("button", { name: /clear filters/i }).click();
    await expect(page.getByTestId("queue-rows")).toBeVisible();

    // One route handler drives the empty, failure and loading states.
    let mode: "pass" | "empty" | "fail" | "hold" = "pass";
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(QUEUE_URL, async (route) => {
      if (mode === "empty") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EMPTY_QUEUE) });
      } else if (mode === "fail") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } }),
        });
      } else if (mode === "hold") {
        await gate;
        await route.continue();
      } else {
        await route.continue();
      }
    });

    // Empty system: the All view with no tickets at all.
    mode = "empty";
    await page.getByRole("button", { name: /^all$/i }).click();
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await shot("empty");

    // Failure, with Retry.
    mode = "fail";
    await page.getByRole("button", { name: /^Unassigned \(/ }).click();
    await expect(page.getByRole("button", { name: /^retry$/i })).toBeVisible();
    await shot("failure");

    // Loading: hold the response until the screenshot is taken.
    mode = "hold";
    await page.getByRole("button", { name: /^retry$/i }).click();
    await expect(page.locator('[aria-busy="true"]')).toBeVisible();
    await shot("loading");
    mode = "pass";
    release();
    await expect(page.getByTestId("queue-rows").or(page.getByTestId("no-results-state"))).toBeVisible();
  });
}

// ---------------------------------------------------------------------------
// VIS-04 — staff-ticket-detail/
// ---------------------------------------------------------------------------

for (const [viewport, size] of VIEWPORT_LIST) {
  test(`VIS-04 — staff Ticket Detail screens at ${viewport} (${size.width}px)`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(size);
    const shot = (state: string, target: Page = page) => snap(target, "staff-ticket-detail", state, viewport);
    const operations = (target: Page) => target.getByRole("region", { name: /^ticket operations$/i });

    const ticket = await createTicketAs(ACCOUNTS.requesterB.email, `vis staff detail ${viewport}`, "HIGH");
    await signIn(page, ACCOUNTS.staff1.email);
    await openTicketFromQueue(page, ticket);

    // Unassigned: Claim and Assign.
    await expect(operations(page).getByRole("button", { name: /^claim ticket$/i })).toBeVisible();
    await shot("unassigned");

    // Owned: operations available.
    await operations(page).getByRole("button", { name: /^claim ticket$/i }).click();
    await expect(page.getByLabel("IT Priority", { exact: true })).toBeVisible();
    await shot("owned");

    // Status confirmation dialog.
    const status = page.getByLabel("Change status to", { exact: true });
    const update = operations(page).getByRole("button", { name: /^update status$/i });
    await status.selectOption({ label: "Open" });
    await update.click();
    await expect(page.getByTestId("detail-status")).toHaveText("Open");
    await status.selectOption({ label: "In Progress" });
    await update.click();
    await expect(page.getByTestId("detail-status")).toHaveText("In Progress");
    await status.selectOption({ label: "Resolved" });
    await update.click();
    await expect(page.getByRole("dialog", { name: /confirm resolved/i })).toBeVisible();
    await shot("confirm-dialog");
    await page.getByRole("button", { name: /^keep current status$/i }).click();

    // Public Comment and Internal Note posted.
    const publicSection = page.getByRole("region", { name: /^public comments$/i });
    await publicSection.getByLabel(/add a public comment/i).fill("We have restarted the print spooler. Please try again.");
    await publicSection.getByRole("button", { name: /^post public comment$/i }).click();
    await expect(page.getByTestId("public-thread-list")).toContainText("restarted the print spooler");
    await shot("comment-posted");

    const internal = page.getByRole("region", { name: /^internal notes$/i });
    await internal.getByLabel(/add an internal note/i).fill("Driver package looks corrupted; reinstall if it recurs.");
    await internal.getByRole("button", { name: /^post internal note$/i }).click();
    await expect(page.getByTestId("internal-thread-list")).toContainText("Driver package looks corrupted");
    await shot("note-posted");

    // Non-owner IT Staff see read-only ownership.
    const staff2 = await openSessionAs(browser, ACCOUNTS.staff2.email, size);
    await openTicketFromQueue(staff2.page, ticket);
    await expect(operations(staff2.page)).toContainText("Only the ticket owner or an administrator");
    await shot("non-owner-read-only", staff2.page);
    await staff2.context.close();

    // Stale conflict: the Administrator's copy is older than the owner's latest save.
    const admin = await openSessionAs(browser, ACCOUNTS.admin.email, size);
    await openTicketFromQueue(admin.page, ticket);
    await page.getByLabel("IT Priority", { exact: true }).selectOption("LOW");
    await operations(page).getByRole("button", { name: /^save it priority$/i }).click();
    await expect(operations(page).getByRole("status")).toContainText("IT Priority updated to LOW");

    await admin.page.getByLabel("IT Priority", { exact: true }).selectOption("URGENT");
    await operations(admin.page).getByRole("button", { name: /^save it priority$/i }).click();
    await expect(operations(admin.page).getByRole("alert")).toContainText(
      "This ticket changed since you opened it.",
    );
    await shot("stale-conflict", admin.page);
    await admin.context.close();
  });
}

// ---------------------------------------------------------------------------
// VIS-05 — user-management/
// ---------------------------------------------------------------------------

for (const [viewport, size] of VIEWPORT_LIST) {
  test(`VIS-05 — user management screens at ${viewport} (${size.width}px)`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(size);
    const shot = (state: string) => snap(page, "user-management", state, viewport);
    const createPanel = page.getByRole("region", { name: /^create new user$/i });
    const editPanel = page.getByRole("region", { name: /^edit user$/i });
    const userRow = (text: string) => page.getByTestId("user-rows").getByRole("row").filter({ hasText: text });

    const adminApi = await apiSession(ACCOUNTS.admin.email);
    const existing = await createUserViaApi(adminApi, `vis existing ${viewport}`);
    const target = await createUserViaApi(adminApi, `vis target ${viewport}`);
    const myId = await currentUserId(adminApi);

    await signIn(page, ACCOUNTS.admin.email);
    await expect(page.getByTestId("user-rows")).toBeVisible();
    await shot("list");

    // Search and role filter.
    await page.getByLabel(/^search$/i).fill("Requester");
    await page.getByRole("button", { name: /^search$/i }).click();
    await page.locator("#user-role-filter").selectOption({ label: "Requester" });
    await expect(userRow("requester-a@example.com")).toBeVisible();
    await expect(userRow("itstaff-1@example.com")).toHaveCount(0);
    await shot("search-filter");
    await page.getByRole("button", { name: /^clear$/i }).first().click();
    await expect(userRow("itstaff-1@example.com")).toBeVisible();

    // Create panel, then a duplicate email (different case).
    await page.getByRole("button", { name: /^create user$/i }).click();
    await expect(createPanel).toBeVisible();
    await shot("create-panel");

    await createPanel.getByLabel(/^full name/i).fill("E2E Duplicate");
    await createPanel.getByLabel(/^email address/i).fill(existing.email.toUpperCase());
    await createPanel.getByLabel(/^role/i).selectOption({ label: "Requester" });
    await createPanel.getByLabel(/^initial password/i).fill(STRONG_PASSWORD);
    await createPanel.getByLabel(/^confirm initial password/i).fill(STRONG_PASSWORD);
    await createPanel.getByRole("button", { name: /^save user$/i }).click();
    await expect(createPanel.getByText("This email is already used by another account.")).toBeVisible();
    await shot("duplicate-email");
    await createPanel.getByRole("button", { name: /^cancel$/i }).click();

    // Edit panel, then a new initial password.
    await page.getByLabel(/^search$/i).fill(target.email);
    await page.getByRole("button", { name: /^search$/i }).click();
    await userRow(target.email).getByRole("button", { name: /^edit/i }).click();
    await expect(editPanel.getByLabel(/^full name/i)).toHaveValue(target.name);
    await shot("edit-panel");

    const newPassword = "E2e-Reset-Pass2!";
    await editPanel.getByLabel("New Initial Password", { exact: true }).fill(newPassword);
    await editPanel.getByLabel("Confirm New Initial Password", { exact: true }).fill(newPassword);
    await editPanel.getByRole("button", { name: "Set New Initial Password" }).click();
    await page.getByRole("dialog", { name: /confirm new initial password/i }).getByRole("button", { name: /^confirm$/i }).click();
    await expect(editPanel.getByRole("status")).toContainText("has been signed out");
    await shot("initial-password-set");
    await editPanel.getByRole("button", { name: /^cancel$/i }).click();
    await page.getByRole("dialog", { name: /discard unsaved changes/i }).getByRole("button", { name: /^discard$/i }).click();
    await expect(editPanel).toHaveCount(0);

    // Own row: self-deactivation blocked, then the last-administrator banner.
    await page.getByRole("button", { name: /^clear$/i }).first().click();
    await userRow("(you)").getByRole("button", { name: /^edit/i }).click();
    await expect(editPanel.getByRole("switch", { name: /^active$/i })).toBeDisabled();
    await expect(editPanel).toContainText("You cannot deactivate your own account.");
    await shot("self-deactivation-blocked");

    await withSoleActiveAdministrator(adminApi, myId, async () => {
      await editPanel.getByLabel(/^role/i).selectOption({ label: "IT Staff" });
      await editPanel.getByRole("button", { name: /^save changes$/i }).click();
      await expect(editPanel.getByRole("alert")).toContainText("At least one active administrator is required");
      await shot("last-admin-blocked");
    });
    await adminApi.dispose();
  });
}

// ---------------------------------------------------------------------------
// VIS-coverage — the acceptance criterion: every screen at every size
// ---------------------------------------------------------------------------

const REQUIRED_SCREENSHOTS: Record<string, string[]> = {
  authentication: [
    "login-default",
    "login-validation",
    "login-invalid-credentials",
    "login-inactive",
    "login-throttled",
    "change-password-mandatory",
    "change-password-validation",
    "change-password-voluntary",
    "shell-requester",
    "shell-it-staff",
    "shell-administrator",
    "signed-out",
  ],
  "requester-tickets": ["my-tickets", "ticket-detail-comments", "resolution-dialog", "resolution-reported"],
  "staff-queue": ["active", "filters-expanded", "sorted-it-priority", "no-results", "empty", "failure", "loading"],
  "staff-ticket-detail": [
    "unassigned",
    "owned",
    "confirm-dialog",
    "comment-posted",
    "note-posted",
    "non-owner-read-only",
    "stale-conflict",
  ],
  "user-management": [
    "list",
    "search-filter",
    "create-panel",
    "duplicate-email",
    "edit-panel",
    "initial-password-set",
    "self-deactivation-blocked",
    "last-admin-blocked",
  ],
};

test("VIS-coverage — every required screen was captured at desktop, tablet and mobile in this run", async () => {
  const runStarted = Number(process.env.E2E_RUN_STARTED ?? 0);
  const missing: string[] = [];

  for (const [folder, states] of Object.entries(REQUIRED_SCREENSHOTS)) {
    for (const state of states) {
      for (const [viewport] of VIEWPORT_LIST) {
        const file = path.join(SCREENSHOT_ROOT, folder, `${viewport}-${state}.png`);
        const stat = await fs.stat(file).catch(() => null);
        if (!stat || stat.size < 2_000 || stat.mtimeMs < runStarted) {
          missing.push(`${folder}/${viewport}-${state}.png`);
        }
      }
    }
  }

  expect(missing, "screenshots missing, empty, or left over from an earlier run").toEqual([]);
});
