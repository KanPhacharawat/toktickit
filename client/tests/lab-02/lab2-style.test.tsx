import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Lab2App from "../../src/Lab2App.js";
import * as api from "../../src/api.js";

// UI Style tests — STYLE-01, STYLE-02, STYLE-03.
//
// jsdom does not apply the stylesheet, so these assert the *contract* the
// stylesheet keys off: the Zen Green class hooks, required markers, error
// wiring, focusability, and disabled state. The rendered colours themselves
// are checked against ui-spec.md §1 by reading the token declarations out of
// theme.css directly. jsdom stubs CSS imports, so it is read from disk.
import { readFileSync } from "node:fs";
import path from "node:path";

const THEME_CSS = readFileSync(
  path.resolve(process.cwd(), "src/theme.css"),
  "utf8",
);

const REQUESTERS: api.DevelopmentRequester[] = [
  { id: 11, name: "Alpha Requester", email: "alpha@example.com", department: "Finance" },
];

const CATEGORIES: api.ReferenceItem[] = [{ id: 7, name: "Hardware" }];
const SYSTEMS: api.ReferenceItem[] = [{ id: 21, name: "Corporate Laptop" }];

function mockShell() {
  vi.spyOn(api, "fetchActiveRequesters").mockResolvedValue(REQUESTERS);
  vi.spyOn(api, "fetchCategories").mockResolvedValue(CATEGORIES);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(SYSTEMS);
  vi.spyOn(api, "fetchMyTickets").mockResolvedValue({
    data: [],
    meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
  });
}

async function openCreateTicket(user: ReturnType<typeof userEvent.setup>) {
  render(<Lab2App />);

  await user.selectOptions(
    await screen.findByLabelText(/development requester/i),
    screen.getByRole("option", { name: /Alpha Requester/ }),
  );
  await user.click(screen.getByRole("button", { name: /continue/i }));

  const nav = screen.getByRole("navigation", { name: /main/i });
  await user.click(within(nav).getByRole("button", { name: /create ticket/i }));

  return screen.findByRole("form", { name: /create ticket/i });
}

function submitButton() {
  return within(
    screen.getByRole("form", { name: /create ticket/i }),
  ).getByRole("button", { name: /creat(e|ing) ticket/i });
}

describe("STYLE-01 — Zen Green controls (AC-24, AC-25)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockShell();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("declares the required Zen Green palette from ui-spec.md §1", () => {
    // Primary, secondary, pale, background, surface.
    expect(THEME_CSS).toMatch(/--zen-primary:\s*#006[bB]3[cC]/);
    expect(THEME_CSS).toMatch(/--zen-secondary:\s*#0[bB]7[aA]46/);
    expect(THEME_CSS).toMatch(/--zen-pale:\s*#[eE][aA][fF]6[eE][fF]/);
    expect(THEME_CSS).toMatch(/--zen-background:\s*#[fF]5[fF]7[fF]6/);
    expect(THEME_CSS).toMatch(/--zen-surface:\s*#[fF]{6}/);
    // Error, warning, success are declared as their own tokens.
    expect(THEME_CSS).toMatch(/--zen-error:/);
    expect(THEME_CSS).toMatch(/--zen-warning:/);
    expect(THEME_CSS).toMatch(/--zen-success:/);
  });

  it("gives every required field a visible label above its control", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);

    for (const label of [
      /^category/i,
      /related system/i,
      /ticket summary/i,
      /requested priority/i,
      /^description/i,
    ]) {
      const field = screen.getByLabelText(label);
      const labelElement = document.querySelector(`label[for="${field.id}"]`);
      expect(labelElement).not.toBeNull();
      // The label precedes its control in the document.
      expect(
        labelElement!.compareDocumentPosition(field) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("marks required fields with an asterisk AND text (AC-25)", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);

    for (const label of [
      /^category/i,
      /related system/i,
      /ticket summary/i,
      /requested priority/i,
      /^description/i,
    ]) {
      const field = screen.getByLabelText(label);
      const labelElement = document.querySelector(`label[for="${field.id}"]`)!;

      const asterisk = labelElement.querySelector(".zen-required");
      expect(asterisk).not.toBeNull();
      expect(asterisk!.textContent).toContain("*");
      // The asterisk is decorative; the word "required" carries the meaning,
      // so it is never colour-only.
      expect(asterisk).toHaveAttribute("aria-hidden", "true");
      expect(labelElement.textContent).toMatch(/required/i);
    }
  });

  it("styles the primary action with the Zen Green primary button", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);

    expect(submitButton()).toHaveClass("zen-btn-primary");
    expect(THEME_CSS).toMatch(
      /\.zen-btn-primary\s*\{[^}]*background-color:\s*var\(--zen-primary\)/,
    );
  });

  it("gives disabled controls a distinct declared appearance", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);

    // Reference data has loaded, so Submit is enabled here; the disabled rule
    // is what STYLE-01 requires to exist.
    expect(THEME_CSS).toMatch(/\.zen-btn-primary:disabled\s*\{/);
    expect(THEME_CSS).toMatch(/cursor:\s*not-allowed/);
  });

  it("keeps keyboard focus visible on interactive controls (AC-25)", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);

    // Focus rings are declared, not removed.
    expect(THEME_CSS).toMatch(/:focus-visible\s*\{[^}]*outline:/);
    expect(THEME_CSS).not.toMatch(/outline:\s*none/);

    // And the controls are actually reachable by keyboard.
    const summary = screen.getByLabelText(/ticket summary/i);
    summary.focus();
    expect(summary).toHaveFocus();
  });

  it("shows the submit button in a busy, disabled state while submitting (AC-09)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "createTicket").mockReturnValue(
      new Promise<api.CreatedTicket>(() => {}),
    );

    await openCreateTicket(user);

    await user.selectOptions(screen.getByLabelText(/^category/i), "7");
    await user.selectOptions(screen.getByLabelText(/related system/i), "21");
    await user.type(
      screen.getByLabelText(/ticket summary/i),
      "Laptop battery drains quickly",
    );
    await user.selectOptions(screen.getByLabelText(/requested priority/i), "LOW");
    await user.type(
      screen.getByLabelText(/^description/i),
      "The battery reaches zero within about an hour of use.",
    );
    await user.click(submitButton());

    const button = submitButton();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    // Busy state is conveyed by text, not by colour alone.
    expect(button).toHaveTextContent(/creating/i);
  });
});

describe("STYLE-02 — validation presentation (AC-07)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockShell();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("puts the error message directly after its field and links them", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);
    await user.click(submitButton());

    const summary = await screen.findByLabelText(/ticket summary/i);

    // Marked invalid for assistive technology.
    expect(summary).toHaveAttribute("aria-invalid", "true");

    // The message is programmatically associated with the field...
    const describedBy = summary.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const message = document.getElementById(describedBy!);
    expect(message).not.toBeNull();
    expect(message!.textContent).toMatch(/summary is required/i);

    // ...and it sits beside the field, inside the same field group.
    expect(summary.parentElement).toBe(message!.parentElement);
  });

  it("gives the invalid control the error border class", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);
    await user.click(submitButton());

    const summary = await screen.findByLabelText(/ticket summary/i);
    expect(summary).toHaveClass("zen-invalid");

    // Dark-red border, per ui-spec.md §1.
    expect(THEME_CSS).toMatch(
      /\.zen-invalid[^{]*\{[^}]*border-color:\s*var\(--zen-error\)/,
    );
  });

  it("states the error in text, not by colour alone (AC-25)", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);
    await user.click(submitButton());

    const message = await screen.findByText(/summary is required/i);
    expect(message).toHaveClass("zen-error-text");
    expect(message.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("clears the error styling once the field is corrected", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);
    await user.click(submitButton());

    const summary = await screen.findByLabelText(/ticket summary/i);
    expect(summary).toHaveClass("zen-invalid");

    await user.type(summary, "A");
    expect(summary).not.toHaveClass("zen-invalid");
    expect(summary).not.toHaveAttribute("aria-invalid");
  });
});

describe("STYLE-03 — read-only fields (AC-06)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockShell();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders system-generated fields as read-only and visually distinct", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);

    for (const label of [/ticket number/i, /ticket date/i, /^requester/i]) {
      const field = screen.getByLabelText(label);
      expect(field).toHaveAttribute("readonly");
      // A distinct class from the editable fields.
      expect(field).toHaveClass("zen-readonly-field");
      expect(field).not.toHaveClass("zen-input");
    }
  });

  it("declares a read-only background different from the editable surface", () => {
    // Soft gray-green read-only vs white editable, per ui-spec.md §1.
    expect(THEME_CSS).toMatch(
      /\.zen-readonly-field\s*\{[^}]*background-color:\s*var\(--zen-readonly\)/,
    );
    expect(THEME_CSS).toMatch(
      /\.zen-input\s*\{[^}]*background-color:\s*var\(--zen-surface\)/,
    );
    expect(THEME_CSS).toMatch(/--zen-readonly:\s*#[0-9a-fA-F]{6}/);
  });

  it("keeps read-only fields out of the tab order", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);

    for (const label of [/ticket number/i, /ticket date/i, /^requester/i]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("tabindex", "-1");
    }
  });

  it("does not let the user edit a system-generated value", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);

    const ticketNumber = screen.getByLabelText(/ticket number/i);
    const before = (ticketNumber as HTMLInputElement).value;
    await user.type(ticketNumber, "HACKED");

    expect((ticketNumber as HTMLInputElement).value).toBe(before);
  });
});
