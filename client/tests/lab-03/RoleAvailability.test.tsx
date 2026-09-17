import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REQUESTER, STAFF, renderApp } from "./authTestUtils.js";

// UI-10 (tests.md §3), the part of role navigation this issue can deliver:
// server-side role gating is now real, so a non-Requester must not land on
// the Requester screens (which would just be a wall of 403s). Full
// per-screen navigation (Queue, User Management) arrives with those issues.

const ADMIN = { ...STAFF, id: 3, name: "Ada Admin", role: "Administrator" as const };

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Role availability after sign-in (AC-18)", () => {
  it("shows the Requester screens for a Requester", async () => {
    renderApp(REQUESTER);

    expect(await screen.findByTestId("signed-in-user")).toHaveTextContent("Pat Requester");
    expect(screen.queryByText(/nothing to show yet/i)).not.toBeInTheDocument();
  });

  it.each([
    ["IT Staff", STAFF],
    ["Administrator", ADMIN],
  ] as const)("shows a placeholder, not the Requester screens, for %s", async (_label, user) => {
    renderApp(user);

    expect(await screen.findByTestId("signed-in-user")).toHaveTextContent(user.name);
    const heading = screen.getByRole("heading", { name: /nothing to show yet/i });
    expect(heading).toBeInTheDocument();
    expect(heading.closest("main")).toHaveTextContent(user.name);

    // No Requester screen content anywhere.
    expect(screen.queryByRole("heading", { name: /my tickets/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /create ticket/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/development requester/i)).not.toBeInTheDocument();
  });

  it("still shows the shell (name, role, profile menu) on the placeholder", async () => {
    renderApp(STAFF);

    expect(await screen.findByTestId("signed-in-role")).toHaveTextContent("IT Staff");
    expect(screen.getByRole("button", { name: /profile menu/i })).toBeInTheDocument();
  });
});
