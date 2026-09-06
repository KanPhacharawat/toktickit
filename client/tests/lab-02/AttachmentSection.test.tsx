import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AttachmentSection from "../../src/AttachmentSection.js";
import * as api from "../../src/api.js";
import {
  MAX_ACTIVE_ATTACHMENTS,
  MAX_FILE_SIZE_BYTES,
} from "../../src/attachmentRules.js";

// UI-11 — Attachment UI (AC-19, AC-20, AC-21).
// "Upload, removed state, confirmation, and blocked download are shown
// correctly."

const REQUESTER_ID = 11;
const TICKET_ID = 101;

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

function makeFile(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

/** Renders the section in isolation, as tests.md names this suite. */
function renderSection(
  attachments: api.AttachmentMetadata[] = [],
  onChanged = vi.fn(),
) {
  render(
    <AttachmentSection
      requesterId={REQUESTER_ID}
      ticketId={TICKET_ID}
      attachments={attachments}
      onChanged={onChanged}
    />,
  );
  return { onChanged };
}

describe("UI-11 — Attachment UI (AC-19, AC-20, AC-21)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Upload (AC-19)
  // -------------------------------------------------------------------------
  it("shows an empty state when the ticket has no attachments", () => {
    renderSection([]);
    expect(screen.getByTestId("no-attachments")).toBeInTheDocument();
  });

  it("uploads a permitted file and reports the change (AC-19)", async () => {
    const user = userEvent.setup();
    const uploadSpy = vi
      .spyOn(api, "uploadAttachment")
      .mockResolvedValue(attachment());
    const { onChanged } = renderSection([]);

    await user.upload(
      screen.getByLabelText(/add an attachment/i),
      makeFile("screenshot.png", "image/png", 2048),
    );

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledTimes(1));
    expect(uploadSpy.mock.calls[0][0]).toBe(REQUESTER_ID);
    expect(uploadSpy.mock.calls[0][1]).toBe(TICKET_ID);
    // The parent is told to refresh so the new metadata appears.
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("displays the metadata of an active attachment (AC-19)", () => {
    renderSection([attachment()]);

    const item = screen.getByTestId("active-attachment");
    expect(within(item).getByTestId("attachment-name")).toHaveTextContent(
      "screenshot.png",
    );
    expect(item).toHaveTextContent(/PNG image/);
    expect(item).toHaveTextContent(/177\.8 KB/);
    expect(item).toHaveTextContent(/Uploaded/);
  });

  it("offers a download action for an active attachment (AC-19)", () => {
    renderSection([attachment()]);

    const link = screen.getByRole("link", { name: /download screenshot\.png/i });
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining(
        `/api/requesters/${REQUESTER_ID}/tickets/${TICKET_ID}/attachments/501`,
      ),
    );
  });

  // -------------------------------------------------------------------------
  // Upload validation (AC-18)
  // -------------------------------------------------------------------------
  it("rejects an unsupported file type without calling the API (BR-29)", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const uploadSpy = vi.spyOn(api, "uploadAttachment");
    renderSection([]);

    await user.upload(
      screen.getByLabelText(/add an attachment/i),
      makeFile("virus.exe", "application/x-msdownload", 1024),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /only jpg, jpeg, png, webp, and pdf/i,
    );
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("rejects a file larger than 5 MB without calling the API (BR-30)", async () => {
    const user = userEvent.setup();
    const uploadSpy = vi.spyOn(api, "uploadAttachment");
    renderSection([]);

    await user.upload(
      screen.getByLabelText(/add an attachment/i),
      makeFile("huge.pdf", "application/pdf", MAX_FILE_SIZE_BYTES + 1),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /5\.0 MB or smaller/i,
    );
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("blocks a sixth active attachment (BR-31)", () => {
    const five = Array.from({ length: MAX_ACTIVE_ATTACHMENTS }, (_, i) =>
      attachment({ id: 500 + i, originalFilename: `file-${i}.png` }),
    );
    renderSection(five);

    expect(screen.getByLabelText(/add an attachment/i)).toBeDisabled();
    expect(screen.getByText(/attachment limit reached/i)).toBeInTheDocument();
  });

  it("counts only active attachments towards the limit (BR-31)", () => {
    const four = Array.from({ length: 4 }, (_, i) =>
      attachment({ id: 500 + i, originalFilename: `file-${i}.png` }),
    );
    renderSection([
      ...four,
      attachment({
        id: 599,
        originalFilename: "removed.png",
        removedAt: "2026-09-05T12:50:00.000Z",
        removalReason: "Freed a slot",
      }),
    ]);

    // Four active plus one removed leaves a slot open.
    expect(screen.getByLabelText(/add an attachment/i)).toBeEnabled();
  });

  it("reports an upload failure safely (AC-23)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "uploadAttachment").mockRejectedValue(
      new api.ApiError("Could not upload the attachment. Please try again.", {
        status: 500,
        code: "INTERNAL_ERROR",
      }),
    );
    renderSection([]);

    await user.upload(
      screen.getByLabelText(/add an attachment/i),
      makeFile("screenshot.png", "image/png", 2048),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/attachment upload failed/i);
    expect(alert.textContent).not.toMatch(/prisma|postgres|sql|stack|\.ts:/i);
  });

  it("continues with the remaining files when one upload fails", async () => {
    const user = userEvent.setup();
    const uploadSpy = vi
      .spyOn(api, "uploadAttachment")
      .mockResolvedValueOnce(attachment({ id: 501 }))
      .mockRejectedValueOnce(
        new api.ApiError("Could not upload the attachment.", { status: 500 }),
      )
      .mockResolvedValueOnce(attachment({ id: 503 }));
    renderSection([]);

    await user.upload(screen.getByLabelText(/add an attachment/i), [
      makeFile("one.png", "image/png", 1024),
      makeFile("two.png", "image/png", 1024),
      makeFile("three.png", "image/png", 1024),
    ]);

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledTimes(3));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("two.png");
    expect(alert).not.toHaveTextContent("one.png");
  });

  // -------------------------------------------------------------------------
  // Removal confirmation (AC-20, BR-35)
  // -------------------------------------------------------------------------
  it("opens a confirmation UI rather than removing immediately (BR-35)", async () => {
    const user = userEvent.setup();
    const removeSpy = vi.spyOn(api, "removeAttachment");
    renderSection([attachment()]);

    await user.click(
      screen.getByRole("button", { name: /remove screenshot\.png/i }),
    );

    expect(screen.getByLabelText(/reason for removing/i)).toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("refuses an empty removal reason (BR-35)", async () => {
    const user = userEvent.setup();
    const removeSpy = vi.spyOn(api, "removeAttachment");
    renderSection([attachment()]);

    await user.click(
      screen.getByRole("button", { name: /remove screenshot\.png/i }),
    );
    await user.click(screen.getByRole("button", { name: /confirm removal/i }));

    expect(
      await screen.findByText(/a removal reason is required/i),
    ).toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("refuses a whitespace-only removal reason (BR-35)", async () => {
    const user = userEvent.setup();
    const removeSpy = vi.spyOn(api, "removeAttachment");
    renderSection([attachment()]);

    await user.click(
      screen.getByRole("button", { name: /remove screenshot\.png/i }),
    );
    await user.type(screen.getByLabelText(/reason for removing/i), "    ");
    await user.click(screen.getByRole("button", { name: /confirm removal/i }));

    expect(
      await screen.findByText(/a removal reason is required/i),
    ).toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("marks the reason field as required (AC-25)", async () => {
    const user = userEvent.setup();
    renderSection([attachment()]);

    await user.click(
      screen.getByRole("button", { name: /remove screenshot\.png/i }),
    );

    const field = screen.getByLabelText(/reason for removing/i);
    const label = document.querySelector(`label[for="${field.id}"]`);
    // Asterisk plus text, never colour alone.
    expect(label?.textContent).toContain("*");
    expect(label?.textContent).toMatch(/required/i);
  });

  it("soft-removes with a trimmed reason (AC-20)", async () => {
    const user = userEvent.setup();
    const removeSpy = vi.spyOn(api, "removeAttachment").mockResolvedValue({
      id: 501,
      removedAt: "2026-09-05T12:50:00.000Z",
      removalReason: "Duplicate screenshot",
    });
    const { onChanged } = renderSection([attachment()]);

    await user.click(
      screen.getByRole("button", { name: /remove screenshot\.png/i }),
    );
    await user.type(
      screen.getByLabelText(/reason for removing/i),
      "  Duplicate screenshot  ",
    );
    await user.click(screen.getByRole("button", { name: /confirm removal/i }));

    await waitFor(() =>
      expect(removeSpy).toHaveBeenCalledWith(
        REQUESTER_ID,
        TICKET_ID,
        501,
        "Duplicate screenshot",
      ),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("lets the user cancel a removal", async () => {
    const user = userEvent.setup();
    const removeSpy = vi.spyOn(api, "removeAttachment");
    renderSection([attachment()]);

    await user.click(
      screen.getByRole("button", { name: /remove screenshot\.png/i }),
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(
      screen.queryByLabelText(/reason for removing/i),
    ).not.toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("reports a failed removal safely and keeps the attachment active (AC-23)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "removeAttachment").mockRejectedValue(
      new api.ApiError("Could not remove the attachment. Please try again.", {
        status: 500,
        code: "INTERNAL_ERROR",
      }),
    );
    renderSection([attachment()]);

    await user.click(
      screen.getByRole("button", { name: /remove screenshot\.png/i }),
    );
    await user.type(screen.getByLabelText(/reason for removing/i), "Mistake");
    await user.click(screen.getByRole("button", { name: /confirm removal/i }));

    expect(
      await screen.findByText(/could not remove the attachment/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("active-attachment")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Removed state and blocked download (AC-21, BR-37, BR-38)
  // -------------------------------------------------------------------------
  it("keeps removed attachment metadata visible and marked (BR-38)", () => {
    renderSection([
      attachment({
        removedAt: "2026-09-05T12:50:00.000Z",
        removalReason: "Duplicate screenshot",
      }),
    ]);

    const removed = screen.getByTestId("removed-attachment");
    expect(within(removed).getByTestId("attachment-name")).toHaveTextContent(
      "screenshot.png",
    );
    expect(removed).toHaveTextContent(/PNG image/);
    expect(removed).toHaveTextContent(/177\.8 KB/);
    expect(removed).toHaveTextContent(/Duplicate screenshot/);
    // The removed state is stated in text, not by shading alone (AC-25).
    expect(within(removed).getByText(/^removed$/i)).toBeInTheDocument();
  });

  it("offers no download or preview action for a removed attachment (AC-21, BR-37)", () => {
    renderSection([
      attachment({
        removedAt: "2026-09-05T12:50:00.000Z",
        removalReason: "Duplicate screenshot",
      }),
    ]);

    const removed = screen.getByTestId("removed-attachment");
    // The link is absent entirely, not merely disabled.
    expect(within(removed).queryByRole("link")).not.toBeInTheDocument();
    expect(
      within(removed).queryByRole("button", { name: /download/i }),
    ).not.toBeInTheDocument();
    expect(
      within(removed).queryByRole("button", { name: /^remove/i }),
    ).not.toBeInTheDocument();
  });

  it("still offers download for the remaining active attachments", () => {
    renderSection([
      attachment({ id: 501, originalFilename: "kept.png" }),
      attachment({
        id: 502,
        originalFilename: "gone.png",
        removedAt: "2026-09-05T12:50:00.000Z",
        removalReason: "Duplicate",
      }),
    ]);

    expect(screen.getByTestId("active-attachment")).toHaveTextContent("kept.png");
    expect(screen.getByTestId("removed-attachment")).toHaveTextContent("gone.png");
    expect(screen.getAllByRole("link", { name: /download/i })).toHaveLength(1);
  });
});
