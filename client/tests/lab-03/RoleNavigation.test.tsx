import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REQUESTER, STAFF, renderApp } from "./authTestUtils.js";

// Role navigation after sign-in (AC-18) — IT Staff land on the Ticket Queue,
// Administrators land on User Management, both now that they exist.

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
    expect(screen.queryByRole("heading", { name: /user management/i })).not.toBeInTheDocument();
  });

  it("shows the Ticket Queue, not the Requester screens, for IT Staff", async () => {
    renderApp(STAFF);

    expect(await screen.findByTestId("signed-in-user")).toHaveTextContent(STAFF.name);
    expect(await screen.findByRole("heading", { name: /ticket queue/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /my tickets/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /create ticket/i })).not.toBeInTheDocument();
  });

  it("shows User Management as home for an Administrator, with Ticket Queue reachable", async () => {
    renderApp(ADMIN);

    expect(await screen.findByTestId("signed-in-user")).toHaveTextContent(ADMIN.name);
    expect(await screen.findByRole("heading", { name: /user management/i })).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: /main/i });
    expect(within(nav).getByRole("button", { name: /user management/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("button", { name: /^ticket queue$/i })).toBeInTheDocument();
  });

  it("shows the shell (name, role, profile menu) and a Ticket Queue nav item for IT Staff", async () => {
    renderApp(STAFF);

    expect(await screen.findByTestId("signed-in-role")).toHaveTextContent("IT Staff");
    expect(screen.getByRole("button", { name: /profile menu/i })).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: /main/i }),
    ).toHaveTextContent("Ticket Queue");
  });
});
