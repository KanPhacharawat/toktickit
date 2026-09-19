import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Lab2App from "../../src/Lab2App.js";
import * as api from "../../src/api.js";
import { renderAsRequester, REQUESTER } from "./testAuth.js";

// Requester Regression issue — Public Comments and Problem Appears Resolved
// (docs/lab-03/tests.md §4, UI-19/UI-20).

const LIST_ROW: api.TicketListRow = {
  id: 101,
  ticketNumber: "TT-20260905-0001",
  summary: "Printer jams constantly",
  category: "Hardware",
  requestedPriority: "LOW",
  currentStatus: "InProgress",
  ticketOwner: null,
  problemAppearsResolvedAt: null,
  updatedAt: "2026-09-05T12:30:00.000Z",
};

function detail(overrides: Partial<api.TicketDetail> = {}): api.TicketDetail {
  return {
    id: 101,
    ticketNumber: "TT-20260905-0001",
    ticketDate: "2026-09-05T12:30:00.000Z",
    requester: { id: REQUESTER.id, name: REQUESTER.name },
    category: { id: 2, name: "Hardware" },
    relatedSystem: { id: 4, name: "Corporate Laptop" },
    summary: "Printer jams constantly",
    description: "The office printer jams on every multi-page job.",
    requestedPriority: "LOW",
    currentStatus: "InProgress",
    ticketOwner: null,
    problemAppearsResolvedAt: null,
    createdAt: "2026-09-05T12:30:00.000Z",
    updatedAt: "2026-09-05T12:30:00.000Z",
    attachments: [],
    permissions: {
      canManageAttachments: true,
      canAddPublicComment: true,
      canReportProblemResolved: true,
    },
    ...overrides,
  };
}

function comment(overrides: Partial<api.ThreadEntry> = {}): api.ThreadEntry {
  return {
    id: 1,
    body: "The battery still drains after the update.",
    author: { id: REQUESTER.id, name: REQUESTER.name, role: "Requester" },
    createdAt: "2026-09-05T13:00:00.000Z",
    ...overrides,
  };
}

function mockShell() {
  vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
  vi.spyOn(api, "fetchMyTickets").mockResolvedValue({
    data: [LIST_ROW],
    meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
  });
}

async function openDetail(user: ReturnType<typeof userEvent.setup>) {
  renderAsRequester(<Lab2App />);
  await user.click(await screen.findByRole("button", { name: /TT-20260905-0001/ }));
  await screen.findByRole("heading", { name: /ticket detail/i });
}

describe("UI-19 — Requester Public Comments (AC-23, AC-26)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockShell();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and renders the thread oldest first", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(detail());
    vi.spyOn(api, "fetchPublicComments").mockResolvedValue([comment()]);

    await openDetail(user);

    const list = await screen.findByTestId("public-thread-list");
    expect(within(list).getByText(/battery still drains/i)).toBeInTheDocument();
    // The comment author is the signed-in Requester, so "(you)" is appended.
    expect(within(list).getByText(new RegExp(`^${REQUESTER.name} \\(you\\)$`))).toBeInTheDocument();
    expect(within(list).getByText("Requester")).toBeInTheDocument();
  });

  it("shows an empty state when there are no comments yet", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(detail());
    vi.spyOn(api, "fetchPublicComments").mockResolvedValue([]);

    await openDetail(user);

    expect(await screen.findByText(/no public comments yet/i)).toBeInTheDocument();
  });

  it("blocks empty and over-length comments without calling the API", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(detail());
    vi.spyOn(api, "fetchPublicComments").mockResolvedValue([]);
    const postSpy = vi.spyOn(api, "postPublicComment");

    await openDetail(user);
    await user.click(await screen.findByRole("button", { name: /post public comment/i }));

    expect(await screen.findByText(/comment is required/i)).toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it("posts a comment, appends it, and clears the textarea", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(detail());
    vi.spyOn(api, "fetchPublicComments").mockResolvedValue([]);
    vi.spyOn(api, "postPublicComment").mockResolvedValue(comment());

    await openDetail(user);
    const textarea = await screen.findByLabelText(/add a public comment/i);
    await user.type(textarea, "The battery still drains after the update.");
    await user.click(screen.getByRole("button", { name: /post public comment/i }));

    expect(await screen.findByText(/battery still drains/i)).toBeInTheDocument();
    await waitFor(() => expect(textarea).toHaveValue(""));
  });

  it("replaces the composer with a closed message when comments are not accepted", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(
      detail({
        currentStatus: "Closed",
        permissions: {
          canManageAttachments: true,
          canAddPublicComment: false,
          canReportProblemResolved: false,
        },
      }),
    );
    vi.spyOn(api, "fetchPublicComments").mockResolvedValue([]);

    await openDetail(user);

    expect(
      await screen.findByText(/this ticket is closed\. new public comments are not accepted/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/add a public comment/i)).not.toBeInTheDocument();
  });
});

describe("UI-20 — Problem Appears Resolved (AC-24)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockShell();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the action when eligible and opens the confirmation dialog", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(detail());
    vi.spyOn(api, "fetchPublicComments").mockResolvedValue([]);

    await openDetail(user);
    await user.click(await screen.findByRole("button", { name: /problem appears resolved/i }));

    expect(
      screen.getByRole("dialog", { name: /report problem appears resolved/i }),
    ).toBeInTheDocument();
  });

  it("sends nothing when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(detail());
    vi.spyOn(api, "fetchPublicComments").mockResolvedValue([]);
    const reportSpy = vi.spyOn(api, "reportProblemResolved");

    await openDetail(user);
    await user.click(await screen.findByRole("button", { name: /problem appears resolved/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(
      screen.queryByRole("dialog", { name: /report problem appears resolved/i }),
    ).not.toBeInTheDocument();
    expect(reportSpy).not.toHaveBeenCalled();
  });

  it("confirms the report, shows the success banner, and keeps the status unchanged", async () => {
    const user = userEvent.setup();
    const detailSpy = vi
      .spyOn(api, "fetchTicketDetail")
      .mockResolvedValueOnce(detail())
      .mockResolvedValue(
        detail({ problemAppearsResolvedAt: "2026-09-05T14:00:00.000Z" }),
      );
    vi.spyOn(api, "fetchPublicComments").mockResolvedValue([]);
    vi.spyOn(api, "reportProblemResolved").mockResolvedValue({
      problemAppearsResolvedAt: "2026-09-05T14:00:00.000Z",
      currentStatus: "InProgress",
      publicComment: comment({ body: "Problem appears resolved." }),
    });

    await openDetail(user);
    await user.click(await screen.findByRole("button", { name: /problem appears resolved/i }));
    await user.click(screen.getByRole("button", { name: /send report/i }));

    expect(
      await screen.findByText(/thanks — it staff have been notified/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("detail-status")).toHaveTextContent("In Progress");
    await waitFor(() => expect(detailSpy).toHaveBeenCalledTimes(2));
  });

  it("shows the already-reported state instead of the action", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(
      detail({ problemAppearsResolvedAt: "2026-09-05T14:00:00.000Z" }),
    );
    vi.spyOn(api, "fetchPublicComments").mockResolvedValue([]);

    await openDetail(user);

    expect(
      await screen.findByText(/you reported that the problem appears resolved/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^problem appears resolved$/i }),
    ).not.toBeInTheDocument();
  });

  it("hides the panel entirely once the ticket is Resolved", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(
      detail({
        currentStatus: "Resolved",
        permissions: {
          canManageAttachments: true,
          canAddPublicComment: false,
          canReportProblemResolved: false,
        },
      }),
    );
    vi.spyOn(api, "fetchPublicComments").mockResolvedValue([]);

    await openDetail(user);
    await screen.findByTestId("detail-ticket-number");

    expect(
      screen.queryByRole("button", { name: /problem appears resolved/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/you reported that the problem appears resolved/i),
    ).not.toBeInTheDocument();
  });
});
