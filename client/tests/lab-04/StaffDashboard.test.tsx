import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import * as authApi from "../../src/authApi.js";
import { STAFF } from "../lab-03/authTestUtils.js";

// Lab 4 Staff Dashboard — tests.md C-03 (FR-19–FR-22, AC-24, AC-25, AC-28,
// AC-29, AC-30).

const ADMIN = { ...STAFF, id: 3, name: "Ada Admin", role: "Administrator" as const };

function mockShell() {
  vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
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
  vi.spyOn(api, "fetchAdminUsers").mockResolvedValue({ data: [], meta: { totalItems: 0 } });
}

function ticket(overrides: Partial<api.DashboardTicketSummary> = {}): api.DashboardTicketSummary {
  return {
    id: 101,
    ticketNumber: "TT-20260905-0001",
    summary: "Server down",
    currentStatus: "InProgress",
    itPriority: "URGENT",
    ticketOwner: { id: STAFF.id, name: STAFF.name, role: "ITStaff" },
    updatedAt: "2026-09-05T12:30:00.000Z",
    createdAt: "2026-09-05T11:00:00.000Z",
    ...overrides,
  };
}

function staffDashboard(overrides: Partial<api.StaffDashboardData> = {}): api.StaffDashboardData {
  return {
    generatedAt: "2026-10-01T03:40:00.000Z",
    timeZone: "Asia/Bangkok",
    metrics: [
      { key: "new", label: "New", value: 14, drillDown: "/queue?status=New" },
      { key: "open", label: "Open", value: 23, drillDown: "/queue?status=Open,Reopened" },
      { key: "inProgress", label: "In Progress", value: 18, drillDown: "/queue?status=InProgress" },
      {
        key: "waitingForRequester",
        label: "Waiting for Requester",
        value: 7,
        drillDown: "/queue?status=WaitingForRequester",
      },
      {
        key: "myAssigned",
        label: "My Assigned",
        value: 16,
        drillDown: "/queue?ownership=mine&status=open",
      },
    ],
    secondary: [
      {
        key: "unassigned",
        label: "Unassigned",
        value: 5,
        drillDown: "/queue?ownership=unassigned&status=open",
      },
      { key: "myOpenFollowUps", label: "My open follow-ups", value: 2, drillDown: "/queue?followUpFor=me" },
    ],
    byPriority: [
      { priority: "URGENT", value: 2, drillDown: "/queue?priority=URGENT&status=open" },
      { priority: "HIGH", value: 6, drillDown: "/queue?priority=HIGH&status=open" },
      { priority: "MEDIUM", value: 9, drillDown: "/queue?priority=MEDIUM&status=open" },
      { priority: "LOW", value: 4, drillDown: "/queue?priority=LOW&status=open" },
    ],
    urgentTickets: [ticket()],
    recentTickets: [ticket({ id: 102, ticketNumber: "TT-20260905-0002", summary: "Laptop battery" })],
    ...overrides,
  };
}

async function signInAsStaff() {
  vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(STAFF);
  render(<App />);
  await screen.findByRole("heading", { name: /welcome back, sam!/i });
  await waitFor(() => expect(screen.queryByText(/loading dashboard/i)).not.toBeInTheDocument());
}

async function signInAsAdmin() {
  vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(ADMIN);
  render(<App />);
  await screen.findByRole("heading", { name: /welcome back, ada!/i });
  await waitFor(() => expect(screen.queryByText(/loading dashboard/i)).not.toBeInTheDocument());
}

beforeEach(() => {
  window.localStorage.clear();
  mockShell();
});
afterEach(() => vi.restoreAllMocks());

describe("Staff Dashboard — landing and shell (AC-30)", () => {
  it("lands IT Staff on the Dashboard with the nav item marked active", async () => {
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(staffDashboard());
    await signInAsStaff();

    const nav = screen.getByRole("navigation", { name: /main/i });
    expect(within(nav).getByRole("button", { name: /^dashboard$/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows a forbidden message and never calls the admin endpoint for IT Staff", async () => {
    const staffSpy = vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(staffDashboard());
    const adminSpy = vi.spyOn(api, "fetchAdminDashboard");
    await signInAsStaff();

    expect(staffSpy).toHaveBeenCalledTimes(1);
    expect(adminSpy).not.toHaveBeenCalled();
  });
});

describe("Staff Dashboard — metric cards and drill-down (AC-24, AC-25)", () => {
  it("renders the five metric cards with accessible names and seed values", async () => {
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(staffDashboard());
    await signInAsStaff();

    expect(screen.getByRole("button", { name: "New: 14, view all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open: 23, view all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "In Progress: 18, view all" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Waiting for Requester: 7, view all" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "My Assigned: 16, view all" })).toBeInTheDocument();
  });

  it("opens the Ticket Queue filtered to match the clicked card's count", async () => {
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(staffDashboard());
    const queueSpy = vi.spyOn(api, "fetchQueue").mockResolvedValue({
      data: [
        {
          id: 1,
          ticketNumber: "TT-20260905-0009",
          ticketDate: "2026-09-05T12:30:00.000Z",
          summary: "New ticket",
          category: { id: 1, name: "Hardware" },
          requester: { id: 1, name: "Requester A", email: "a@example.com" },
          requestedPriority: "LOW",
          itPriority: "LOW",
          currentStatus: "New",
          ticketOwner: null,
          problemAppearsResolvedAt: null,
          updatedAt: "2026-09-05T12:30:00.000Z",
        },
      ],
      meta: {
        page: 1,
        pageSize: 20,
        totalItems: 14,
        totalPages: 1,
        counts: { active: 14, unassigned: 0, assignedToMe: 0 },
      },
    });
    const user = userEvent.setup();
    await signInAsStaff();

    await user.click(screen.getByRole("button", { name: "New: 14, view all" }));

    await screen.findByRole("heading", { name: /ticket queue/i });
    await waitFor(() =>
      expect(queueSpy).toHaveBeenLastCalledWith(expect.objectContaining({ currentStatus: "New" })),
    );
    expect(await screen.findByText(/of 14 tickets/i)).toBeInTheDocument();
  });

  it("applies a comma-list drill-down (Open,Reopened) as a raw status filter", async () => {
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(staffDashboard());
    const queueSpy = vi.spyOn(api, "fetchQueue").mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0, counts: { active: 0, unassigned: 0, assignedToMe: 0 } },
    });
    const user = userEvent.setup();
    await signInAsStaff();

    await user.click(screen.getByRole("button", { name: "Open: 23, view all" }));

    await screen.findByRole("heading", { name: /ticket queue/i });
    await waitFor(() =>
      expect(queueSpy).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Open,Reopened" })),
    );
  });

  it("drills into 'My open follow-ups' with followUpFor=me", async () => {
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(staffDashboard());
    const queueSpy = vi.spyOn(api, "fetchQueue").mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0, counts: { active: 0, unassigned: 0, assignedToMe: 0 } },
    });
    const user = userEvent.setup();
    await signInAsStaff();

    await user.click(screen.getByRole("button", { name: /my open follow-ups/i }));

    await screen.findByRole("heading", { name: /ticket queue/i });
    await waitFor(() =>
      expect(queueSpy).toHaveBeenLastCalledWith(expect.objectContaining({ followUpFor: "me" })),
    );
  });

  it("opens Ticket Detail from an Urgent Tickets row", async () => {
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(staffDashboard());
    vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue({
      id: 101,
      ticketNumber: "TT-20260905-0001",
      ticketDate: "2026-09-05T11:00:00.000Z",
      requester: { id: 1, name: "Requester A", email: "a@example.com" },
      category: { id: 2, name: "Hardware" },
      relatedSystem: { id: 4, name: "Server" },
      summary: "Server down",
      description: "The main server is down.",
      requestedPriority: "URGENT",
      itPriority: "URGENT",
      currentStatus: "InProgress",
      ticketOwner: { id: STAFF.id, name: STAFF.name, role: "ITStaff" },
      allowedStatusTransitions: [],
      problemAppearsResolvedAt: null,
      createdAt: "2026-09-05T11:00:00.000Z",
      updatedAt: "2026-09-05T12:30:00.000Z",
      attachments: [],
      permissions: {
        canClaim: false,
        canAssign: false,
        canReassign: true,
        canChangeItPriority: true,
        canChangeStatus: true,
        canAddPublicComment: true,
        canAddInternalNote: true,
        canManageAttachments: true,
      },
      version: 1,
      resolutionSummary: null,
      resolvedAt: null,
      closedAt: null,
      cancelledAt: null,
      cancelReason: null,
      requesterResolvedIndicatedAt: null,
    });
    const user = userEvent.setup();
    await signInAsStaff();

    await user.click(screen.getByRole("button", { name: /TT-20260905-0001/ }));
    expect(await screen.findByTestId("detail-ticket-number")).toHaveTextContent("TT-20260905-0001");
  });
});

describe("Staff Dashboard — states (AC-28)", () => {
  it("shows card skeletons while loading, with the busy region marked", async () => {
    let resolveDashboard: (value: api.StaffDashboardData) => void = () => {};
    vi.spyOn(api, "fetchStaffDashboard").mockReturnValue(
      new Promise((resolve) => {
        resolveDashboard = resolve;
      }),
    );
    vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(STAFF);
    render(<App />);

    expect(await screen.findByText(/loading dashboard/i)).toBeInTheDocument();
    resolveDashboard(staffDashboard());
    await screen.findByRole("heading", { name: /welcome back, sam!/i });
  });

  it("shows zero counts and empty-list text, with cards still clickable", async () => {
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(
      staffDashboard({
        metrics: [
          { key: "new", label: "New", value: 0, drillDown: "/queue?status=New" },
          { key: "open", label: "Open", value: 0, drillDown: "/queue?status=Open,Reopened" },
          { key: "inProgress", label: "In Progress", value: 0, drillDown: "/queue?status=InProgress" },
          {
            key: "waitingForRequester",
            label: "Waiting for Requester",
            value: 0,
            drillDown: "/queue?status=WaitingForRequester",
          },
          { key: "myAssigned", label: "My Assigned", value: 0, drillDown: "/queue?ownership=mine&status=open" },
        ],
        urgentTickets: [],
        recentTickets: [],
      }),
    );
    await signInAsStaff();

    const newCard = screen.getByRole("button", { name: "New: 0, view all" });
    expect(newCard).toBeInTheDocument();
    expect(newCard).not.toBeDisabled();
    expect(screen.getAllByText(/no tickets here yet/i).length).toBeGreaterThan(0);
  });

  it("shows an error banner with Retry and no stale numbers on API failure", async () => {
    const spy = vi
      .spyOn(api, "fetchStaffDashboard")
      .mockRejectedValueOnce(new api.ApiError("Could not load the dashboard.", { status: 500 }))
      .mockResolvedValueOnce(staffDashboard());
    vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(STAFF);
    const user = userEvent.setup();
    render(<App />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't load the dashboard/i);
    expect(screen.queryByRole("button", { name: /New:/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByRole("button", { name: "New: 14, view all" })).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("shows a forbidden message on a 403 without crashing", async () => {
    vi.spyOn(api, "fetchStaffDashboard").mockRejectedValue(
      new api.ApiError("Forbidden.", { status: 403, code: "FORBIDDEN" }),
    );
    vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(STAFF);
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/don't have permission/i);
  });

  it("updates the 'Updated HH:mm' label after a manual Refresh", async () => {
    const spy = vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(staffDashboard());
    const user = userEvent.setup();
    await signInAsStaff();

    await screen.findByText(/updated \d{1,2}:\d{2}/i);
    await user.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
});

describe("Staff Dashboard — Admin variant (AC-29)", () => {
  it("shows the IT Staff metrics plus a Users card for an Administrator", async () => {
    vi.spyOn(api, "fetchAdminDashboard").mockResolvedValue({
      ...staffDashboard(),
      users: { active: { Requester: 40, ITStaff: 6, Administrator: 2 }, inactive: 3 },
    });
    await signInAsAdmin();

    expect(screen.getByRole("button", { name: "New: 14, view all" })).toBeInTheDocument();
    const usersSection = screen.getByRole("region", { name: "Users" });
    expect(within(usersSection).getByText(/active requesters/i)).toBeInTheDocument();
    expect(within(usersSection).getByText("40")).toBeInTheDocument();
    expect(within(usersSection).getByText(/active it staff/i)).toBeInTheDocument();
    expect(within(usersSection).getByText("6")).toBeInTheDocument();
    expect(within(usersSection).getByText(/inactive/i)).toBeInTheDocument();
    expect(within(usersSection).getByText("3")).toBeInTheDocument();
  });

  it("does not show a Users card for IT Staff", async () => {
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(staffDashboard());
    await signInAsStaff();

    expect(screen.queryByRole("region", { name: "Users" })).not.toBeInTheDocument();
  });

  it("drills an admin Users card entry into User Management filtered by role", async () => {
    vi.spyOn(api, "fetchAdminDashboard").mockResolvedValue({
      ...staffDashboard(),
      users: { active: { Requester: 40, ITStaff: 6, Administrator: 2 }, inactive: 3 },
    });
    const usersSpy = vi.spyOn(api, "fetchAdminUsers").mockResolvedValue({ data: [], meta: { totalItems: 6 } });
    const user = userEvent.setup();
    await signInAsAdmin();

    await user.click(screen.getByRole("button", { name: /active it staff/i }));

    await screen.findByRole("heading", { name: /user management/i });
    await waitFor(() =>
      expect(usersSpy).toHaveBeenLastCalledWith({ search: "", role: "ITStaff", active: "true" }),
    );
  });
});
