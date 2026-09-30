import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThreadSection from "../../src/ThreadSection.js";
import AttachmentSection from "../../src/AttachmentSection.js";
import ActionsTakenSection from "../../src/ActionsTakenSection.js";
import Lab2App from "../../src/Lab2App.js";
import * as api from "../../src/api.js";
import { renderAsRequester, REQUESTER } from "../lab-02/testAuth.js";

// R-02 — docs/lab-04/tests.md §6 (FR-25, AC-32). Rapid repeat / double-click
// submit on comments, notes, attachments, ticket creation, and Actions Taken
// forms must produce at most one record per logical submit. Every form
// already guards on a `submitting`/`posting`/`uploading` boolean that
// disables the trigger control; these tests assert that guard holds under a
// literal double click, not just that the guard variable exists.

afterEach(() => vi.restoreAllMocks());

function pendingPromise<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("Public Comments / Internal Notes composer", () => {
  it("a second click while posting does not send a second request", async () => {
    const user = userEvent.setup();
    const { promise, resolve } = pendingPromise<api.ThreadEntry>();
    const postEntry = vi.fn().mockReturnValue(promise);

    render(
      <ThreadSection
        kind="public"
        ticketId={101}
        currentUserId={REQUESTER.id}
        canPost
        refreshToken={0}
        onPosted={() => {}}
        fetchEntries={vi.fn().mockResolvedValue([])}
        postEntry={postEntry}
      />,
    );

    await screen.findByText(/no public comments yet/i);
    await user.type(screen.getByLabelText(/add a public comment/i), "The battery still drains fast.");
    const submit = screen.getByRole("button", { name: /^post public comment$/i });
    await user.click(submit);

    expect(submit).toBeDisabled();
    await user.click(submit).catch(() => {});
    expect(postEntry).toHaveBeenCalledTimes(1);

    resolve({
      id: 1,
      body: "The battery still drains fast.",
      author: { id: REQUESTER.id, name: REQUESTER.name, role: "Requester" },
      createdAt: "2026-09-05T12:30:00.000Z",
    });
    await screen.findByText("The battery still drains fast.");
  });
});

describe("Attachment upload", () => {
  it("disables the file input while an upload is in flight, so a second selection cannot race it", async () => {
    const user = userEvent.setup();
    const { promise, resolve } = pendingPromise<api.AttachmentMetadata>();
    const uploadSpy = vi.spyOn(api, "uploadAttachment").mockReturnValue(promise);

    render(<AttachmentSection ticketId={101} attachments={[]} onChanged={vi.fn()} />);

    const input = screen.getByLabelText(/add an attachment/i) as HTMLInputElement;
    const file = new File(["x"], "screenshot.png", { type: "image/png" });
    await user.upload(input, file);

    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(input).toBeDisabled();

    await act(async () => {
      resolve({
        id: 1,
        originalFilename: "screenshot.png",
        mimeType: "image/png",
        fileSize: 1,
        uploadedAt: "2026-09-05T12:30:00.000Z",
        removedAt: null,
        removalReason: null,
      });
      await promise;
    });
    await vi.waitFor(() => expect(input).not.toBeDisabled());
    expect(uploadSpy).toHaveBeenCalledTimes(1);
  });
});

describe("Actions Taken — Add Action", () => {
  it("a second click while saving does not send a second create request", async () => {
    const user = userEvent.setup();
    const { promise, resolve } = pendingPromise<api.ActionTaken>();
    vi.spyOn(api, "fetchActionsTaken").mockResolvedValue({ items: [], total: 0 });
    const createSpy = vi.spyOn(api, "createActionTaken").mockReturnValue(promise);

    render(
      <ActionsTakenSection
        ticketId={101}
        ticketCreatedAt="2026-09-05T12:00:00.000Z"
        currentUserId={9}
        canWrite
        ticketLocked={false}
        assignableUsers={[{ id: 9, name: "IT Staff 1", role: "ITStaff" }]}
      />,
    );

    await screen.findByText(/no actions recorded yet/i);
    await user.click(screen.getByRole("button", { name: /^\+ add action$/i }));

    const form = screen.getByRole("form", { name: /^add action$/i });
    await user.type(within(form).getByLabelText(/^description/i), "Investigated the printer jam.");
    await user.type(within(form).getByLabelText(/^result/i), "Cleared the jam.");
    await user.selectOptions(within(form).getByLabelText(/^performed by/i), "9");

    const submit = within(form).getByRole("button", { name: /^save action$/i });
    await user.click(submit);

    expect(submit).toBeDisabled();
    await user.click(submit).catch(() => {});
    expect(createSpy).toHaveBeenCalledTimes(1);

    resolve({
      id: 1,
      ticketId: 101,
      actionAt: "2026-09-05T12:30:00.000Z",
      description: "Investigated the printer jam.",
      status: "Completed",
      result: "Cleared the jam.",
      performedBy: { id: 9, name: "IT Staff 1", role: "ITStaff" },
      isPerformedByOwner: false,
      followUpRequired: false,
      followUpNote: null,
      attachmentNotes: null,
      completedAt: "2026-09-05T12:30:00.000Z",
      cancelledAt: null,
      cancelReason: null,
      version: 1,
      createdAt: "2026-09-05T12:30:00.000Z",
      updatedAt: "2026-09-05T12:30:00.000Z",
      updatedBy: null,
    });
    await screen.findByText("Investigated the printer jam.");
  });
});

describe("Create Ticket", () => {
  it("a second click while submitting does not send a second create request", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchCategories").mockResolvedValue([{ id: 7, name: "Hardware" }]);
    vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue([{ id: 21, name: "Corporate Laptop" }]);
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue({
      generatedAt: "2026-10-01T00:00:00.000Z",
      timeZone: "Asia/Bangkok",
      metrics: [],
      needsAttention: [],
      recentTickets: [],
    });
    const { promise, resolve } = pendingPromise<api.CreatedTicket>();
    const createSpy = vi.spyOn(api, "createTicket").mockReturnValue(promise);

    renderAsRequester(<Lab2App />);
    const nav = await screen.findByRole("navigation", { name: /main/i });
    await user.click(within(nav).getByRole("button", { name: /^create ticket$/i }));

    const form = await screen.findByRole("form", { name: /create ticket/i });
    await user.selectOptions(within(form).getByLabelText(/^category/i), "7");
    await user.selectOptions(within(form).getByLabelText(/related system/i), "21");
    await user.type(within(form).getByLabelText(/ticket summary/i), "Laptop battery drains quickly");
    await user.type(
      within(form).getByLabelText(/^description/i),
      "The battery reaches zero within about an hour of use.",
    );
    await user.selectOptions(within(form).getByLabelText(/requested priority/i), "MEDIUM");

    const submit = within(form).getByRole("button", { name: /^create ticket$/i });
    await user.click(submit);

    expect(submit).toBeDisabled();
    await user.click(submit).catch(() => {});
    expect(createSpy).toHaveBeenCalledTimes(1);

    resolve({
      id: 101,
      ticketNumber: "TT-20260905-0042",
      ticketDate: "2026-09-05T12:30:00.000Z",
      requester: { id: REQUESTER.id, name: REQUESTER.name },
      category: { id: 7, name: "Hardware" },
      relatedSystem: { id: 21, name: "Corporate Laptop" },
      summary: "Laptop battery drains quickly",
      description: "The battery reaches zero within about an hour of use.",
      requestedPriority: "MEDIUM",
      currentStatus: "New",
      createdAt: "2026-09-05T12:30:00.000Z",
      updatedAt: "2026-09-05T12:30:00.000Z",
    });
    await screen.findByTestId("created-ticket-number");
  });
});
