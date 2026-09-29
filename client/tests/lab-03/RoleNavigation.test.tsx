import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import * as authApi from "../../src/authApi.js";
import { REQUESTER, STAFF, renderApp } from "./authTestUtils.js";

// Role navigation after sign-in (AC-18, Lab 4 AC-30) — IT Staff and
// Administrators land on the Dashboard; Ticket Queue and User Management are
// reachable from there via the shell nav.

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

  it("lands IT Staff on the Dashboard, with the Ticket Queue reachable from nav", async () => {
    vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(STAFF);
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue({
      generatedAt: "2026-10-01T00:00:00.000Z",
      timeZone: "Asia/Bangkok",
      metrics: [],
      secondary: [],
      byPriority: [],
      urgentTickets: [],
      recentTickets: [],
    });
    vi.spyOn(api, "fetchQueue").mockResolvedValue({
      data: [],
      meta: {
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
        counts: { active: 0, unassigned: 0, assignedToMe: 0 },
      },
    });
    render(<App />);

    expect(await screen.findByTestId("signed-in-user")).toHaveTextContent(STAFF.name);
    expect(await screen.findByRole("heading", { name: /welcome back, sam!/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /my tickets/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /create ticket/i })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Ticket Queue" }));
    expect(await screen.findByRole("heading", { name: /ticket queue/i })).toBeInTheDocument();
  });

  it("lands an Administrator on the Dashboard, with User Management and Ticket Queue reachable", async () => {
    vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(ADMIN);
    vi.spyOn(api, "fetchAdminDashboard").mockResolvedValue({
      generatedAt: "2026-10-01T00:00:00.000Z",
      timeZone: "Asia/Bangkok",
      metrics: [],
      secondary: [],
      byPriority: [],
      urgentTickets: [],
      recentTickets: [],
      users: { active: { Requester: 0, ITStaff: 0, Administrator: 0 }, inactive: 0 },
    });
    vi.spyOn(api, "fetchAdminUsers").mockResolvedValue({ data: [], meta: { totalItems: 0 } });
    render(<App />);

    expect(await screen.findByTestId("signed-in-user")).toHaveTextContent(ADMIN.name);
    expect(await screen.findByRole("heading", { name: /welcome back, ada!/i })).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: /main/i });
    expect(within(nav).getByRole("button", { name: /^dashboard$/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("button", { name: /user management/i })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /^ticket queue$/i })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(nav).getByRole("button", { name: /user management/i }));
    expect(await screen.findByRole("heading", { name: /user management/i })).toBeInTheDocument();
  });

  it("shows the shell (name, role, profile menu) and a Ticket Queue nav item for IT Staff", async () => {
    vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(STAFF);
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue({
      generatedAt: "2026-10-01T00:00:00.000Z",
      timeZone: "Asia/Bangkok",
      metrics: [],
      secondary: [],
      byPriority: [],
      urgentTickets: [],
      recentTickets: [],
    });
    render(<App />);

    expect(await screen.findByTestId("signed-in-role")).toHaveTextContent("IT Staff");
    expect(screen.getByRole("button", { name: /profile menu/i })).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: /main/i }),
    ).toHaveTextContent("Ticket Queue");
  });
});
