import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThreadSection from "../../src/ThreadSection.js";
import ActionsTakenSection from "../../src/ActionsTakenSection.js";
import Lab2App from "../../src/Lab2App.js";
import * as api from "../../src/api.js";
import { renderAsRequester, REQUESTER } from "../lab-02/testAuth.js";

// R-03 — docs/lab-04/tests.md §6 (FR-26, AC-33). Form field values must
// survive a simulated 5xx/network failure on create/edit forms app-wide: the
// user retries without retyping anything.

afterEach(() => vi.restoreAllMocks());

describe("Public Comments composer", () => {
  it("keeps the typed comment after a server failure, and posts it once retried", async () => {
    const user = userEvent.setup();
    const draft = "The VPN dropped again after ten minutes.";
    const postEntry = vi
      .fn()
      .mockRejectedValueOnce(new api.ApiError("Could not reach the server. Please try again.", { status: 0 }))
      .mockResolvedValueOnce({
        id: 1,
        body: draft,
        author: { id: REQUESTER.id, name: REQUESTER.name, role: "Requester" },
        createdAt: "2026-09-05T12:30:00.000Z",
      });

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
    const field = screen.getByLabelText(/add a public comment/i);
    await user.type(field, draft);
    await user.click(screen.getByRole("button", { name: /^post public comment$/i }));

    await screen.findByRole("alert");
    expect(field).toHaveValue(draft);

    await user.click(screen.getByRole("button", { name: /^post public comment$/i }));
    await screen.findByText(draft);
    expect(postEntry).toHaveBeenCalledTimes(2);
  });
});

describe("Actions Taken — Add Action form", () => {
  it("keeps every field after a server failure, and saves once retried", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchActionsTaken").mockResolvedValue({ items: [], total: 0 });
    const created: api.ActionTaken = {
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
    };
    const createSpy = vi
      .spyOn(api, "createActionTaken")
      .mockRejectedValueOnce(new api.ApiError("Could not save the action. Please try again.", { status: 500 }))
      .mockResolvedValueOnce(created);

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

    await within(form).findByText(/could not save the action/i);
    // Every entered field survives the failure — nothing is cleared or reset.
    expect(within(form).getByLabelText(/^description/i)).toHaveValue("Investigated the printer jam.");
    expect(within(form).getByLabelText(/^result/i)).toHaveValue("Cleared the jam.");
    expect(within(form).getByLabelText(/^performed by/i)).toHaveValue("9");

    await user.click(within(form).getByRole("button", { name: /^save action$/i }));
    // jsdom renders both the desktop table and the mobile cards at once (no
    // real media query hides either); scope to the table to avoid an
    // ambiguous double match.
    await within(screen.getByTestId("actions-taken-table")).findByText("Investigated the printer jam.");
    expect(createSpy).toHaveBeenCalledTimes(2);
  });
});

describe("Create Ticket form", () => {
  it("keeps every entered field after a server failure, and submits once retried", async () => {
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
    const summary = "Laptop battery drains quickly";
    const description = "The battery reaches zero within about an hour of use.";
    const created: api.CreatedTicket = {
      id: 101,
      ticketNumber: "TT-20260905-0042",
      ticketDate: "2026-09-05T12:30:00.000Z",
      requester: { id: REQUESTER.id, name: REQUESTER.name },
      category: { id: 7, name: "Hardware" },
      relatedSystem: { id: 21, name: "Corporate Laptop" },
      summary,
      description,
      requestedPriority: "MEDIUM",
      currentStatus: "New",
      createdAt: "2026-09-05T12:30:00.000Z",
      updatedAt: "2026-09-05T12:30:00.000Z",
    };
    vi.spyOn(api, "createTicket")
      .mockRejectedValueOnce(new api.ApiError("Could not create the ticket. Please try again.", { status: 500 }))
      .mockResolvedValueOnce(created);

    renderAsRequester(<Lab2App />);
    const nav = await screen.findByRole("navigation", { name: /main/i });
    await user.click(within(nav).getByRole("button", { name: /^create ticket$/i }));

    const form = await screen.findByRole("form", { name: /create ticket/i });
    await user.selectOptions(within(form).getByLabelText(/^category/i), "7");
    await user.selectOptions(within(form).getByLabelText(/related system/i), "21");
    await user.type(within(form).getByLabelText(/ticket summary/i), summary);
    await user.type(within(form).getByLabelText(/^description/i), description);
    await user.selectOptions(within(form).getByLabelText(/requested priority/i), "MEDIUM");

    await user.click(within(form).getByRole("button", { name: /^create ticket$/i }));

    await within(form).findByRole("alert");
    expect(within(form).getByLabelText(/ticket summary/i)).toHaveValue(summary);
    expect(within(form).getByLabelText(/^description/i)).toHaveValue(description);
    expect(within(form).getByLabelText(/^category/i)).toHaveValue("7");
    expect(within(form).getByLabelText(/related system/i)).toHaveValue("21");
    expect(within(form).getByLabelText(/requested priority/i)).toHaveValue("MEDIUM");

    await user.click(within(form).getByRole("button", { name: /^create ticket$/i }));
    await screen.findByTestId("created-ticket-number");
  });
});
