import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REQUESTER, STAFF, renderApp } from "./authTestUtils.js";

// Role navigation after sign-in (AC-18) — IT Staff and Administrators land
// on the Ticket Queue instead of a placeholder, now that it exists.

const ADMIN = { ...STAFF, id: 3, name: "Ada Admin", role: "Administrator" as const };

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Role navigation after sign-in (AC-18)", () => {
  it("shows the Requester screens for a Requester", async () => {
    renderApp(REQUESTER);

    expect(await screen.findByTestId("signed-in-user")).toHaveTextContent("Pat Requester");
    expect(screen.queryByRole("heading", { name: /ticket queue/i })).not.toBeInTheDocument();
  });

  it.each([
    ["IT Staff", STAFF],
    ["Administrator", ADMIN],
  ] as const)("shows the Ticket Queue, not the Requester screens, for %s", async (_label, user) => {
    renderApp(user);

    expect(await screen.findByTestId("signed-in-user")).toHaveTextContent(user.name);
    expect(await screen.findByRole("heading", { name: /ticket queue/i })).toBeInTheDocument();

    // No Requester screen content anywhere.
    expect(screen.queryByRole("heading", { name: /my tickets/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /create ticket/i })).not.toBeInTheDocument();
  });

  it("shows the shell (name, role, profile menu) and a Ticket Queue nav item", async () => {
    renderApp(STAFF);

    expect(await screen.findByTestId("signed-in-role")).toHaveTextContent("IT Staff");
    expect(screen.getByRole("button", { name: /profile menu/i })).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: /main/i }),
    ).toHaveTextContent("Ticket Queue");
  });
});
