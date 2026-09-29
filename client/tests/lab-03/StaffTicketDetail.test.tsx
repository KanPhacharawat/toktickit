import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import * as authApi from "../../src/authApi.js";
import { STAFF } from "./authTestUtils.js";

// IT Staff Ticket Operations issue — tests.md §6, UI-27 to UI-33.

const ADMIN = { ...STAFF, id: 3, name: "Ada Admin", role: "Administrator" as const };

function detail(overrides: Partial<api.StaffTicketDetail> = {}): api.StaffTicketDetail {
  return {
    id: 101,
    ticketNumber: "TT-20260905-0001",
    ticketDate: "2026-09-05T12:30:00.000Z",
    requester: { id: 1, name: "Requester A", email: "requester-a@example.com" },
    category: { id: 2, name: "Hardware" },
    relatedSystem: { id: 4, name: "Corporate Laptop" },
    summary: "Printer jams constantly",
    description: "The office printer jams on every multi-page job.",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "New",
    ticketOwner: null,
    allowedStatusTransitions: [],
    problemAppearsResolvedAt: null,
    createdAt: "2026-09-05T12:30:00.000Z",
    updatedAt: "2026-09-05T12:30:00.000Z",
    attachments: [],
    permissions: {
      canClaim: true,
      canAssign: true,
      canReassign: false,
      canChangeItPriority: false,
      canChangeStatus: false,
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
  vi.spyOn(api, "fetchAssignableUsers").mockResolvedValue([
    { id: 9, name: "Sam Staff", role: "ITStaff" },
    { id: 10, name: "Other Staff", role: "ITStaff" },
    { id: 3, name: "Ada Admin", role: "Administrator" },
  ]);
  vi.spyOn(api, "fetchPublicComments").mockResolvedValue([]);
  vi.spyOn(api, "fetchInternalNotes").mockResolvedValue([]);
  vi.spyOn(api, "fetchActionsTaken").mockResolvedValue({ items: [], total: 0 });
  vi.spyOn(api, "fetchTransitions").mockResolvedValue({
    currentStatus: "New",
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
}

/** Renders the whole app as staff, then opens the given ticket from the queue. */
async function openTicketDetail(
  user: ReturnType<typeof userEvent.setup>,
  ticketDetailData: api.StaffTicketDetail,
  signedInAs: typeof STAFF = STAFF,
) {
  vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(signedInAs);
  vi.spyOn(api, "fetchQueue").mockResolvedValue({
    data: [
      {
        id: ticketDetailData.id,
        ticketNumber: ticketDetailData.ticketNumber,
        ticketDate: ticketDetailData.ticketDate,
        summary: ticketDetailData.summary,
        category: ticketDetailData.category,
        requester: { ...ticketDetailData.requester, email: ticketDetailData.requester.email ?? "" },
        requestedPriority: ticketDetailData.requestedPriority,
        itPriority: ticketDetailData.itPriority,
        currentStatus: ticketDetailData.currentStatus,
        ticketOwner: ticketDetailData.ticketOwner,
        problemAppearsResolvedAt: ticketDetailData.problemAppearsResolvedAt,
        updatedAt: ticketDetailData.updatedAt,
      },
    ],
    meta: {
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
      counts: { active: 1, unassigned: 1, assignedToMe: 0 },
    },
  });
  vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue(ticketDetailData);
  vi.spyOn(api, "fetchAdminUsers").mockResolvedValue({ data: [], meta: { totalItems: 0 } });

  render(<App />);
  // Lab 4 — Dashboard is home for both roles; the queue is a second stop.
  await user.click(await screen.findByRole("button", { name: /^ticket queue$/i }));
  await user.click(await screen.findByRole("button", { name: new RegExp(ticketDetailData.ticketNumber) }));
  await screen.findByTestId("detail-ticket-number");
}

describe("UI-27 — ownership controls (AC-34–AC-37)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockShell();
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows Claim and Assign-to for an unassigned ticket", async () => {
    const user = userEvent.setup();
    await openTicketDetail(user, detail());

    expect(screen.getByRole("button", { name: /claim ticket/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/assign to/i)).toBeInTheDocument();
  });

  it("claims the ticket and reflects the new owner", async () => {
    const user = userEvent.setup();
    const claimed = detail({
      ticketOwner: { id: 9, name: "Sam Staff", role: "ITStaff" },
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
    });
    vi.spyOn(api, "claimTicket").mockResolvedValue(claimed);
    await openTicketDetail(user, detail());

    await user.click(screen.getByRole("button", { name: /claim ticket/i }));

    expect(await screen.findByRole("button", { name: /save it priority/i })).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("shows read-only ownership with an explanation for a non-owner", async () => {
    const user = userEvent.setup();
    await openTicketDetail(
      user,
      detail({
        ticketOwner: { id: 10, name: "Other Staff", role: "ITStaff" },
        permissions: {
          canClaim: false,
          canAssign: false,
          canReassign: false,
          canChangeItPriority: false,
          canChangeStatus: false,
          canAddPublicComment: true,
          canAddInternalNote: true,
          canManageAttachments: false,
        },
      }),
    );

    expect(
      screen.getByText(/only the ticket owner or an administrator can reassign this ticket/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/reassign to/i)).not.toBeInTheDocument();
  });

  it("lets the owner reassign, excluding themselves from the list", async () => {
    const user = userEvent.setup();
    const reassigned = detail({ ticketOwner: { id: 10, name: "Other Staff", role: "ITStaff" } });
    vi.spyOn(api, "setTicketOwner").mockResolvedValue(reassigned);
    await openTicketDetail(
      user,
      detail({
        ticketOwner: { id: 9, name: "Sam Staff", role: "ITStaff" },
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
      }),
    );

    const select = screen.getByLabelText(/reassign to/i);
    expect(within(select).queryByText(/sam staff/i)).not.toBeInTheDocument();
    await user.selectOptions(select, "10");
    await user.click(screen.getByRole("button", { name: /^reassign$/i }));

    await waitFor(() => expect(api.setTicketOwner).toHaveBeenCalledWith(101, 10, detail().updatedAt));
  });
});

describe("UI-28 — IT Priority control (AC-38)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockShell();
  });
  afterEach(() => vi.restoreAllMocks());

  it("stays disabled until the value changes, and shows the Requested Priority helper", async () => {
    const user = userEvent.setup();
    await openTicketDetail(
      user,
      detail({
        ticketOwner: { id: 9, name: "Sam Staff", role: "ITStaff" },
        requestedPriority: "HIGH",
        itPriority: "HIGH",
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
      }),
    );

    expect(screen.getByText(/requested by requester: high/i)).toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: /save it priority/i });
    expect(saveButton).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/^it priority$/i), "URGENT");
    expect(saveButton).toBeEnabled();
  });

  it("shows a success message after saving", async () => {
    const user = userEvent.setup();
    const updated = detail({
      ticketOwner: { id: 9, name: "Sam Staff", role: "ITStaff" },
      itPriority: "URGENT",
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
    });
    vi.spyOn(api, "setItPriority").mockResolvedValue(updated);
    await openTicketDetail(
      user,
      detail({
        ticketOwner: { id: 9, name: "Sam Staff", role: "ITStaff" },
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
      }),
    );

    await user.selectOptions(screen.getByLabelText(/^it priority$/i), "URGENT");
    await user.click(screen.getByRole("button", { name: /save it priority/i }));

    expect(await screen.findByText(/it priority updated to urgent/i)).toBeInTheDocument();
  });

  it("shows a read-only badge and explanation for a non-owner", async () => {
    const user = userEvent.setup();
    await openTicketDetail(
      user,
      detail({
        ticketOwner: { id: 10, name: "Other Staff", role: "ITStaff" },
        permissions: {
          canClaim: false,
          canAssign: false,
          canReassign: false,
          canChangeItPriority: false,
          canChangeStatus: false,
          canAddPublicComment: true,
          canAddInternalNote: true,
          canManageAttachments: false,
        },
      }),
    );

    expect(screen.queryByLabelText(/^it priority$/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/only the ticket owner or an administrator can change it priority/i),
    ).toBeInTheDocument();
  });
});

// UI-29's old status dropdown/confirm-dialog coverage moved to the Lab 4
// Ticket Workflow panel, which replaced it (PATCH .../status is retired —
// see server/tests/lab-04/ticket-workflow.api.test.ts and this suite's
// sibling client/tests/lab-04/TicketWorkflow.test.tsx).

describe("UI-31 — Internal Notes separation (AC-43, FR-40)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockShell();
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows distinct sections, buttons, and independent drafts", async () => {
    const user = userEvent.setup();
    await openTicketDetail(user, detail());

    expect(screen.getByText(/public — visible to the requester/i)).toBeInTheDocument();
    expect(screen.getByText(/internal — never visible to the requester/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /post public comment/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /post internal note/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/add a public comment/i), "Public draft");
    await user.type(screen.getByLabelText(/add an internal note/i), "Internal draft");

    expect(screen.getByLabelText(/add a public comment/i)).toHaveValue("Public draft");
    expect(screen.getByLabelText(/add an internal note/i)).toHaveValue("Internal draft");
  });

  it("refreshes the ticket after a Public Comment, so the next operation is not reported as stale", async () => {
    const user = userEvent.setup();
    const owner = { id: 9, name: "Sam Staff", role: "ITStaff" as const };
    const permissions = {
      canClaim: false,
      canAssign: false,
      canReassign: true,
      canChangeItPriority: true,
      canChangeStatus: true,
      canAddPublicComment: true,
      canAddInternalNote: true,
      canManageAttachments: false,
    };
    // A Public Comment moves the ticket's Last Updated on the server (BR-43).
    const before = detail({ ticketOwner: owner, permissions });
    const after = detail({ ticketOwner: owner, permissions, updatedAt: "2026-09-05T13:00:00.000Z" });

    // The screen hands these to its children when it renders, so stub them first.
    vi.spyOn(api, "postPublicComment").mockResolvedValue({
      id: 1,
      body: "Restarted the spooler.",
      author: owner,
      createdAt: "2026-09-05T13:00:00.000Z",
    });
    const setPriority = vi.spyOn(api, "setItPriority").mockResolvedValue(after);

    await openTicketDetail(user, before);
    // From here on the server reports the newer Last Updated.
    const fetchDetail = vi.mocked(api.fetchStaffTicketDetail);
    fetchDetail.mockClear();
    fetchDetail.mockResolvedValue(after);

    await user.type(screen.getByLabelText(/add a public comment/i), "Restarted the spooler.");
    await user.click(screen.getByRole("button", { name: /post public comment/i }));
    await waitFor(() => expect(fetchDetail).toHaveBeenCalled());
    // The refresh happens in place: the page does not blank back to "Loading ticket…".
    expect(screen.queryByText(/loading ticket/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^it priority$/i), "URGENT");
    await user.click(screen.getByRole("button", { name: /save it priority/i }));

    await waitFor(() =>
      expect(setPriority).toHaveBeenCalledWith(101, "URGENT", "2026-09-05T13:00:00.000Z"),
    );
  });

  it("is present on a Closed ticket", async () => {
    const user = userEvent.setup();
    await openTicketDetail(
      user,
      detail({
        currentStatus: "Closed",
        permissions: {
          canClaim: false,
          canAssign: false,
          canReassign: false,
          canChangeItPriority: false,
          canChangeStatus: false,
          canAddPublicComment: false,
          canAddInternalNote: true,
          canManageAttachments: false,
        },
      }),
    );

    expect(screen.getByLabelText(/add an internal note/i)).toBeInTheDocument();
  });
});

describe("UI-32 — read-only information and Attachments (AC-24, AC-45)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockShell();
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows active attachments with Download and removed ones without it", async () => {
    const user = userEvent.setup();
    await openTicketDetail(
      user,
      detail({
        attachments: [
          {
            id: 1,
            originalFilename: "kept.png",
            mimeType: "image/png",
            fileSize: 100,
            uploadedAt: "2026-09-05T12:30:00.000Z",
            removedAt: null,
            removalReason: null,
          },
          {
            id: 2,
            originalFilename: "gone.png",
            mimeType: "image/png",
            fileSize: 100,
            uploadedAt: "2026-09-05T12:30:00.000Z",
            removedAt: "2026-09-06T00:00:00.000Z",
            removalReason: "Duplicate",
          },
        ],
      }),
    );

    expect(screen.getByRole("link", { name: /download kept\.png/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /download gone\.png/i })).not.toBeInTheDocument();
    expect(screen.getByText(/reason: duplicate/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/select attachments/i)).not.toBeInTheDocument();
  });

  it("shows the resolution strip when set", async () => {
    const user = userEvent.setup();
    await openTicketDetail(user, detail({ problemAppearsResolvedAt: "2026-09-06T00:00:00.000Z" }));

    expect(
      screen.getByText(/requester reported the problem appears resolved on/i),
    ).toBeInTheDocument();
  });
});

describe("UI-33 — staff detail page states (AC-59, FR-16)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockShell();
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows Not Found for a nonexistent ticket", async () => {
    const user = userEvent.setup();
    vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(STAFF);
    vi.spyOn(api, "fetchQueue").mockResolvedValue({
      data: [
        {
          id: 999,
          ticketNumber: "TT-MISSING",
          ticketDate: "2026-09-05T12:30:00.000Z",
          summary: "Gone",
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
      meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, counts: { active: 1, unassigned: 1, assignedToMe: 0 } },
    });
    vi.spyOn(api, "fetchStaffTicketDetail").mockRejectedValue(
      new api.ApiError("Ticket not found.", { status: 404, code: "NOT_FOUND" }),
    );

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /^ticket queue$/i }));
    await user.click(await screen.findByRole("button", { name: /TT-MISSING/ }));

    expect(await screen.findByText(/this ticket does not exist/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /back to queue/i }).length).toBeGreaterThan(0);
  });

  it("lets an Administrator open the same detail screen", async () => {
    const user = userEvent.setup();
    await openTicketDetail(user, detail(), ADMIN);
    expect(await screen.findByTestId("detail-ticket-number")).toHaveTextContent("TT-20260905-0001");
  });
});
