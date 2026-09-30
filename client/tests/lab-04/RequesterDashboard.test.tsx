import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import * as authApi from "../../src/authApi.js";
import { REQUESTER } from "../lab-03/authTestUtils.js";

// Lab 4 Requester Dashboard — tests.md C-04 (FR-17, FR-18, FR-21, FR-22,
// AC-02, AC-25, AC-26, AC-28, AC-30).

function mockShell() {
  vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
  vi.spyOn(api, "fetchMyTickets").mockResolvedValue({
    data: [],
    meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
  });
}

function ticket(overrides: Partial<api.DashboardTicketSummary> = {}): api.DashboardTicketSummary {
  return {
    id: 101,
    ticketNumber: "TT-20260905-0001",
    summary: "Need new monitor",
    currentStatus: "WaitingForRequester",
    itPriority: "MEDIUM",
    ticketOwner: { id: 9, name: "Sam Staff", role: "ITStaff" },
    updatedAt: "2026-09-05T12:30:00.000Z",
    createdAt: "2026-09-05T11:00:00.000Z",
    ...overrides,
  };
}

function requesterDashboard(
  overrides: Partial<api.RequesterDashboardData> = {},
): api.RequesterDashboardData {
  return {
    generatedAt: "2026-10-01T03:40:00.000Z",
    timeZone: "Asia/Bangkok",
    metrics: [
      { key: "myOpen", label: "My Open Tickets", value: 3, drillDown: "/my-tickets?status=open" },
      {
        key: "waitingForMe",
        label: "Waiting for You",
        value: 1,
        drillDown: "/my-tickets?status=WaitingForRequester",
      },
      { key: "inProgress", label: "In Progress", value: 2, drillDown: "/my-tickets?status=InProgress" },
      { key: "resolved", label: "Resolved", value: 5, drillDown: "/my-tickets?status=Resolved" },
      { key: "closed", label: "Closed", value: 12, drillDown: "/my-tickets?status=Closed" },
    ],
    needsAttention: [ticket()],
    recentTickets: [
      ticket({
        id: 102,
        ticketNumber: "TT-20260905-0002",
        summary: "Laptop battery drains quickly",
        currentStatus: "InProgress",
      }),
    ],
    ...overrides,
  };
}

async function signInAsRequester() {
  vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(REQUESTER);
  render(<App />);
  await screen.findByRole("heading", { name: /welcome, pat!/i });
  await waitFor(() => expect(screen.queryByText(/loading dashboard/i)).not.toBeInTheDocument());
}

beforeEach(() => {
  window.localStorage.clear();
  mockShell();
});
afterEach(() => vi.restoreAllMocks());

describe("Requester Dashboard — landing and shell (AC-30)", () => {
  it("lands the Requester on the Dashboard with the nav item marked active", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(requesterDashboard());
    await signInAsRequester();

    const nav = screen.getByRole("navigation", { name: /main/i });
    expect(within(nav).getByRole("button", { name: /^dashboard$/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("requests only the signed-in requester's own dashboard data (AC-02)", async () => {
    const spy = vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(requesterDashboard());
    await signInAsRequester();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith();
  });
});

describe("Requester Dashboard — metric cards, lists, and drill-down (AC-25)", () => {
  it("renders the five metric cards with accessible names and seed values", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(requesterDashboard());
    await signInAsRequester();

    expect(screen.getByRole("button", { name: "My Open Tickets: 3, view all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Waiting for You: 1, view all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "In Progress: 2, view all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resolved: 5, view all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Closed: 12, view all" })).toBeInTheDocument();
  });

  it("shows the Needs your attention and My Recent Tickets lists, capped at 5", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(requesterDashboard());
    await signInAsRequester();

    const needsAttention = screen.getByRole("region", { name: /needs your attention/i });
    expect(within(needsAttention).getByText(/need new monitor/i)).toBeInTheDocument();

    const recent = screen.getByRole("region", { name: /my recent tickets/i });
    expect(within(recent).getByText(/laptop battery drains quickly/i)).toBeInTheDocument();
  });

  it("opens My Tickets filtered by status when a metric card is clicked", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(requesterDashboard());
    const myTicketsSpy = vi.spyOn(api, "fetchMyTickets").mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });
    const user = userEvent.setup();
    await signInAsRequester();

    await user.click(screen.getByRole("button", { name: "Waiting for You: 1, view all" }));

    await screen.findByRole("heading", { name: /my tickets/i });
    await waitFor(() =>
      expect(myTicketsSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "WaitingForRequester" }),
      ),
    );
  });

  it("opens My Tickets with the 'open' alias for My Open Tickets", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(requesterDashboard());
    const myTicketsSpy = vi.spyOn(api, "fetchMyTickets").mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 10, totalItems: 3, totalPages: 1 },
    });
    const user = userEvent.setup();
    await signInAsRequester();

    await user.click(screen.getByRole("button", { name: "My Open Tickets: 3, view all" }));

    await screen.findByRole("heading", { name: /my tickets/i });
    await waitFor(() =>
      expect(myTicketsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ status: "open" })),
    );
  });

  it("opens Ticket Detail from a Needs your attention row", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(requesterDashboard());
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue({
      id: 101,
      ticketNumber: "TT-20260905-0001",
      ticketDate: "2026-09-05T11:00:00.000Z",
      requester: { id: REQUESTER.id, name: REQUESTER.name },
      category: { id: 2, name: "Hardware" },
      relatedSystem: { id: 4, name: "Corporate Laptop" },
      summary: "Need new monitor",
      description: "The current monitor flickers.",
      requestedPriority: "MEDIUM",
      currentStatus: "WaitingForRequester",
      ticketOwner: { name: "Sam Staff" },
      problemAppearsResolvedAt: null,
      createdAt: "2026-09-05T11:00:00.000Z",
      updatedAt: "2026-09-05T12:30:00.000Z",
      attachments: [],
      permissions: {
        canManageAttachments: true,
        canAddPublicComment: true,
        canReportProblemResolved: false,
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
    await signInAsRequester();

    await user.click(screen.getByRole("button", { name: /TT-20260905-0001/ }));
    expect(await screen.findByTestId("detail-ticket-number")).toHaveTextContent("TT-20260905-0001");
  });

  it("opens My Tickets unfiltered from 'View all' and Quick Actions", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(requesterDashboard());
    const myTicketsSpy = vi.spyOn(api, "fetchMyTickets").mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    });
    const user = userEvent.setup();
    await signInAsRequester();

    await user.click(screen.getByRole("button", { name: /view my tickets/i }));

    await screen.findByRole("heading", { name: /my tickets/i });
    await waitFor(() =>
      expect(myTicketsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ status: undefined })),
    );
  });

  it("opens Create Ticket from Quick Actions", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(requesterDashboard());
    const user = userEvent.setup();
    await signInAsRequester();

    const quickActions = screen.getByRole("region", { name: /quick actions/i });
    await user.click(within(quickActions).getByRole("button", { name: /create ticket/i }));
    await screen.findByRole("form", { name: /create ticket/i });
  });
});

describe("Requester Dashboard — empty state (AC-26)", () => {
  it("shows zero counts and the empty-state illustration with a Create Ticket action", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(
      requesterDashboard({
        metrics: [
          { key: "myOpen", label: "My Open Tickets", value: 0, drillDown: "/my-tickets?status=open" },
          {
            key: "waitingForMe",
            label: "Waiting for You",
            value: 0,
            drillDown: "/my-tickets?status=WaitingForRequester",
          },
          { key: "inProgress", label: "In Progress", value: 0, drillDown: "/my-tickets?status=InProgress" },
          { key: "resolved", label: "Resolved", value: 0, drillDown: "/my-tickets?status=Resolved" },
          { key: "closed", label: "Closed", value: 0, drillDown: "/my-tickets?status=Closed" },
        ],
        needsAttention: [],
        recentTickets: [],
      }),
    );
    const user = userEvent.setup();
    await signInAsRequester();

    expect(screen.getByRole("button", { name: "My Open Tickets: 0, view all" })).toBeInTheDocument();
    const empty = screen.getByTestId("empty-state");
    expect(empty).toHaveTextContent(/haven't submitted any tickets yet/i);

    await user.click(within(empty).getByRole("button", { name: /create ticket/i }));
    await screen.findByRole("form", { name: /create ticket/i });
  });
});

describe("Requester Dashboard — states (AC-28)", () => {
  it("shows card skeletons while loading, with the busy region marked", async () => {
    let resolveDashboard: (value: api.RequesterDashboardData) => void = () => {};
    vi.spyOn(api, "fetchRequesterDashboard").mockReturnValue(
      new Promise((resolve) => {
        resolveDashboard = resolve;
      }),
    );
    vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(REQUESTER);
    render(<App />);

    expect(await screen.findByText(/loading dashboard/i)).toBeInTheDocument();
    resolveDashboard(requesterDashboard());
    await screen.findByRole("heading", { name: /welcome, pat!/i });
  });

  it("shows an error banner with Retry and no stale numbers on API failure", async () => {
    const spy = vi
      .spyOn(api, "fetchRequesterDashboard")
      .mockRejectedValueOnce(new api.ApiError("Could not load the dashboard.", { status: 500 }))
      .mockResolvedValueOnce(requesterDashboard());
    vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(REQUESTER);
    const user = userEvent.setup();
    render(<App />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't load the dashboard/i);
    expect(screen.queryByRole("button", { name: /My Open Tickets:/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(
      await screen.findByRole("button", { name: "My Open Tickets: 3, view all" }),
    ).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("shows a forbidden message on a 403 without crashing", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockRejectedValue(
      new api.ApiError("Forbidden.", { status: 403, code: "FORBIDDEN" }),
    );
    vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(REQUESTER);
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/don't have permission/i);
  });

  it("updates the 'Updated HH:mm' label after a manual Refresh", async () => {
    const spy = vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(requesterDashboard());
    const user = userEvent.setup();
    await signInAsRequester();

    await screen.findByText(/updated \d{1,2}:\d{2}/i);
    await user.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
});
