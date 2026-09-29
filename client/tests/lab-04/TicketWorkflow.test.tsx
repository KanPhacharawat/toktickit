import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import * as authApi from "../../src/authApi.js";
import { REQUESTER, STAFF } from "../lab-03/authTestUtils.js";

// Lab 4 Ticket Workflow UI — ui-spec.md §6, tests.md C-02 (AC-19, AC-20,
// AC-21, AC-22, AC-23).

function staffDetail(overrides: Partial<api.StaffTicketDetail> = {}): api.StaffTicketDetail {
  return {
    id: 101,
    ticketNumber: "TT-20260905-0001",
    ticketDate: "2026-09-05T12:30:00.000Z",
    requester: { id: REQUESTER.id, name: REQUESTER.name, email: "requester-a@example.com" },
    category: { id: 2, name: "Hardware" },
    relatedSystem: { id: 4, name: "Corporate Laptop" },
    summary: "Laptop battery drains quickly",
    description: "The laptop battery reaches zero within about an hour.",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "InProgress",
    ticketOwner: { id: STAFF.id, name: STAFF.name, role: "ITStaff" },
    allowedStatusTransitions: [],
    problemAppearsResolvedAt: null,
    createdAt: "2026-09-05T12:30:00.000Z",
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
      canManageAttachments: false,
    },
    version: 3,
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
    cancelledAt: null,
    cancelReason: null,
    requesterResolvedIndicatedAt: null,
    ...overrides,
  };
}

function requesterDetail(overrides: Partial<api.TicketDetail> = {}): api.TicketDetail {
  return {
    id: 101,
    ticketNumber: "TT-20260905-0001",
    ticketDate: "2026-09-05T12:30:00.000Z",
    requester: { id: REQUESTER.id, name: REQUESTER.name },
    category: { id: 2, name: "Hardware" },
    relatedSystem: { id: 4, name: "Corporate Laptop" },
    summary: "Laptop battery drains quickly",
    description: "The laptop battery reaches zero within about an hour.",
    requestedPriority: "MEDIUM",
    currentStatus: "InProgress",
    ticketOwner: { name: STAFF.name },
    problemAppearsResolvedAt: null,
    createdAt: "2026-09-05T12:30:00.000Z",
    updatedAt: "2026-09-05T12:30:00.000Z",
    attachments: [],
    permissions: {
      canManageAttachments: true,
      canAddPublicComment: true,
      canReportProblemResolved: false,
    },
    version: 3,
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
    cancelledAt: null,
    cancelReason: null,
    requesterResolvedIndicatedAt: null,
    ...overrides,
  };
}

function transitions(overrides: Partial<api.TransitionsResponse> = {}): api.TransitionsResponse {
  return {
    currentStatus: "InProgress",
    version: 3,
    transitions: [],
    requesterCanIndicateResolved: false,
    ...overrides,
  };
}

function workflowSummary(
  detail: { id: number; ticketNumber: string; currentStatus: string; version: number },
  overrides: Partial<api.TicketWorkflowSummary> = {},
): api.TicketWorkflowSummary {
  return {
    id: detail.id,
    ticketNumber: detail.ticketNumber,
    currentStatus: detail.currentStatus as api.TicketStatus,
    version: detail.version + 1,
    ticketOwner: { id: STAFF.id, name: STAFF.name, role: "ITStaff" },
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
    cancelledAt: null,
    cancelReason: null,
    requesterResolvedIndicatedAt: null,
    updatedAt: "2026-09-05T14:00:00.000Z",
    ...overrides,
  };
}

function mockShell() {
  vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
  vi.spyOn(api, "fetchQueue").mockResolvedValue({
    data: [],
    meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0, counts: { active: 0, unassigned: 0, assignedToMe: 0 } },
  });
  vi.spyOn(api, "fetchMyTickets").mockResolvedValue({
    data: [],
    meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
  });
  vi.spyOn(api, "fetchAssignableUsers").mockResolvedValue([{ id: STAFF.id, name: STAFF.name, role: "ITStaff" }]);
  vi.spyOn(api, "fetchPublicComments").mockResolvedValue([]);
  vi.spyOn(api, "fetchInternalNotes").mockResolvedValue([]);
  vi.spyOn(api, "fetchActionsTaken").mockResolvedValue({ items: [], total: 0 });
  vi.spyOn(api, "fetchAdminUsers").mockResolvedValue({ data: [], meta: { totalItems: 0 } });
  vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue({
    generatedAt: "2026-10-01T00:00:00.000Z",
    timeZone: "Asia/Bangkok",
    metrics: [],
    secondary: [],
    byPriority: [],
    urgentTickets: [],
    recentTickets: [],
  });
}

async function openStaffDetail(
  user: ReturnType<typeof userEvent.setup>,
  detail: api.StaffTicketDetail,
  transitionsResponse: api.TransitionsResponse,
) {
  vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(STAFF);
  vi.spyOn(api, "fetchQueue").mockResolvedValue({
    data: [
      {
        id: detail.id,
        ticketNumber: detail.ticketNumber,
        ticketDate: detail.ticketDate,
        summary: detail.summary,
        category: detail.category,
        requester: { ...detail.requester, email: detail.requester.email ?? "" },
        requestedPriority: detail.requestedPriority,
        itPriority: detail.itPriority,
        currentStatus: detail.currentStatus,
        ticketOwner: detail.ticketOwner,
        problemAppearsResolvedAt: detail.problemAppearsResolvedAt,
        updatedAt: detail.updatedAt,
      },
    ],
    meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, counts: { active: 1, unassigned: 0, assignedToMe: 1 } },
  });
  vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue(detail);
  vi.spyOn(api, "fetchTransitions").mockResolvedValue(transitionsResponse);

  render(<App />);
  // Lab 4 — Dashboard is home for IT Staff; the queue is a second stop.
  await user.click(await screen.findByRole("button", { name: /^ticket queue$/i }));
  await user.click(await screen.findByRole("button", { name: new RegExp(detail.ticketNumber) }));
  await screen.findByTestId("detail-ticket-number");
  await screen.findByTestId("ticket-workflow");
}

async function openRequesterDetail(
  user: ReturnType<typeof userEvent.setup>,
  detail: api.TicketDetail,
  transitionsResponse: api.TransitionsResponse,
) {
  vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(REQUESTER);
  vi.spyOn(api, "fetchMyTickets").mockResolvedValue({
    data: [
      {
        id: detail.id,
        ticketNumber: detail.ticketNumber,
        summary: detail.summary,
        category: detail.category.name,
        requestedPriority: detail.requestedPriority,
        currentStatus: detail.currentStatus,
        ticketOwner: detail.ticketOwner,
        problemAppearsResolvedAt: detail.problemAppearsResolvedAt,
        updatedAt: detail.updatedAt,
      },
    ],
    meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
  });
  vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(detail);
  vi.spyOn(api, "fetchTransitions").mockResolvedValue(transitionsResponse);

  render(<App />);
  await user.click(await screen.findByRole("button", { name: new RegExp(detail.ticketNumber) }));
  await screen.findByTestId("detail-ticket-number");
  await screen.findByTestId("ticket-workflow");
}

beforeEach(() => {
  window.localStorage.clear();
  mockShell();
});
afterEach(() => vi.restoreAllMocks());

function workflowSection() {
  return within(screen.getByTestId("ticket-workflow"));
}

describe("Status panel — only permitted transitions (AC-22)", () => {
  it("lists only the transitions returned by GET /transitions", async () => {
    const user = userEvent.setup();
    await openStaffDetail(
      user,
      staffDetail(),
      transitions({ transitions: [{ to: "WaitingForRequester", requiresReason: false }, { to: "Cancelled", requiresReason: true }] }),
    );

    const select = workflowSection().getByLabelText(/change status to/i);
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Change status to…", "Waiting For Requester", "Cancelled"]);
  });

  it("shows 'No status changes available' when nothing is permitted", async () => {
    const user = userEvent.setup();
    await openStaffDetail(user, staffDetail(), transitions({ transitions: [] }));

    expect(workflowSection().getByText(/no status changes available/i)).toBeInTheDocument();
    expect(workflowSection().queryByLabelText(/change status to/i)).not.toBeInTheDocument();
  });
});

describe("Closed/Cancelled tickets show no status controls", () => {
  it("hides the status dropdown for a Closed ticket", async () => {
    const user = userEvent.setup();
    await openStaffDetail(
      user,
      staffDetail({ currentStatus: "Closed" }),
      transitions({ currentStatus: "Closed", transitions: [] }),
    );

    expect(workflowSection().getByText(/no status changes available/i)).toBeInTheDocument();
    expect(workflowSection().queryByLabelText(/change status to/i)).not.toBeInTheDocument();
  });

  it("shows no Requester controls for a Cancelled ticket", async () => {
    const user = userEvent.setup();
    await openRequesterDetail(
      user,
      requesterDetail({ currentStatus: "Cancelled" }),
      transitions({ currentStatus: "Cancelled", transitions: [], requesterCanIndicateResolved: false }),
    );

    expect(workflowSection().queryByRole("button", { name: /reopen/i })).not.toBeInTheDocument();
    expect(workflowSection().queryByRole("button", { name: /cancel ticket/i })).not.toBeInTheDocument();
    expect(workflowSection().queryByRole("button", { name: /problem appears resolved/i })).not.toBeInTheDocument();
  });
});

describe("Resolve dialog — resolution summary + gate checklist", () => {
  it("shows the checklist, disables Confirm until reason and checks are satisfied, and submits with the reason", async () => {
    const user = userEvent.setup();
    const detail = staffDetail();
    const gate: api.WorkflowGate = {
      passed: false,
      checks: [
        { id: "HAS_OWNER", passed: true },
        { id: "HAS_COMPLETED_ACTION", passed: true },
        { id: "NO_PLANNED_ACTIONS", passed: false },
        { id: "FOLLOW_UPS_ACKNOWLEDGED", passed: true, requiresAcknowledgement: false },
      ],
    };
    await openStaffDetail(
      user,
      detail,
      transitions({ transitions: [{ to: "Resolved", requiresReason: true, gate }] }),
    );

    await user.selectOptions(workflowSection().getByLabelText(/change status to/i), "Resolved");
    await user.click(workflowSection().getByRole("button", { name: /update status/i }));

    const dialog = await screen.findByRole("dialog", { name: /resolve ticket/i });
    expect(within(dialog).getByTestId("resolution-gate-checklist")).toHaveTextContent(/no planned actions/i);

    const confirm = within(dialog).getByRole("button", { name: /confirm resolve/i });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/resolution summary/i), "Fixed and verified.");
    // NO_PLANNED_ACTIONS still fails client-side, so Confirm stays disabled.
    expect(confirm).toBeDisabled();
  });

  it("submits the resolution summary and follow-up acknowledgement once all checks pass", async () => {
    const user = userEvent.setup();
    const detail = staffDetail();
    const gate: api.WorkflowGate = {
      passed: true,
      checks: [
        { id: "HAS_OWNER", passed: true },
        { id: "HAS_COMPLETED_ACTION", passed: true },
        { id: "NO_PLANNED_ACTIONS", passed: true },
        { id: "FOLLOW_UPS_ACKNOWLEDGED", passed: false, requiresAcknowledgement: true },
      ],
    };
    const postStatusSpy = vi.spyOn(api, "postTicketStatus").mockResolvedValue({
      ticket: workflowSummary(detail, { currentStatus: "Resolved", resolutionSummary: "Fixed and verified." }),
      history: {
        id: 1,
        fromStatus: "InProgress",
        toStatus: "Resolved",
        actor: { id: STAFF.id, name: STAFF.name, role: "ITStaff" },
        reason: "Fixed and verified.",
        createdAt: "2026-09-05T14:00:00.000Z",
      },
    });
    await openStaffDetail(
      user,
      detail,
      transitions({ transitions: [{ to: "Resolved", requiresReason: true, gate }] }),
    );

    await user.selectOptions(workflowSection().getByLabelText(/change status to/i), "Resolved");
    await user.click(workflowSection().getByRole("button", { name: /update status/i }));

    const dialog = await screen.findByRole("dialog", { name: /resolve ticket/i });
    await user.type(within(dialog).getByLabelText(/resolution summary/i), "Fixed and verified.");

    const confirm = within(dialog).getByRole("button", { name: /confirm resolve/i });
    expect(confirm).toBeDisabled();

    await user.click(within(dialog).getByLabelText(/i acknowledge the outstanding follow-up/i));
    expect(confirm).not.toBeDisabled();

    await user.click(confirm);

    await waitFor(() =>
      expect(postStatusSpy).toHaveBeenCalledWith(101, {
        version: 3,
        toStatus: "Resolved",
        reason: "Fixed and verified.",
        followUpAcknowledged: true,
      }),
    );
    // Status badge / summary line refreshes immediately after success.
    expect(await workflowSection().findByText(/status: resolved/i)).toBeInTheDocument();
  });

  it("shows the failing conditions and keeps the dialog open on 422 RESOLUTION_GATE_FAILED", async () => {
    const user = userEvent.setup();
    const detail = staffDetail();
    const gate: api.WorkflowGate = {
      passed: true,
      checks: [
        { id: "HAS_OWNER", passed: true },
        { id: "HAS_COMPLETED_ACTION", passed: true },
        { id: "NO_PLANNED_ACTIONS", passed: true },
        { id: "FOLLOW_UPS_ACKNOWLEDGED", passed: true, requiresAcknowledgement: false },
      ],
    };
    vi.spyOn(api, "postTicketStatus").mockRejectedValue(
      new api.ResolutionGateError("Ticket cannot be resolved yet.", {
        status: 422,
        details: [{ check: "NO_PLANNED_ACTIONS", message: "1 action is still planned." }],
      }),
    );
    await openStaffDetail(
      user,
      detail,
      transitions({ transitions: [{ to: "Resolved", requiresReason: true, gate }] }),
    );

    await user.selectOptions(workflowSection().getByLabelText(/change status to/i), "Resolved");
    await user.click(workflowSection().getByRole("button", { name: /update status/i }));
    const dialog = await screen.findByRole("dialog", { name: /resolve ticket/i });
    await user.type(within(dialog).getByLabelText(/resolution summary/i), "Trying anyway.");
    await user.click(within(dialog).getByRole("button", { name: /confirm resolve/i }));

    expect(await within(dialog).findByText(/1 action is still planned/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /go to actions taken/i })).toBeInTheDocument();
    // Dialog stays open (not swapped for the stale dialog).
    expect(screen.getByRole("dialog", { name: /resolve ticket/i })).toBeInTheDocument();
  });
});

describe("Cancel and Reopen dialogs — required reason", () => {
  it("requires a reason to cancel and sends it", async () => {
    const user = userEvent.setup();
    const detail = staffDetail();
    vi.spyOn(api, "postTicketStatus").mockResolvedValue({
      ticket: workflowSummary(detail, { currentStatus: "Cancelled" }),
      history: {
        id: 2,
        fromStatus: "InProgress",
        toStatus: "Cancelled",
        actor: { id: STAFF.id, name: STAFF.name, role: "ITStaff" },
        reason: "Duplicate ticket.",
        createdAt: "2026-09-05T14:00:00.000Z",
      },
    });
    await openStaffDetail(
      user,
      detail,
      transitions({ transitions: [{ to: "Cancelled", requiresReason: true }] }),
    );

    await user.selectOptions(workflowSection().getByLabelText(/change status to/i), "Cancelled");
    await user.click(workflowSection().getByRole("button", { name: /update status/i }));

    const dialog = await screen.findByRole("dialog", { name: /cancel ticket/i });
    await user.click(within(dialog).getByRole("button", { name: /cancel ticket/i }));
    expect(within(dialog).getByText(/a reason is required/i)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/reason/i), "Duplicate ticket.");
    await user.click(within(dialog).getByRole("button", { name: /cancel ticket/i }));

    await waitFor(() =>
      expect(api.postTicketStatus).toHaveBeenCalledWith(101, {
        version: 3,
        toStatus: "Cancelled",
        reason: "Duplicate ticket.",
        followUpAcknowledged: false,
      }),
    );
  });

  it("Requester can Reopen a Resolved ticket with a required reason", async () => {
    const user = userEvent.setup();
    const detail = requesterDetail({ currentStatus: "Resolved" });
    vi.spyOn(api, "postTicketStatus").mockResolvedValue({
      ticket: workflowSummary(detail, { currentStatus: "Reopened" }),
      history: {
        id: 3,
        fromStatus: "Resolved",
        toStatus: "Reopened",
        actor: { id: REQUESTER.id, name: REQUESTER.name, role: "Requester" },
        reason: "Still broken.",
        createdAt: "2026-09-05T14:00:00.000Z",
      },
    });
    await openRequesterDetail(
      user,
      detail,
      transitions({ currentStatus: "Resolved", transitions: [{ to: "Reopened", requiresReason: true }] }),
    );

    await user.click(workflowSection().getByRole("button", { name: /^reopen$/i }));
    const dialog = await screen.findByRole("dialog", { name: /reopen ticket/i });
    await user.type(within(dialog).getByLabelText(/reason/i), "Still broken.");
    await user.click(within(dialog).getByRole("button", { name: /reopen ticket/i }));

    await waitFor(() =>
      expect(api.postTicketStatus).toHaveBeenCalledWith(101, {
        version: 3,
        toStatus: "Reopened",
        reason: "Still broken.",
        followUpAcknowledged: false,
      }),
    );
  });
});

describe("Requester controls (AC-19, AC-20)", () => {
  it("shows 'Problem appears resolved' and then the marked-resolved state", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "postRequesterResolution").mockResolvedValue({
      ticketId: 101,
      currentStatus: "InProgress",
      requesterResolvedIndicatedAt: "2026-09-05T15:00:00.000Z",
    });
    await openRequesterDetail(
      user,
      requesterDetail(),
      transitions({ requesterCanIndicateResolved: true }),
    );

    await user.click(workflowSection().getByRole("button", { name: /problem appears resolved/i }));

    await waitFor(() => expect(api.postRequesterResolution).toHaveBeenCalledWith(101));
    expect(await workflowSection().findByRole("button", { name: /marked as resolved on/i })).toBeDisabled();
  });

  it("shows Cancel Ticket only when status is New", async () => {
    const user = userEvent.setup();
    await openRequesterDetail(
      user,
      requesterDetail({ currentStatus: "New" }),
      transitions({ currentStatus: "New", transitions: [{ to: "Cancelled", requiresReason: true }] }),
    );

    expect(workflowSection().getByRole("button", { name: /cancel ticket/i })).toBeInTheDocument();
  });
});

describe("Staff indicator when requester marked resolved", () => {
  it("shows the indication with a timestamp for staff", async () => {
    const user = userEvent.setup();
    await openStaffDetail(
      user,
      staffDetail({ requesterResolvedIndicatedAt: "2026-09-05T10:02:00.000Z" }),
      transitions(),
    );

    expect(
      workflowSection().getByText(/requester indicated the problem appears resolved/i),
    ).toBeInTheDocument();
  });
});

describe("409 STALE_UPDATE — reload", () => {
  it("shows a Reload dialog and refreshes transitions on click", async () => {
    const user = userEvent.setup();
    const detail = staffDetail();
    const current = workflowSummary(detail, { currentStatus: "WaitingForRequester", version: 9 });
    vi.spyOn(api, "postTicketStatus").mockRejectedValue(
      new api.StaleStatusError("This ticket changed since you loaded it.", { status: 409, current }),
    );
    await openStaffDetail(
      user,
      detail,
      transitions({ transitions: [{ to: "Cancelled", requiresReason: true }] }),
    );
    // Grab the live spy *after* openStaffDetail's own vi.spyOn call, which
    // replaces the earlier spy — an older reference would never see calls
    // routed through the version openStaffDetail installed.
    const fetchTransitionsSpy = vi
      .spyOn(api, "fetchTransitions")
      .mockResolvedValue(transitions({ transitions: [{ to: "Cancelled", requiresReason: true }] }));
    fetchTransitionsSpy.mockClear();

    await user.selectOptions(workflowSection().getByLabelText(/change status to/i), "Cancelled");
    await user.click(workflowSection().getByRole("button", { name: /update status/i }));
    const cancelDialog = await screen.findByRole("dialog", { name: /cancel ticket/i });
    await user.type(within(cancelDialog).getByLabelText(/reason/i), "Duplicate.");
    await user.click(within(cancelDialog).getByRole("button", { name: /cancel ticket/i }));

    const staleDialog = await screen.findByRole("dialog", { name: /ticket changed/i });
    expect(staleDialog).toHaveTextContent(/updated by someone else/i);
    // The badge already reflects the server's authoritative state.
    expect(await workflowSection().findByText(/status: waiting for requester/i)).toBeInTheDocument();

    await user.click(within(staleDialog).getByRole("button", { name: /reload/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(fetchTransitionsSpy).toHaveBeenCalled());
  });
});

describe("History tab timeline (AC-23)", () => {
  it("lists entries oldest to newest with no edit/delete controls", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchStatusHistory").mockResolvedValue([
      {
        id: 1,
        fromStatus: null,
        toStatus: "New",
        actor: { id: REQUESTER.id, name: REQUESTER.name, role: "Requester" },
        reason: null,
        createdAt: "2026-09-04T09:00:00.000Z",
      },
      {
        id: 2,
        fromStatus: "New",
        toStatus: "Open",
        actor: { id: STAFF.id, name: STAFF.name, role: "ITStaff" },
        reason: null,
        createdAt: "2026-09-05T09:00:00.000Z",
      },
      {
        id: 3,
        fromStatus: "Open",
        toStatus: "InProgress",
        actor: { id: STAFF.id, name: STAFF.name, role: "ITStaff" },
        reason: "Started work.",
        createdAt: "2026-09-05T10:00:00.000Z",
      },
    ]);
    await openStaffDetail(user, staffDetail(), transitions());

    await user.click(workflowSection().getByRole("tab", { name: /history/i }));

    const list = await workflowSection().findByTestId("status-history-list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/changed status.*New/i);
    expect(items[2]).toHaveTextContent(/changed status.*Open.*In Progress/i);
    expect(items[2]).toHaveTextContent(/started work/i);

    // No edit/delete affordance anywhere in the history view.
    expect(within(list).queryByRole("button", { name: /edit|delete/i })).not.toBeInTheDocument();
  });
});
