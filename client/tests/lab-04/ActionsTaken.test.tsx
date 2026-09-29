import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import * as authApi from "../../src/authApi.js";
import { REQUESTER, STAFF } from "../lab-03/authTestUtils.js";

// Lab 4 Actions Taken UI — tests.md C-01 (AC-03, AC-05, AC-08, AC-10, AC-12,
// AC-13, AC-32, AC-33).

const STAFF_TWO = { ...STAFF, id: 10, name: "Other Staff" };

// Computed relative to "now" (not a fixed 2026 date) so the Add/Edit form's
// own "not more than 5 minutes in the future" client-side check never trips
// on a fixture timestamp regardless of when the suite actually runs.
const ONE_HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const HALF_HOUR_AGO = new Date(Date.now() - 30 * 60 * 1000).toISOString();
const FORTY_FIVE_MIN_AGO = new Date(Date.now() - 45 * 60 * 1000).toISOString();

function action(overrides: Partial<api.ActionTaken> = {}): api.ActionTaken {
  return {
    id: 501,
    ticketId: 101,
    actionAt: ONE_HOUR_AGO,
    description: "Replaced battery",
    result: "Laptop runs 4 hours on battery",
    status: "Completed",
    performedBy: { id: STAFF.id, name: STAFF.name, role: "ITStaff" },
    isPerformedByOwner: true,
    followUpRequired: false,
    followUpNote: null,
    attachmentNotes: null,
    completedAt: HALF_HOUR_AGO,
    cancelledAt: null,
    cancelReason: null,
    createdBy: { id: STAFF.id, name: STAFF.name, role: "ITStaff" },
    updatedBy: null,
    createdAt: FORTY_FIVE_MIN_AGO,
    updatedAt: HALF_HOUR_AGO,
    version: 2,
    ...overrides,
  };
}

function staffDetail(overrides: Partial<api.StaffTicketDetail> = {}): api.StaffTicketDetail {
  return {
    id: 101,
    ticketNumber: "TT-20260905-0001",
    ticketDate: "2026-09-05T12:30:00.000Z",
    requester: { id: 1, name: "Requester A", email: "requester-a@example.com" },
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
    version: 1,
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
    version: 1,
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
    cancelledAt: null,
    cancelReason: null,
    requesterResolvedIndicatedAt: null,
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
  vi.spyOn(api, "fetchAssignableUsers").mockResolvedValue([
    { id: STAFF.id, name: STAFF.name, role: "ITStaff" },
    { id: STAFF_TWO.id, name: STAFF_TWO.name, role: "ITStaff" },
  ]);
  vi.spyOn(api, "fetchPublicComments").mockResolvedValue([]);
  vi.spyOn(api, "fetchInternalNotes").mockResolvedValue([]);
  vi.spyOn(api, "fetchAdminUsers").mockResolvedValue({ data: [], meta: { totalItems: 0 } });
  vi.spyOn(api, "fetchTransitions").mockResolvedValue({
    currentStatus: "InProgress",
    version: 1,
    transitions: [],
    requesterCanIndicateResolved: false,
  });
  vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue({
    generatedAt: "2026-10-01T00:00:00.000Z",
    timeZone: "Asia/Bangkok",
    metrics: [],
    secondary: [],
    byPriority: [],
    urgentTickets: [],
    recentTickets: [],
  });
  vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue({
    generatedAt: "2026-10-01T00:00:00.000Z",
    timeZone: "Asia/Bangkok",
    metrics: [],
    needsAttention: [],
    recentTickets: [],
  });
}

/** Renders the app as IT Staff and opens the given ticket from the queue. */
async function openStaffDetail(
  user: ReturnType<typeof userEvent.setup>,
  detail: api.StaffTicketDetail,
  actions: api.ActionTaken[] = [],
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
  vi.spyOn(api, "fetchActionsTaken").mockResolvedValue({ items: actions, total: actions.length });

  render(<App />);
  // Lab 4 — Dashboard is home for IT Staff; the queue is a second stop.
  await user.click(await screen.findByRole("button", { name: /^ticket queue$/i }));
  await user.click(await screen.findByRole("button", { name: new RegExp(detail.ticketNumber) }));
  await screen.findByTestId("detail-ticket-number");
}

/** Renders the app as a Requester and opens the given ticket from My Tickets. */
async function openRequesterDetail(
  user: ReturnType<typeof userEvent.setup>,
  detail: api.TicketDetail,
  actions: api.ActionTaken[] = [],
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
  vi.spyOn(api, "fetchActionsTaken").mockResolvedValue({ items: actions, total: actions.length });

  render(<App />);
  const nav = await screen.findByRole("navigation", { name: /main/i });
  await user.click(within(nav).getByRole("button", { name: /^my tickets$/i }));
  await user.click(await screen.findByRole("button", { name: new RegExp(detail.ticketNumber) }));
  await screen.findByTestId("detail-ticket-number");
}

beforeEach(() => {
  window.localStorage.clear();
  mockShell();
});
afterEach(() => vi.restoreAllMocks());

/**
 * jsdom applies no media queries, so the desktop table and the mobile cards
 * both render at once. Tests scope list-content assertions to the table
 * (present regardless of role) to avoid ambiguous duplicate matches; the
 * mobile card layout itself is covered by its own `action-card` testid.
 */
function table() {
  return within(screen.getByTestId("actions-taken-table"));
}

describe("Staff view — list, ordering, and status (AC-03)", () => {
  it("shows a completed action in stable order with its status", async () => {
    const user = userEvent.setup();
    await openStaffDetail(user, staffDetail(), [action()]);

    const section = screen.getByRole("region", { name: /actions taken/i });
    expect(within(section).getByText(/actions taken \(1\)/i)).toBeInTheDocument();
    expect(table().getByText("Replaced battery")).toBeInTheDocument();
    expect(table().getByText(/✓ completed/i)).toBeInTheDocument();
  });

  it("shows Actions Taken by two different staff, each with the right Performed by", async () => {
    const user = userEvent.setup();
    const first = action({ id: 1, description: "First fix", performedBy: { id: STAFF.id, name: STAFF.name, role: "ITStaff" } });
    const second = action({
      id: 2,
      description: "Second fix",
      actionAt: "2026-10-01T03:00:00.000Z",
      performedBy: { id: STAFF_TWO.id, name: STAFF_TWO.name, role: "ITStaff" },
      isPerformedByOwner: false,
    });
    await openStaffDetail(user, staffDetail(), [first, second]);

    const rows = screen.getAllByTestId("action-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Sam Staff (owner)")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Other Staff")).toBeInTheDocument();
  });
});

describe("Staff view — Add Action form (AC-08, AC-32, AC-33)", () => {
  it("shows a validation error when follow-up is required but the note is empty (AC-08)", async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(api, "createActionTaken");
    await openStaffDetail(user, staffDetail(), []);

    await user.click(screen.getByRole("button", { name: /\+ add action/i }));
    await user.type(screen.getByLabelText(/^description/i), "Investigated the battery issue.");
    await user.type(screen.getByLabelText(/^result/i), "Replaced the battery.");
    await user.selectOptions(screen.getByLabelText(/performed by/i), String(STAFF.id));
    await user.click(screen.getByLabelText(/follow-up required/i));
    await user.click(screen.getByRole("button", { name: /^save action$/i }));

    expect(await screen.findByText(/follow-up note is required/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("disables the submit button while pending and reuses the clientRequestId on retry (AC-32)", async () => {
    const user = userEvent.setup();
    let resolveCreate: (value: api.ActionTaken) => void = () => undefined;
    const createSpy = vi.spyOn(api, "createActionTaken").mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; }),
    );
    await openStaffDetail(user, staffDetail(), []);

    await user.click(screen.getByRole("button", { name: /\+ add action/i }));
    await user.type(screen.getByLabelText(/^description/i), "Investigated the battery issue.");
    await user.type(screen.getByLabelText(/^result/i), "Replaced the battery.");
    await user.selectOptions(screen.getByLabelText(/performed by/i), String(STAFF.id));

    const submitButton = screen.getByRole("button", { name: /^save action$/i });
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(createSpy).toHaveBeenCalledTimes(1);
    const firstCallId = createSpy.mock.calls[0][1].clientRequestId;

    resolveCreate(action({ id: 999 }));
    await waitFor(() => expect(screen.queryByLabelText(/^description/i)).not.toBeInTheDocument());

    // A second Add Action after the first succeeded gets a fresh id.
    await user.click(screen.getByRole("button", { name: /\+ add action/i }));
    await user.type(screen.getByLabelText(/^description/i), "A second, unrelated action.");
    await user.type(screen.getByLabelText(/^result/i), "Done.");
    await user.selectOptions(screen.getByLabelText(/performed by/i), String(STAFF.id));
    createSpy.mockResolvedValueOnce(action({ id: 1000 }));
    await user.click(screen.getByRole("button", { name: /^save action$/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(2));
    const secondCallId = createSpy.mock.calls[1][1].clientRequestId;
    expect(secondCallId).not.toBe(firstCallId);
  });

  it("keeps the entered form data after a server failure (AC-33)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "createActionTaken").mockRejectedValue(
      new api.ApiError("Could not save the action. Please try again.", { status: 500, code: "INTERNAL_ERROR" }),
    );
    await openStaffDetail(user, staffDetail(), []);

    await user.click(screen.getByRole("button", { name: /\+ add action/i }));
    await user.type(screen.getByLabelText(/^description/i), "Investigated the battery issue.");
    await user.type(screen.getByLabelText(/^result/i), "Replaced the battery.");
    await user.selectOptions(screen.getByLabelText(/performed by/i), String(STAFF.id));
    await user.click(screen.getByRole("button", { name: /^save action$/i }));

    expect(await screen.findByText(/could not save the action/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^description/i)).toHaveValue("Investigated the battery issue.");
    expect(screen.getByLabelText(/^result/i)).toHaveValue("Replaced the battery.");
  });
});

describe("Staff view — Edit, stale conflict, Complete, Cancel (AC-10, AC-12)", () => {
  it("shows the 409 dialog with Reload latest / Copy my changes on a stale edit (AC-10)", async () => {
    const user = userEvent.setup();
    const planned = action({ id: 7, status: "Planned", result: null, version: 1 });
    const current = action({ id: 7, status: "Planned", result: null, version: 2, description: "Changed elsewhere" });
    vi.spyOn(api, "editActionTaken").mockRejectedValue(
      new api.StaleActionError("This action was changed by someone else. Reload and try again.", {
        status: 409,
        current,
      }),
    );
    await openStaffDetail(user, staffDetail(), [planned]);

    await user.click(table().getByRole("button", { name: /^edit$/i }));
    const descriptionField = await screen.findByLabelText(/^description/i);
    await user.clear(descriptionField);
    await user.type(descriptionField, "My local edit");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    const dialog = await screen.findByRole("dialog", { name: /action changed by someone else/i });
    expect(dialog).toHaveTextContent(/changed by/i);
    expect(within(dialog).getByRole("button", { name: /reload latest/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /copy my changes/i })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /copy my changes/i }));
    expect((within(dialog).getByLabelText(/your changes/i) as HTMLTextAreaElement).value).toContain(
      "My local edit",
    );

    await user.click(within(dialog).getByRole("button", { name: /reload latest/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(table().getByText("Changed elsewhere")).toBeInTheDocument();
  });

  it("completes a Planned action with a required result, via the Complete dialog", async () => {
    const user = userEvent.setup();
    const planned = action({ id: 8, status: "Planned", result: null, completedAt: null });
    const completed = action({ id: 8, status: "Completed", result: "Fixed the fan noise.", version: 2 });
    const completeSpy = vi.spyOn(api, "completeActionTaken").mockResolvedValue(completed);
    await openStaffDetail(user, staffDetail(), [planned]);

    await user.click(table().getByRole("button", { name: /^complete$/i }));
    const dialog = await screen.findByRole("dialog", { name: /complete action/i });
    await user.click(within(dialog).getByRole("button", { name: /complete action/i }));
    expect(await within(dialog).findByText(/result is required/i)).toBeInTheDocument();
    expect(completeSpy).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/^result/i), "Fixed the fan noise.");
    await user.click(within(dialog).getByRole("button", { name: /complete action/i }));

    await waitFor(() => expect(completeSpy).toHaveBeenCalledWith(101, 8, expect.objectContaining({ result: "Fixed the fan noise.", version: 2 })));
    expect(await table().findByText(/✓ completed/i)).toBeInTheDocument();
  });

  it("cancels an action with a required reason and shows the Cancelled badge and reason (AC-12)", async () => {
    const user = userEvent.setup();
    const planned = action({ id: 9, status: "Planned", result: null });
    const cancelled = action({
      id: 9,
      status: "Cancelled",
      cancelledAt: "2026-10-01T04:00:00.000Z",
      cancelReason: "Duplicate entry.",
      version: 2,
    });
    const cancelSpy = vi.spyOn(api, "cancelActionTaken").mockResolvedValue(cancelled);
    await openStaffDetail(user, staffDetail(), [planned]);

    await user.click(table().getByRole("button", { name: /^cancel$/i }));
    const dialog = await screen.findByRole("dialog", { name: /cancel action/i });
    await user.click(within(dialog).getByRole("button", { name: /^cancel action$/i }));
    expect(await within(dialog).findByText(/reason is required/i)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/^reason/i), "Duplicate entry.");
    await user.click(within(dialog).getByRole("button", { name: /^cancel action$/i }));

    await waitFor(() => expect(cancelSpy).toHaveBeenCalledWith(101, 9, { version: 2, reason: "Duplicate entry." }));
    expect(await table().findByText(/✕ cancelled/i)).toBeInTheDocument();
    expect(table().getByText(/reason: duplicate entry\./i)).toBeInTheDocument();

    // A cancelled action offers no Edit or Complete controls (AC-12).
    expect(table().queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    expect(table().queryByRole("button", { name: /^complete$/i })).not.toBeInTheDocument();
  });
});

describe("Add Action visibility (AC-13)", () => {
  it("hides Add Action on a Closed ticket", async () => {
    const user = userEvent.setup();
    await openStaffDetail(user, staffDetail({ currentStatus: "Closed" }), [action()]);
    expect(screen.queryByRole("button", { name: /\+ add action/i })).not.toBeInTheDocument();
    expect(screen.getByText(/actions are read-only/i)).toBeInTheDocument();
  });

  it("hides Add Action on a Cancelled ticket", async () => {
    const user = userEvent.setup();
    await openStaffDetail(user, staffDetail({ currentStatus: "Cancelled" }), []);
    expect(screen.queryByRole("button", { name: /\+ add action/i })).not.toBeInTheDocument();
  });
});

describe("Requester view — read-only (AC-05)", () => {
  it("shows Actions Taken with no Add/Edit/Complete/Cancel controls", async () => {
    const user = userEvent.setup();
    await openRequesterDetail(user, requesterDetail(), [action()]);

    const section = screen.getByRole("region", { name: /actions taken/i });
    expect(table().getByText("Replaced battery")).toBeInTheDocument();
    expect(table().getByText(new RegExp(STAFF.name, "i"))).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: /\+ add action/i })).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: /^complete$/i })).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no actions yet", async () => {
    const user = userEvent.setup();
    await openRequesterDetail(user, requesterDetail(), []);
    expect(await screen.findByTestId("no-actions-taken")).toHaveTextContent(/no actions recorded yet/i);
  });
});

describe("Keyboard-only operation", () => {
  it("lets a keyboard-only user reach and submit Add Action", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "createActionTaken").mockResolvedValue(action({ id: 21, status: "Planned", result: null }));
    await openStaffDetail(user, staffDetail(), []);

    const addButton = screen.getByRole("button", { name: /\+ add action/i });
    addButton.focus();
    expect(addButton).toHaveFocus();
    await user.keyboard("{Enter}");

    await user.type(screen.getByLabelText(/^description/i), "Keyboard-only add");
    await user.type(screen.getByLabelText(/^result/i), "Done via keyboard");
    await user.selectOptions(screen.getByLabelText(/performed by/i), String(STAFF.id));
    const submit = screen.getByRole("button", { name: /^save action$/i });
    submit.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(api.createActionTaken).toHaveBeenCalled());
  });

  it("lets a keyboard-only user reach and submit Edit", async () => {
    const user = userEvent.setup();
    const planned = action({ id: 22, status: "Planned", result: null });
    vi.spyOn(api, "editActionTaken").mockResolvedValue(action({ id: 22, status: "Planned", result: null, description: "Edited via keyboard", version: 2 }));
    await openStaffDetail(user, staffDetail(), [planned]);

    const editButton = table().getByRole("button", { name: /^edit$/i });
    editButton.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog", { name: /edit action/i });
    const descriptionField = within(dialog).getByLabelText(/^description/i);
    await user.clear(descriptionField);
    await user.type(descriptionField, "Edited via keyboard");
    const submit = within(dialog).getByRole("button", { name: /save changes/i });
    submit.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(api.editActionTaken).toHaveBeenCalled());
    expect(await table().findByText("Edited via keyboard")).toBeInTheDocument();
  });

  it("lets a keyboard-only user reach and submit Complete", async () => {
    const user = userEvent.setup();
    const planned = action({ id: 23, status: "Planned", result: null });
    vi.spyOn(api, "completeActionTaken").mockResolvedValue(action({ id: 23, status: "Completed", result: "Done." }));
    await openStaffDetail(user, staffDetail(), [planned]);

    const completeButton = table().getByRole("button", { name: /^complete$/i });
    completeButton.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog", { name: /complete action/i });
    await user.type(within(dialog).getByLabelText(/^result/i), "Done.");
    const submit = within(dialog).getByRole("button", { name: /complete action/i });
    submit.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(api.completeActionTaken).toHaveBeenCalled());
  });

  it("lets a keyboard-only user reach and submit Cancel", async () => {
    const user = userEvent.setup();
    const planned = action({ id: 24, status: "Planned", result: null });
    vi.spyOn(api, "cancelActionTaken").mockResolvedValue(
      action({ id: 24, status: "Cancelled", cancelReason: "No longer needed." }),
    );
    await openStaffDetail(user, staffDetail(), [planned]);

    const cancelButton = table().getByRole("button", { name: /^cancel$/i });
    cancelButton.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog", { name: /cancel action/i });
    await user.type(within(dialog).getByLabelText(/^reason/i), "No longer needed.");
    const submit = within(dialog).getByRole("button", { name: /^cancel action$/i });
    submit.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(api.cancelActionTaken).toHaveBeenCalled());
  });
});
