import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Lab2App from "../../src/Lab2App.js";
import * as api from "../../src/api.js";
import { MAX_FILE_SIZE_BYTES } from "../../src/attachmentRules.js";

const REQUESTERS: api.DevelopmentRequester[] = [
  { id: 11, name: "Alpha Requester", email: "alpha@example.com", department: "Finance" },
  { id: 22, name: "Beta Requester", email: "beta@example.com", department: "Library" },
];

const LIST_ROW: api.TicketListRow = {
  id: 101,
  ticketNumber: "TT-20260905-0001",
  summary: "Printer jams constantly",
  category: "Hardware",
  requestedPriority: "LOW",
  currentStatus: "New",
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
    requester: { id: 11, name: "Alpha Requester" },
    category: { id: 2, name: "Hardware" },
    relatedSystem: { id: 4, name: "Corporate Laptop" },
    summary: "Printer jams constantly",
    description: "The office printer jams on every multi-page job.",
    requestedPriority: "LOW",
    currentStatus: "New",
    createdAt: "2026-09-05T12:30:00.000Z",
    updatedAt: "2026-09-05T12:30:00.000Z",
    attachments: [],
    ...overrides,
  };
}

function mockShell() {
  vi.spyOn(api, "fetchActiveRequesters").mockResolvedValue(REQUESTERS);
  vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
  vi.spyOn(api, "fetchMyTickets").mockResolvedValue({
    data: [LIST_ROW],
    meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
  });
}

/** Selects a requester, then opens the ticket from the list. */
async function openDetail(
  user: ReturnType<typeof userEvent.setup>,
  requester: RegExp = /Alpha Requester/,
) {
  render(<Lab2App />);

  await user.selectOptions(
    await screen.findByLabelText(/development requester/i),
    screen.getByRole("option", { name: requester }),
  );
  await user.click(screen.getByRole("button", { name: /continue/i }));

  await user.click(await screen.findByRole("button", { name: /TT-20260905-0001/ }));
  await screen.findByRole("heading", { name: /ticket detail/i });
}

function makeFile(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("Requester Ticket Detail", () => {
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

    // Scoped to the selected requester and the chosen ticket.
    expect(spy).toHaveBeenCalledWith(11, 101);

    expect(await screen.findByTestId("detail-ticket-number")).toHaveTextContent(
      "TT-20260905-0001",
    );
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
      expect(screen.getByText(label)).toBeInTheDocument();
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
  it("shows a safe state when the ticket belongs to another requester", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockRejectedValue(
      new api.ApiError("You do not have access to this ticket.", {
        status: 403,
        code: "FORBIDDEN",
      }),
    );

    await openDetail(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/not available/i);
    // BR-09 — nothing about the real owner is shown.
    expect(alert.textContent).not.toMatch(/Beta Requester|owner|owned by/i);
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
  // UI-11 — attachments (AC-19)
  // -------------------------------------------------------------------------
  it("lists active attachment metadata with a download action", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(
      detail({ attachments: [attachment()] }),
    );

    await openDetail(user);

    const item = await screen.findByTestId("active-attachment");
    expect(within(item).getByTestId("attachment-name")).toHaveTextContent(
      "screenshot.png",
    );
    expect(item).toHaveTextContent(/PNG image/);
    expect(item).toHaveTextContent(/177\.8 KB/);
    expect(
      within(item).getByRole("link", { name: /download screenshot\.png/i }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("/tickets/101/attachments/501"),
    );
  });

  it("shows an empty state when the ticket has no attachments", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(detail());

    await openDetail(user);

    expect(await screen.findByTestId("no-attachments")).toBeInTheDocument();
  });

  it("uploads a permitted attachment and refreshes the list", async () => {
    const user = userEvent.setup();
    const uploadSpy = vi
      .spyOn(api, "uploadAttachment")
      .mockResolvedValue(attachment());
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

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledTimes(1));
    expect(uploadSpy.mock.calls[0][0]).toBe(11);
    expect(uploadSpy.mock.calls[0][1]).toBe(101);
    // The detail is refetched so the new attachment appears.
    expect(await screen.findByTestId("active-attachment")).toBeInTheDocument();
    expect(detailSpy).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // UI-11 — attachment validation (AC-18)
  // -------------------------------------------------------------------------
  it("rejects an unsupported file type without calling the API", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const uploadSpy = vi.spyOn(api, "uploadAttachment");
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(detail());

    await openDetail(user);
    await user.upload(
      screen.getByLabelText(/add an attachment/i),
      makeFile("virus.exe", "application/x-msdownload", 1024),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /only jpg, jpeg, png, webp, and pdf/i,
    );
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("rejects a file larger than 5 MB without calling the API", async () => {
    const user = userEvent.setup();
    const uploadSpy = vi.spyOn(api, "uploadAttachment");
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(detail());

    await openDetail(user);
    await user.upload(
      screen.getByLabelText(/add an attachment/i),
      makeFile("huge.pdf", "application/pdf", MAX_FILE_SIZE_BYTES + 1),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /5\.0 MB or smaller/i,
    );
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("uploads the remaining files when one of several fails", async () => {
    const user = userEvent.setup();
    const uploadSpy = vi
      .spyOn(api, "uploadAttachment")
      .mockResolvedValueOnce(attachment({ id: 501, originalFilename: "one.png" }))
      .mockRejectedValueOnce(
        new api.ApiError("Could not upload the attachment.", { status: 500 }),
      )
      .mockResolvedValueOnce(attachment({ id: 503, originalFilename: "three.png" }));
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(detail());

    await openDetail(user);
    await user.upload(screen.getByLabelText(/add an attachment/i), [
      makeFile("one.png", "image/png", 1024),
      makeFile("two.png", "image/png", 1024),
      makeFile("three.png", "image/png", 1024),
    ]);

    // The third file is still attempted after the second one fails.
    await waitFor(() => expect(uploadSpy).toHaveBeenCalledTimes(3));

    const alert = await screen.findByRole("alert");
    // The failure names the file it belongs to.
    expect(alert).toHaveTextContent("two.png");
    expect(alert).not.toHaveTextContent("one.png");
    expect(alert).not.toHaveTextContent("three.png");
  });

  it("disables the picker once five attachments are active (BR-31)", async () => {
    const user = userEvent.setup();
    const five = Array.from({ length: 5 }, (_, i) =>
      attachment({ id: 500 + i, originalFilename: `file-${i}.png` }),
    );
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(
      detail({ attachments: five }),
    );

    await openDetail(user);

    expect(await screen.findByLabelText(/add an attachment/i)).toBeDisabled();
    expect(screen.getByText(/attachment limit reached/i)).toBeInTheDocument();
  });

  it("reports a failed upload safely and keeps the ticket on screen (BR-34)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "uploadAttachment").mockRejectedValue(
      new api.ApiError("Could not upload the attachment. Please try again.", {
        status: 500,
        code: "INTERNAL_ERROR",
      }),
    );
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(detail());

    await openDetail(user);
    await user.upload(
      screen.getByLabelText(/add an attachment/i),
      makeFile("screenshot.png", "image/png", 2048),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/attachment upload failed/i);
    expect(alert.textContent).not.toMatch(/prisma|postgres|sql|stack|\.ts:/i);
    // BR-34 — the ticket itself is untouched and still displayed.
    expect(screen.getByTestId("detail-ticket-number")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // UI-11 — soft removal (AC-20, AC-21)
  // -------------------------------------------------------------------------
  it("requires a confirmation and a reason before removing (BR-35)", async () => {
    const user = userEvent.setup();
    const removeSpy = vi.spyOn(api, "removeAttachment");
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(
      detail({ attachments: [attachment()] }),
    );

    await openDetail(user);
    await user.click(
      await screen.findByRole("button", { name: /remove screenshot\.png/i }),
    );

    // A confirmation step appears rather than removing immediately.
    const reason = await screen.findByLabelText(/reason for removing/i);
    expect(reason).toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();

    // An empty reason is refused, client-side.
    await user.click(screen.getByRole("button", { name: /confirm removal/i }));
    expect(
      await screen.findByText(/a removal reason is required/i),
    ).toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("soft-removes an attachment with a reason (AC-20)", async () => {
    const user = userEvent.setup();
    const removeSpy = vi.spyOn(api, "removeAttachment").mockResolvedValue({
      id: 501,
      removedAt: "2026-09-05T12:50:00.000Z",
      removalReason: "Duplicate screenshot",
    });
    vi.spyOn(api, "fetchTicketDetail")
      .mockResolvedValueOnce(detail({ attachments: [attachment()] }))
      .mockResolvedValue(
        detail({
          attachments: [
            attachment({
              removedAt: "2026-09-05T12:50:00.000Z",
              removalReason: "Duplicate screenshot",
            }),
          ],
        }),
      );

    await openDetail(user);
    await user.click(
      await screen.findByRole("button", { name: /remove screenshot\.png/i }),
    );
    await user.type(
      screen.getByLabelText(/reason for removing/i),
      "  Duplicate screenshot  ",
    );
    await user.click(screen.getByRole("button", { name: /confirm removal/i }));

    await waitFor(() =>
      expect(removeSpy).toHaveBeenCalledWith(11, 101, 501, "Duplicate screenshot"),
    );
  });

  it("keeps removed attachment metadata visible and marked (BR-38)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(
      detail({
        attachments: [
          attachment({
            removedAt: "2026-09-05T12:50:00.000Z",
            removalReason: "Duplicate screenshot",
          }),
        ],
      }),
    );

    await openDetail(user);

    const removed = await screen.findByTestId("removed-attachment");
    // Metadata remains.
    expect(within(removed).getByTestId("attachment-name")).toHaveTextContent(
      "screenshot.png",
    );
    expect(removed).toHaveTextContent(/PNG image/);
    expect(removed).toHaveTextContent(/Duplicate screenshot/);
    // The removed state is stated in text, not by shading alone (AC-25).
    expect(within(removed).getByText(/^removed$/i)).toBeInTheDocument();
  });

  it("offers no download or remove action for a removed attachment (BR-37)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(
      detail({
        attachments: [
          attachment({
            removedAt: "2026-09-05T12:50:00.000Z",
            removalReason: "Duplicate screenshot",
          }),
        ],
      }),
    );

    await openDetail(user);
    const removed = await screen.findByTestId("removed-attachment");

    // No link to the file content at all — not merely a disabled one.
    expect(within(removed).queryByRole("link")).not.toBeInTheDocument();
    expect(
      within(removed).queryByRole("button", { name: /download/i }),
    ).not.toBeInTheDocument();
    expect(
      within(removed).queryByRole("button", { name: /^remove/i }),
    ).not.toBeInTheDocument();
  });

  it("still allows downloading the remaining active attachments", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(
      detail({
        attachments: [
          attachment({ id: 501, originalFilename: "kept.png" }),
          attachment({
            id: 502,
            originalFilename: "gone.png",
            removedAt: "2026-09-05T12:50:00.000Z",
            removalReason: "Duplicate",
          }),
        ],
      }),
    );

    await openDetail(user);

    expect(await screen.findByTestId("active-attachment")).toHaveTextContent(
      "kept.png",
    );
    expect(screen.getByTestId("removed-attachment")).toHaveTextContent("gone.png");
    expect(screen.getAllByRole("link", { name: /download/i })).toHaveLength(1);
  });

  it("reports a failed removal safely and leaves the attachment active", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "removeAttachment").mockRejectedValue(
      new api.ApiError("Could not remove the attachment. Please try again.", {
        status: 500,
        code: "INTERNAL_ERROR",
      }),
    );
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(
      detail({ attachments: [attachment()] }),
    );

    await openDetail(user);
    await user.click(
      await screen.findByRole("button", { name: /remove screenshot\.png/i }),
    );
    await user.type(screen.getByLabelText(/reason for removing/i), "Mistake");
    await user.click(screen.getByRole("button", { name: /confirm removal/i }));

    expect(
      await screen.findByText(/could not remove the attachment/i),
    ).toBeInTheDocument();
    // The attachment is still shown as active.
    expect(screen.getByTestId("active-attachment")).toBeInTheDocument();
  });

  it("lets the user cancel a removal", async () => {
    const user = userEvent.setup();
    const removeSpy = vi.spyOn(api, "removeAttachment");
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(
      detail({ attachments: [attachment()] }),
    );

    await openDetail(user);
    await user.click(
      await screen.findByRole("button", { name: /remove screenshot\.png/i }),
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(
      screen.queryByLabelText(/reason for removing/i),
    ).not.toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();
  });
});
