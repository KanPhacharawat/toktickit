import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App.js";
import * as authApi from "../../src/authApi.js";
import { STAFF, apiError, renderApp, stubLab2Screens } from "./authTestUtils.js";

// UI-09, UI-11 (tests.md §3) — signed-in identity, profile menu, and logout.
// Role navigation (UI-10) arrives with the Authorization middleware issue.

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UI-09 — shell identity and profile menu (AC-18)", () => {
  it("shows the signed-in name and role in the header", async () => {
    renderApp(STAFF);

    expect(await screen.findByTestId("signed-in-user")).toHaveTextContent("Sam Staff");
    expect(screen.getByTestId("signed-in-role")).toHaveTextContent("IT Staff");
  });

  it("opens with name, email, role, Change Password, and Log Out, and closes on Escape", async () => {
    const user = userEvent.setup();
    renderApp(STAFF);

    const toggle = await screen.findByRole("button", { name: /profile menu/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const menu = document.getElementById("profile-menu")!;
    expect(menu).toHaveTextContent("sam@example.com");
    expect(menu).toHaveTextContent("IT Staff");
    expect(screen.getByRole("button", { name: /^change password$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^log out$/i })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("profile-menu")).toBeNull();
    expect(toggle).toHaveFocus();
  });
});

describe("UI-11 — logout (AC-13)", () => {
  it("shows the busy state, then returns to Login with a signed-out notice", async () => {
    let finish: () => void = () => {};
    const logout = vi
      .spyOn(authApi, "logout")
      .mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    renderApp(STAFF);

    await user.click(await screen.findByRole("button", { name: /profile menu/i }));
    await user.click(screen.getByRole("button", { name: /^log out$/i }));

    expect(screen.getByRole("button", { name: /signing out/i })).toBeDisabled();
    expect(logout).toHaveBeenCalledTimes(1);

    await act(async () => finish());

    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("You have signed out.");
    expect(screen.queryByTestId("signed-in-user")).not.toBeInTheDocument();
  });

  it("still leaves the application when the server cannot be reached", async () => {
    vi.spyOn(authApi, "logout").mockRejectedValue(apiError(0, "NETWORK_ERROR"));
    const user = userEvent.setup();
    renderApp(STAFF);

    await user.click(await screen.findByRole("button", { name: /profile menu/i }));
    await user.click(screen.getByRole("button", { name: /^log out$/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument());
    expect(screen.queryByTestId("signed-in-user")).not.toBeInTheDocument();
  });
});

describe("Session check", () => {
  it("shows a checking state, then a retry when the server is unreachable", async () => {
    const user = userEvent.setup();
    const check = vi
      .spyOn(authApi, "fetchCurrentUser")
      .mockRejectedValueOnce(apiError(0, "NETWORK_ERROR"))
      .mockResolvedValueOnce(null);
    stubLab2Screens();
    render(<App />);

    expect(screen.getByText(/checking your session/i)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /retry/i }));

    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(check).toHaveBeenCalledTimes(2);
  });
});
