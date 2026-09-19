import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authApi from "../../src/authApi.js";
import { REQUESTER, apiError, renderApp } from "./authTestUtils.js";

// UI-01 – UI-04 (tests.md §2) — Login screen.

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function openLogin() {
  renderApp(null);
  const email = await screen.findByLabelText(/^email/i);
  const password = screen.getByLabelText(/^password/i);
  const submit = screen.getByRole("button", { name: /sign in/i });
  return { email, password, submit };
}

describe("UI-01 — Login validation and controls (AC-08, AC-61)", () => {
  it("shows the login form first when there is no session, with focus on Email", async () => {
    const { email } = await openLogin();
    expect(screen.getByRole("heading", { name: "TokTickIT" })).toBeInTheDocument();
    expect(screen.getByText(/sign in to your account/i)).toBeInTheDocument();
    await waitFor(() => expect(email).toHaveFocus());
    // No self-registration, password reset, or requester selector.
    expect(screen.queryByText(/forgot/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/development requester/i)).not.toBeInTheDocument();
  });

  it("shows field messages and does not call the API for empty fields", async () => {
    const login = vi.spyOn(authApi, "login");
    const user = userEvent.setup();
    const { submit } = await openLogin();

    await user.click(submit);

    expect(screen.getByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("rejects a malformed email beside the field", async () => {
    const login = vi.spyOn(authApi, "login");
    const user = userEvent.setup();
    const { email, password, submit } = await openLogin();

    await user.type(email, "not-an-email");
    await user.type(password, "Anything1!");
    await user.click(submit);

    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", "login-email-error");
    expect(login).not.toHaveBeenCalled();
  });

  it("toggles password visibility with aria-pressed", async () => {
    const user = userEvent.setup();
    const { password } = await openLogin();
    const toggle = screen.getByRole("button", { name: /show password/i });

    expect(password).toHaveAttribute("type", "password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: /hide password/i })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("UI-02 — Login busy state (AC-08)", () => {
  it("disables Sign In while the request is pending and ignores a second submit", async () => {
    let resolve: (value: authApi.CurrentUser) => void = () => {};
    const login = vi
      .spyOn(authApi, "login")
      .mockImplementation(() => new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    const { email, password, submit } = await openLogin();

    await user.type(email, "pat@example.com");
    await user.type(password, "Correct-Pass1!");
    await user.click(submit);

    const busy = screen.getByRole("button", { name: /signing in/i });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");

    fireEvent.submit(busy.closest("form")!);
    expect(login).toHaveBeenCalledTimes(1);

    await act(async () => resolve(REQUESTER));
  });
});

describe("UI-03 — Login failure feedback (AC-05, AC-06, AC-07, AC-59)", () => {
  async function submitWith(error: unknown) {
    vi.spyOn(authApi, "login").mockRejectedValue(error);
    const user = userEvent.setup();
    const fields = await openLogin();
    await user.type(fields.email, "pat@example.com");
    await user.type(fields.password, "Wrong-Pass1!");
    await user.click(fields.submit);
    return fields;
  }

  it("shows the generic message, clears the password, keeps the email, and focuses Password on 401", async () => {
    const { email, password } = await submitWith(apiError(401, "INVALID_CREDENTIALS"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid email or password. Please try again.",
    );
    expect(password).toHaveValue("");
    expect(email).toHaveValue("pat@example.com");
    expect(password).toHaveFocus();
  });

  it("shows the inactive-account message on 403", async () => {
    await submitWith(apiError(403, "ACCOUNT_INACTIVE"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This account cannot sign in. Contact your administrator.",
    );
  });

  it("shows the throttling warning on 429", async () => {
    await submitWith(apiError(429, "TOO_MANY_ATTEMPTS"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many sign-in attempts. Try again in 15 minutes.",
    );
  });

  it("shows a safe message when the server cannot be reached", async () => {
    const { email } = await submitWith(apiError(0, "NETWORK_ERROR", "fetch failed at 127.0.0.1"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not reach the server. Please try again.");
    expect(alert).not.toHaveTextContent("127.0.0.1");
    expect(email).toHaveValue("pat@example.com");
    expect(screen.getByRole("button", { name: /sign in/i })).toBeEnabled();
  });
});

describe("UI-04 — Login success routing (AC-01, AC-02)", () => {
  it("opens the application with the signed-in name and role", async () => {
    vi.spyOn(authApi, "login").mockResolvedValue(REQUESTER);
    const user = userEvent.setup();
    const { email, password, submit } = await openLogin();

    await user.type(email, "pat@example.com");
    await user.type(password, "Correct-Pass1!");
    await user.click(submit);

    expect(await screen.findByTestId("signed-in-user")).toHaveTextContent("Pat Requester");
    expect(screen.getByTestId("signed-in-role")).toHaveTextContent("Requester");
    expect(screen.queryByRole("form", { name: /sign in/i })).not.toBeInTheDocument();
  });

  it("goes to the mandatory password change when the password must be changed", async () => {
    vi.spyOn(authApi, "login").mockResolvedValue({ ...REQUESTER, mustChangePassword: true });
    const user = userEvent.setup();
    const { email, password, submit } = await openLogin();

    await user.type(email, "pat@example.com");
    await user.type(password, "Initial-Pass1!");
    await user.click(submit);

    expect(await screen.findByRole("heading", { name: /change your password/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("signed-in-user")).not.toBeInTheDocument());
  });
});
