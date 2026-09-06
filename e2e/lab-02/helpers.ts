import { expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Shared helpers for the Lab 2 end-to-end and responsive/visual suites.

export const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 820, height: 1024 },
  mobile: { width: 390, height: 844 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

/** Marks rows created by the E2E suites so cleanup can find them. */
export const TAG = "E2E";

export function uniqueSummary(label: string): string {
  return `${TAG} ${label} ${Date.now().toString(36)}`;
}

export const DESCRIPTION =
  "Created by the Lab 2 end-to-end suite to exercise the requester journey.";

/** Where the required visual evidence is written (ui-spec.md §11). */
export const SCREENSHOT_ROOT = path.resolve(
  process.cwd(),
  "artifacts/lab-02/screenshots",
);

/**
 * Saves a full-page screenshot to
 * artifacts/lab-02/screenshots/<screen>/<viewport>.png.
 */
export async function captureScreen(
  page: Page,
  screen: string,
  viewport: ViewportName,
) {
  const dir = path.join(SCREENSHOT_ROOT, screen);
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({
    path: path.join(dir, `${viewport}.png`),
    fullPage: true,
  });
}

/**
 * Chooses the option whose text contains `name`. The visible label is
 * "<name> — <department>", so an exact-label match would not find it.
 */
export async function chooseRequesterOption(page: Page, name: string) {
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
export async function selectRequester(page: Page, name: string) {
  await page.goto("/");
  await chooseRequesterOption(page, name);
}

/** Navigates to Create Ticket through the shell nav. */
export async function gotoCreateTicket(page: Page) {
  await page
    .getByRole("navigation", { name: /main/i })
    .getByRole("button", { name: /create ticket/i })
    .click();
  await expect(page.getByRole("form", { name: /create ticket/i })).toBeVisible();
}

/** Navigates to My Tickets through the shell nav. */
export async function gotoMyTickets(page: Page) {
  await page
    .getByRole("navigation", { name: /main/i })
    .getByRole("button", { name: /my tickets/i })
    .click();
  await expect(page.getByRole("heading", { name: /my tickets/i })).toBeVisible();
}

/** Fills the Create Ticket form without submitting. */
export async function fillCreateTicketForm(page: Page, summary: string) {
  await page.getByLabel(/^category/i).selectOption({ index: 1 });
  await page.getByLabel(/related system/i).selectOption({ index: 1 });
  await page.getByLabel(/ticket summary/i).fill(summary);
  await page.getByLabel(/requested priority/i).selectOption("MEDIUM");
  await page.getByLabel(/^description/i).fill(DESCRIPTION);
}

/** Fills and submits Create Ticket, returning the official Ticket Number. */
export async function createTicket(page: Page, summary: string): Promise<string> {
  await gotoCreateTicket(page);
  await fillCreateTicketForm(page, summary);

  await page
    .getByRole("form", { name: /create ticket/i })
    .getByRole("button", { name: /^create ticket$/i })
    .click();

  const number = page.getByTestId("created-ticket-number");
  await expect(number).toBeVisible();
  return ((await number.textContent()) ?? "").trim();
}

/** Opens Ticket Detail from the My Tickets list. */
export async function openTicket(page: Page, ticketNumber: string) {
  await gotoMyTickets(page);
  await page.getByLabel(/^search$/i).fill(ticketNumber);
  await page.getByRole("button", { name: /^search$/i }).click();
  await page.getByRole("button", { name: new RegExp(ticketNumber) }).click();
  await expect(page.getByTestId("detail-ticket-number")).toHaveText(ticketNumber);
}

/** Writes a small valid PNG to a temp file for upload. */
export async function makePngFile(name: string): Promise<string> {
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

// ---------------------------------------------------------------------------
// Layout checks — AC-24
// ---------------------------------------------------------------------------

/** The page itself must never scroll sideways. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  // Allow a single pixel for sub-pixel rounding.
  expect(overflow, "the page scrolls horizontally").toBeLessThanOrEqual(1);
}

/**
 * Fails when an element's own content is wider than its box — the signature
 * of clipped text such as a truncated label or attachment filename.
 *
 * Elements that scroll on purpose (the ticket table's container) are exempt
 * because overflow there is a deliberate, usable affordance.
 */
export async function expectNotClipped(locator: Locator, description: string) {
  await expect(locator, `${description} is not visible`).toBeVisible();

  const result = await locator.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return {
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      text: (el.textContent ?? "").trim().slice(0, 60),
    };
  });

  if (result.overflowX !== "auto" && result.overflowX !== "scroll") {
    expect(
      result.scrollWidth - result.clientWidth,
      `${description} is clipped horizontally ("${result.text}")`,
    ).toBeLessThanOrEqual(1);
  }
  if (result.overflowY !== "auto" && result.overflowY !== "scroll") {
    expect(
      result.scrollHeight - result.clientHeight,
      `${description} is clipped vertically ("${result.text}")`,
    ).toBeLessThanOrEqual(1);
  }
}

/** Fails when an element sits outside the viewport horizontally. */
export async function expectWithinViewport(
  page: Page,
  locator: Locator,
  description: string,
) {
  const box = await locator.boundingBox();
  expect(box, `${description} has no layout box`).not.toBeNull();

  const viewport = page.viewportSize()!;
  expect(box!.x, `${description} starts left of the viewport`).toBeGreaterThanOrEqual(-1);
  expect(
    box!.x + box!.width,
    `${description} extends past the right edge of the viewport`,
  ).toBeLessThanOrEqual(viewport.width + 1);
}

/**
 * Fails when any two of the given elements overlap. Use it on a curated set of
 * siblings that must never sit on top of one another — controls, labels,
 * buttons — not on nested elements, which legitimately contain each other.
 */
export async function expectNoOverlap(
  entries: Array<{ locator: Locator; name: string }>,
) {
  const boxes: Array<{ name: string; box: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>> }> =
    [];

  for (const entry of entries) {
    const box = await entry.locator.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      boxes.push({ name: entry.name, box });
    }
  }

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      // A one-pixel tolerance absorbs adjacent borders meeting exactly.
      const overlapX =
        Math.min(a.box.x + a.box.width, b.box.x + b.box.width) -
        Math.max(a.box.x, b.box.x);
      const overlapY =
        Math.min(a.box.y + a.box.height, b.box.y + b.box.height) -
        Math.max(a.box.y, b.box.y);

      const overlaps = overlapX > 1 && overlapY > 1;
      expect(overlaps, `${a.name} overlaps ${b.name}`).toBe(false);
    }
  }
}

/** Touch targets must stay comfortably tappable (ui-spec.md §9). */
export async function expectTouchFriendly(locator: Locator, description: string) {
  const box = await locator.boundingBox();
  expect(box, `${description} has no layout box`).not.toBeNull();
  expect(
    box!.height,
    `${description} is too short to tap comfortably`,
  ).toBeGreaterThanOrEqual(32);
}
