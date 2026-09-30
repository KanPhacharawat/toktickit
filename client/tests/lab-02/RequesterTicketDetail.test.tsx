import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Lab2App from "../../src/Lab2App.js";
import * as api from "../../src/api.js";
import { renderAsRequester, REQUESTER } from "./testAuth.js";

const LIST_ROW: api.TicketListRow = {
  id: 101,
  ticketNumber: "TT-20260905-0001",
  summary: "Printer jams constantly",
  category: "Hardware",
  requestedPriority: "LOW",
  currentStatus: "New",
  ticketOwner: null,
  problemAppearsResolvedAt: null,
  updatedAt: "2026-09-05T12:30:00.000Z",
};

function attachment(
  overrides: Partial<api.AttachmentMetadata> = {},
): api.AttachmentMetadata {
  return {
    id: 501,
    originalFilename: "screenshot.png",
    mimeType: "image/png",
    fileSize: 182034,
    uploadedAt: "2026-09-05T12:40:00.000Z",
    removedAt: null,
    removalReason: null,
    ...overrides,
  };
}

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
    currentStatus: "New",
    ticketOwner: null,
    problemAppearsResolvedAt: null,
    createdAt: "2026-09-05T12:30:00.000Z",
    updatedAt: "2026-09-05T12:30:00.000Z",
    attachments: [],
    permissions: {
      canManageAttachments: true,
      canAddPublicComment: true,
      canReportProblemResolved: false,
    },
    ...overrides,
  };
}

function mockShell() {
  vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
  vi.spyOn(api, "fetchMyTickets").mockResolvedValue({
    data: [LIST_ROW],
    meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
  });
  vi.spyOn(api, "fetchPublicComments").mockResolvedValue([]);
}

/** Signs in as the fixture Requester, then opens the ticket from the list. */
async function openDetail(user: ReturnType<typeof userEvent.setup>) {
  renderAsRequester(<Lab2App />);

  await user.click(await screen.findByRole("button", { name: /TT-20260905-0001/ }));
  await screen.findByRole("heading", { name: /ticket detail/i });
}

function makeFile(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("UI-10 — Ticket Detail and ownership state (AC-12, AC-23)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockShell();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Opening an owned ticket (AC-12)
  // -------------------------------------------------------------------------
  it("opens a ticket the requester owns and shows every documented field", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(detail());

    await openDetail(user);

    // Scoped to the chosen ticket; ownership comes from the session.
    expect(spy).toHaveBeenCalledWith(101);

    expect(await screen.findByTestId("detail-ticket-number")).toHaveTextContent(
      "TT-20260905-0001",
    );
    const info = screen.getByRole("region", { name: /ticket information/i });
    for (const label of [
      /ticket number/i,
      /ticket date/i,
      /^requester$/i,
      /^category$/i,
      /related system/i,
      /requested priority/i,
      /current status/i,
      /ticket summary/i,
      /^description$/i,
    ]) {
      expect(within(info).getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByTestId("detail-status")).toHaveTextContent("New");
    expect(screen.getByTestId("detail-description")).toHaveTextContent(
      "The office printer jams on every multi-page job.",
    );
  });

  it("presents ticket information as read-only", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(detail());

    await openDetail(user);
    await screen.findByTestId("detail-ticket-number");

    const info = screen.getByRole("region", { name: /ticket information/i });
    // No editable control renders any ticket field.
    expect(within(info).queryAllByRole("textbox")).toHaveLength(0);
    expect(within(info).queryAllByRole("combobox")).toHaveLength(0);
    expect(info).toHaveTextContent(/read-only/i);
  });

  it("returns to My Tickets from the detail screen", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(detail());

    await openDetail(user);
    await user.click(screen.getByRole("button", { name: /back to my tickets/i }));

    expect(
      await screen.findByRole("heading", { name: /my tickets/i }),
    ).toBeInTheDocument();
  });

  it("shows a loading state while the ticket loads", async () => {
    const user = userEvent.setup();
    let resolvePending: (value: api.TicketDetail) => void = () => {};
    vi.spyOn(api, "fetchTicketDetail").mockReturnValue(
      new Promise((resolve) => {
        resolvePending = resolve;
      }),
    );

    await openDetail(user);
    expect(screen.getByRole("status")).toHaveTextContent(/loading ticket/i);

    resolvePending(detail());
    expect(await screen.findByTestId("detail-ticket-number")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // UI-10 — ownership failure (AC-12)
  // -------------------------------------------------------------------------
  it("shows a safe state when the ticket belongs to another requester (Lab 3 BR-09)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockRejectedValue(
      new api.ApiError("Ticket not found.", {
        status: 404,
        code: "NOT_FOUND",
      }),
    );

    await openDetail(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/not available/i);
    // BR-09 — nothing about the real owner is shown; identical to a
    // nonexistent ticket id.
    expect(alert.textContent).not.toMatch(/owner|owned by/i);
    // No ticket data leaks onto the screen.
    expect(screen.queryByTestId("detail-ticket-number")).not.toBeInTheDocument();
    expect(screen.queryByTestId("detail-description")).not.toBeInTheDocument();
  });

  it("shows a safe error with retry when loading fails unexpectedly", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(api, "fetchTicketDetail")
      .mockRejectedValueOnce(
        new api.ApiError("Could not load the ticket. Please try again.", {
          status: 500,
          code: "INTERNAL_ERROR",
        }),
      )
      .mockResolvedValue(detail());

    await openDetail(user);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/prisma|postgres|sql|stack|\.ts:/i);

    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByTestId("detail-ticket-number")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Wiring to the attachment section. The section's own behaviour is covered
  // by AttachmentSection.test.tsx (UI-11); these two assert the integration.
  // -------------------------------------------------------------------------
  it("refreshes the ticket after an attachment is uploaded", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "uploadAttachment").mockResolvedValue(attachment());
    const detailSpy = vi
      .spyOn(api, "fetchTicketDetail")
      .mockResolvedValueOnce(detail())
      .mockResolvedValue(detail({ attachments: [attachment()] }));

    await openDetail(user);
    await screen.findByTestId("no-attachments");

    await user.upload(
      screen.getByLabelText(/add an attachment/i),
      makeFile("screenshot.png", "image/png", 2048),
    );

    expect(await screen.findByTestId("active-attachment")).toBeInTheDocument();
    expect(detailSpy).toHaveBeenCalledTimes(2);
  });

  it("keeps the ticket on screen when an attachment upload fails (BR-34)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "uploadAttachment").mockRejectedValue(
      new api.ApiError("Could not upload the attachment.", { status: 500 }),
    );
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(detail());

    await openDetail(user);
    await user.upload(
      screen.getByLabelText(/add an attachment/i),
      makeFile("screenshot.png", "image/png", 2048),
    );

    // The refresh must not unmount the section and discard its message.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /attachment upload failed/i,
    );
    // BR-34 — the ticket itself is untouched and still displayed.
    expect(screen.getByTestId("detail-ticket-number")).toBeInTheDocument();
  });
});
