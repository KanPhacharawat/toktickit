import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authApi from "../../src/authApi.js";
import { REQUESTER, apiError, renderApp } from "./authTestUtils.js";

// UI-05 – UI-08 (tests.md §2) — Change Password in both modes.

const MUST_CHANGE = { ...REQUESTER, mustChangePassword: true };

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function openMandatory() {
  renderApp(MUST_CHANGE);
  await screen.findByRole("heading", { name: /change your password/i });
  return fields();
}

function fields() {
  return {
    current: screen.getByLabelText(/^current/i),
    next: screen.getByLabelText(/^new password/i),
    confirm: screen.getByLabelText(/^confirm new password/i),
    save: screen.getByRole("button", { name: /save password/i }),
  };
}

function rule(id: string) {
  return within(screen.getByTestId("password-rules")).getAllByRole("listitem").find(
    (item) => item.getAttribute("data-rule") === id,
  )!;
}

function setValue(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe("UI-05 — password checklist (AC-09)", () => {
  it("tracks the length boundaries 7 / 8 / 72 / 73", async () => {
    const { next } = await openMandatory();
    const pad = (length: number) => "Aa1!" + "x".repeat(length - 4);

    setValue(next, pad(7));
    expect(rule("length")).toHaveAttribute("data-met", "false");
    expect(rule("length")).toHaveTextContent("not met");

    setValue(next, pad(8));
    expect(rule("length")).toHaveAttribute("data-met", "true");
    expect(rule("length")).toHaveTextContent("— met");

    setValue(next, pad(72));
    expect(rule("length")).toHaveAttribute("data-met", "true");

    setValue(next, pad(73));
    expect(rule("length")).toHaveAttribute("data-met", "false");
  });

  it("marks each missing character class", async () => {
    const { next } = await openMandatory();

    setValue(next, "lowercase-only1");
    expect(rule("case")).toHaveAttribute("data-met", "false");

    setValue(next, "NoNumberHere!");
    expect(rule("numberSpecial")).toHaveAttribute("data-met", "false");

    setValue(next, "NoSpecial123");
    expect(rule("numberSpecial")).toHaveAttribute("data-met", "false");

    setValue(next, "Complete-Pass1");
    expect(rule("case")).toHaveAttribute("data-met", "true");
    expect(rule("numberSpecial")).toHaveAttribute("data-met", "true");
  });

  it("marks a password equal to the email or the current password", async () => {
    const { current, next } = await openMandatory();

    setValue(next, "PAT@example.com");
    expect(rule("notEmail")).toHaveAttribute("data-met", "false");

    setValue(current, "Same-Pass1!");
    setValue(next, "Same-Pass1!");
    expect(rule("different")).toHaveAttribute("data-met", "false");
  });
});

describe("UI-06 — change-password errors (AC-09, AC-59)", () => {
  it("blocks the request when the confirmation does not match", async () => {
    const change = vi.spyOn(authApi, "changePassword");
    const user = userEvent.setup();
    const { current, next, confirm, save } = await openMandatory();

    setValue(current, "Initial-Pass1!");
    setValue(next, "Brand-New-Pass2?");
    setValue(confirm, "Brand-New-Pass2");
    await user.click(save);

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });

  it("blocks the request while a rule is unmet", async () => {
    const change = vi.spyOn(authApi, "changePassword");
    const user = userEvent.setup();
    const { current, next, confirm, save } = await openMandatory();

    setValue(current, "Initial-Pass1!");
    setValue(next, "short1!");
    setValue(confirm, "short1!");
    await user.click(save);

    expect(screen.getByText(/does not meet every rule/i)).toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });

  it("shows a server field error beside Current password", async () => {
    vi.spyOn(authApi, "changePassword").mockRejectedValue(
      apiError(400, "VALIDATION_ERROR", "Invalid", {
        currentPassword: "Current password is incorrect.",
      }),
    );
    const user = userEvent.setup();
    const { current, next, confirm, save } = await openMandatory();

    setValue(current, "Wrong-Pass1!");
    setValue(next, "Brand-New-Pass2?");
    setValue(confirm, "Brand-New-Pass2?");
    await user.click(save);

    const message = await screen.findByText("Current password is incorrect.");
    expect(current).toHaveAttribute("aria-describedby", message.id);
    expect(current).toHaveValue("Wrong-Pass1!");
  });

  it("keeps every value when the server fails", async () => {
    vi.spyOn(authApi, "changePassword").mockRejectedValue(
      apiError(500, "INTERNAL_ERROR", "Could not change the password. Please try again."),
    );
    const user = userEvent.setup();
    const { current, next, confirm, save } = await openMandatory();

    setValue(current, "Initial-Pass1!");
    setValue(next, "Brand-New-Pass2?");
    setValue(confirm, "Brand-New-Pass2?");
    await user.click(save);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not change the password");
    expect(current).toHaveValue("Initial-Pass1!");
    expect(next).toHaveValue("Brand-New-Pass2?");
    expect(confirm).toHaveValue("Brand-New-Pass2?");
  });
});

describe("UI-07 — mandatory mode (AC-02, AC-10)", () => {
  it("shows only the minimal header, the warning, and no way around the change", async () => {
    await openMandatory();

    expect(screen.getByText(/you must change your password before continuing/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByTestId("signed-in-user")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/development requester/i)).not.toBeInTheDocument();
  });

  it("enters the application after a successful change", async () => {
    const change = vi
      .spyOn(authApi, "changePassword")
      .mockResolvedValue({ ...MUST_CHANGE, mustChangePassword: false });
    const user = userEvent.setup();
    const { current, next, confirm, save } = await openMandatory();

    setValue(current, "Initial-Pass1!");
    setValue(next, "Brand-New-Pass2?");
    setValue(confirm, "Brand-New-Pass2?");
    await user.click(save);

    expect(change).toHaveBeenCalledWith("Initial-Pass1!", "Brand-New-Pass2?");
    expect(await screen.findByTestId("signed-in-user")).toHaveTextContent("Pat Requester");
    expect(screen.getByText("Your password has been changed.").closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByRole("heading", { name: /change your password/i })).not.toBeInTheDocument();
  });
});

describe("UI-08 — voluntary mode (AC-11)", () => {
  async function openVoluntary() {
    const user = userEvent.setup();
    renderApp(REQUESTER);
    await user.click(await screen.findByRole("button", { name: /profile menu/i }));
    await user.click(screen.getByRole("button", { name: /^change password$/i }));
    await screen.findByRole("heading", { name: /^change password$/i });
    return { user, ...fields() };
  }

  it("keeps the shell and returns with Cancel", async () => {
    const { user } = await openVoluntary();

    expect(screen.getByTestId("signed-in-user")).toHaveTextContent("Pat Requester");
    expect(screen.queryByText(/you must change your password/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /^change password$/i })).not.toBeInTheDocument(),
    );
  });

  it("returns to the application with a success message", async () => {
    vi.spyOn(authApi, "changePassword").mockResolvedValue(REQUESTER);
    const { user, current, next, confirm, save } = await openVoluntary();

    setValue(current, "Old-Pass1!");
    setValue(next, "Voluntary-Pass4$");
    setValue(confirm, "Voluntary-Pass4$");
    await user.click(save);

    expect(await screen.findByText("Your password has been changed.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^change password$/i })).not.toBeInTheDocument();
  });
});
