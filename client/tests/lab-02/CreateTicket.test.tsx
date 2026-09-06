import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Lab2App from "../../src/Lab2App.js";
import * as api from "../../src/api.js";
import {
  MAX_FILE_SIZE_BYTES,
  MAX_ACTIVE_ATTACHMENTS,
  selectAttachments,
} from "../../src/attachmentRules.js";

const REQUESTERS: api.DevelopmentRequester[] = [
  { id: 11, name: "Alpha Requester", email: "alpha@example.com", department: "Finance" },
];

// Deliberately not the seeded reference data: hard-coded options would fail.
const CATEGORIES: api.ReferenceItem[] = [
  { id: 7, name: "Test Category One" },
  { id: 8, name: "Test Category Two" },
];

const RELATED_SYSTEMS: api.ReferenceItem[] = [
  { id: 21, name: "Test System One" },
  { id: 22, name: "Test System Two" },
];

const CREATED: api.CreatedTicket = {
  id: 101,
  ticketNumber: "TT-20260905-0042",
  ticketDate: "2026-09-05T12:30:00.000Z",
  requester: { id: 11, name: "Alpha Requester" },
  category: { id: 7, name: "Test Category One" },
  relatedSystem: { id: 21, name: "Test System One" },
  summary: "Laptop battery drains quickly",
  description: "The battery reaches zero within about an hour of use.",
  requestedPriority: "MEDIUM",
  currentStatus: "New",
  createdAt: "2026-09-05T12:30:00.000Z",
  updatedAt: "2026-09-05T12:30:00.000Z",
};

const VALID_SUMMARY = "Laptop battery drains quickly";
const VALID_DESCRIPTION = "The battery reaches zero within about an hour of use.";

function mockReferenceData() {
  vi.spyOn(api, "fetchActiveRequesters").mockResolvedValue(REQUESTERS);
  vi.spyOn(api, "fetchCategories").mockResolvedValue(CATEGORIES);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(RELATED_SYSTEMS);
}

/** The Create Ticket form, so queries are not confused by the shell nav. */
function form() {
  return screen.getByRole("form", { name: /create ticket/i });
}

/** Selects the requester, then navigates to the Create Ticket screen. */
async function openCreateTicket(user: ReturnType<typeof userEvent.setup>) {
  render(<Lab2App />);

  await user.selectOptions(
    await screen.findByLabelText(/development requester/i),
    screen.getByRole("option", { name: /Alpha Requester/ }),
  );
  await user.click(screen.getByRole("button", { name: /continue/i }));

  // "Create Ticket" appears in the nav and on the home screen; use the nav.
  const nav = screen.getByRole("navigation", { name: /main/i });
  await user.click(within(nav).getByRole("button", { name: /create ticket/i }));

  await screen.findByRole("form", { name: /create ticket/i });
}

/** Fills every required field with valid values. */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(
    await screen.findByLabelText(/^category/i),
    "7",
  );
  await user.selectOptions(screen.getByLabelText(/related system/i), "21");
  await user.type(screen.getByLabelText(/ticket summary/i), VALID_SUMMARY);
  await user.selectOptions(
    screen.getByLabelText(/requested priority/i),
    "MEDIUM",
  );
  await user.type(screen.getByLabelText(/^description/i), VALID_DESCRIPTION);
}

/** The submit button, scoped to the form so the nav item is not matched. */
function submitButton() {
  // Matches both the idle "Create Ticket" and the busy "Creating ticket…".
  return within(form()).getByRole("button", { name: /creat(e|ing) ticket/i });
}

function submit(user: ReturnType<typeof userEvent.setup>) {
  return user.click(submitButton());
}

function makeFile(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("UI-04 / UI-05 / UI-06 / UI-07 — Create Ticket (AC-05, AC-07, AC-09, AC-10)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockReferenceData();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Fields and reference data
  // -------------------------------------------------------------------------
  it("displays every required ticket field", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);

    expect(screen.getByLabelText(/ticket number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ticket date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^requester/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/related system/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ticket summary/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/requested priority/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/select attachments/i)).toBeInTheDocument();
  });

  it("loads categories and related systems from the backend", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);

    expect(
      await screen.findByRole("option", { name: "Test Category One" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Test System Two" }),
    ).toBeInTheDocument();
    expect(api.fetchCategories).toHaveBeenCalled();
    expect(api.fetchRelatedSystems).toHaveBeenCalled();
  });

  it("shows the selected requester read-only and does not let it be edited", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);

    const requesterField = screen.getByLabelText(/^requester/i);
    expect(requesterField).toHaveValue("Alpha Requester");
    expect(requesterField).toHaveAttribute("readonly");
  });

  it("shows system-generated fields as read-only before creation", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);

    expect(screen.getByLabelText(/ticket number/i)).toHaveAttribute("readonly");
    expect(screen.getByLabelText(/ticket date/i)).toHaveAttribute("readonly");
  });

  it("marks required fields with a required indicator", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);

    for (const label of [
      /^category/i,
      /related system/i,
      /ticket summary/i,
      /requested priority/i,
      /^description/i,
    ]) {
      const field = screen.getByLabelText(label);
      const labelElement = document.querySelector(`label[for="${field.id}"]`);
      // Asterisk plus text, so "required" is not colour-only (AC-25).
      expect(labelElement?.textContent).toContain("*");
      expect(labelElement?.textContent).toMatch(/required/i);
    }
  });

  it("shows a safe error with retry when reference data fails to load", async () => {
    vi.spyOn(api, "fetchCategories").mockRejectedValue(
      new Error("Could not load categories."),
    );
    const user = userEvent.setup();
    await openCreateTicket(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not load categories and related systems/i,
    );
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Validation (AC-07)
  // -------------------------------------------------------------------------
  it("shows field-level messages and does not call the API when empty", async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(api, "createTicket");
    await openCreateTicket(user);

    await submit(user);

    expect(await screen.findByText(/category is required/i)).toBeInTheDocument();
    expect(screen.getByText(/related system is required/i)).toBeInTheDocument();
    expect(screen.getByText(/summary is required/i)).toBeInTheDocument();
    expect(
      screen.getByText(/requested priority is required/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/description is required/i)).toBeInTheDocument();

    // AC-07 — the API is never reached.
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("associates each validation message with its field", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);
    await submit(user);

    const summary = await screen.findByLabelText(/ticket summary/i);
    expect(summary).toHaveAttribute("aria-invalid", "true");

    const describedBy = summary.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toMatch(
      /summary is required/i,
    );
  });

  it("rejects a too-short summary and description", async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(api, "createTicket");
    await openCreateTicket(user);

    await user.selectOptions(await screen.findByLabelText(/^category/i), "7");
    await user.selectOptions(screen.getByLabelText(/related system/i), "21");
    await user.type(screen.getByLabelText(/ticket summary/i), "abc");
    await user.selectOptions(screen.getByLabelText(/requested priority/i), "LOW");
    await user.type(screen.getByLabelText(/^description/i), "short");

    await submit(user);

    expect(
      await screen.findByText(/summary must be at least 5 characters/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/description must be at least 10 characters/i),
    ).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("clears a field error once the user corrects the field", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);
    await submit(user);

    expect(await screen.findByText(/summary is required/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/ticket summary/i), "A");
    expect(screen.queryByText(/summary is required/i)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Submission (AC-05, AC-09)
  // -------------------------------------------------------------------------
  it("sends trimmed values and the selected requester id", async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(api, "createTicket").mockResolvedValue(CREATED);
    await openCreateTicket(user);

    await user.selectOptions(await screen.findByLabelText(/^category/i), "7");
    await user.selectOptions(screen.getByLabelText(/related system/i), "21");
    await user.type(screen.getByLabelText(/ticket summary/i), `  ${VALID_SUMMARY}  `);
    await user.selectOptions(screen.getByLabelText(/requested priority/i), "HIGH");
    await user.type(screen.getByLabelText(/^description/i), `  ${VALID_DESCRIPTION}  `);
    await submit(user);

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy).toHaveBeenCalledWith({
      requesterId: 11,
      categoryId: 7,
      relatedSystemId: 21,
      summary: VALID_SUMMARY,
      description: VALID_DESCRIPTION,
      requestedPriority: "HIGH",
    });
  });

  it("displays the ticket number returned by the backend (AC-05)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "createTicket").mockResolvedValue(CREATED);
    await openCreateTicket(user);
    await fillValidForm(user);
    await submit(user);

    expect(await screen.findByTestId("created-ticket-number")).toHaveTextContent(
      "TT-20260905-0042",
    );
    // The number comes from the response, never invented by the UI.
    expect(screen.getByTestId("created-status")).toHaveTextContent("New");
  });

  it("disables Submit and shows a busy state while submitting (AC-09)", async () => {
    const user = userEvent.setup();
    let resolvePending: (value: api.CreatedTicket) => void = () => {};
    const createSpy = vi
      .spyOn(api, "createTicket")
      .mockReturnValue(
        new Promise<api.CreatedTicket>((resolve) => {
          resolvePending = resolve;
        }),
      );

    await openCreateTicket(user);
    await fillValidForm(user);
    await submit(user);

    const button = submitButton();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    // A second click while busy must not produce a second request.
    await user.click(button).catch(() => {});
    expect(createSpy).toHaveBeenCalledTimes(1);

    resolvePending(CREATED);
    expect(await screen.findByTestId("created-ticket-number")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Failure handling (AC-10, AC-23)
  // -------------------------------------------------------------------------
  it("shows a safe message and preserves entered values on API failure", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "createTicket").mockRejectedValue(
      new api.ApiError("Could not create the ticket. Please try again.", {
        status: 500,
        code: "INTERNAL_ERROR",
      }),
    );

    await openCreateTicket(user);
    await fillValidForm(user);
    await submit(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not create the ticket/i);
    // BR-39 — nothing internal leaks through.
    expect(alert.textContent).not.toMatch(/prisma|postgres|stack|sql/i);

    // BR-20 — every entered value survives the failure.
    expect(screen.getByLabelText(/ticket summary/i)).toHaveValue(VALID_SUMMARY);
    expect(screen.getByLabelText(/^description/i)).toHaveValue(VALID_DESCRIPTION);
    expect(screen.getByLabelText(/^category/i)).toHaveValue("7");
    expect(screen.getByLabelText(/related system/i)).toHaveValue("21");
    expect(screen.getByLabelText(/requested priority/i)).toHaveValue("MEDIUM");
  });

  it("re-enables Submit after a failure so the user can retry", async () => {
    const user = userEvent.setup();
    const createSpy = vi
      .spyOn(api, "createTicket")
      .mockRejectedValueOnce(
        new api.ApiError("Could not reach the server.", { status: 0 }),
      )
      .mockResolvedValueOnce(CREATED);

    await openCreateTicket(user);
    await fillValidForm(user);
    await submit(user);

    await screen.findByRole("alert");
    const button = submitButton();
    expect(button).toBeEnabled();

    await user.click(button);
    expect(await screen.findByTestId("created-ticket-number")).toBeInTheDocument();
    expect(createSpy).toHaveBeenCalledTimes(2);
  });

  it("shows backend field errors beside the matching fields", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "createTicket").mockRejectedValue(
      new api.ApiError("The request contains invalid data.", {
        status: 400,
        code: "VALIDATION_ERROR",
        fieldErrors: { summary: "Summary is not acceptable." },
      }),
    );

    await openCreateTicket(user);
    await fillValidForm(user);
    await submit(user);

    expect(
      await screen.findByText(/summary is not acceptable/i),
    ).toBeInTheDocument();
    // Values are still preserved for correction.
    expect(screen.getByLabelText(/ticket summary/i)).toHaveValue(VALID_SUMMARY);
  });

  // -------------------------------------------------------------------------
  // Attachments (AC-18)
  // -------------------------------------------------------------------------
  it("accepts a permitted attachment and lists its metadata", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);

    await user.upload(
      screen.getByLabelText(/select attachments/i),
      makeFile("screenshot.png", "image/png", 2048),
    );

    const list = await screen.findByTestId("selected-attachments");
    expect(within(list).getByTestId("attachment-name")).toHaveTextContent(
      "screenshot.png",
    );
    expect(within(list).getByText("2.0 KB")).toBeInTheDocument();
  });

  it("rejects an unsupported file type", async () => {
    // `accept` would filter this out before the handler ran, so disable that
    // and put the component's own rule under test.
    const user = userEvent.setup({ applyAccept: false });
    await openCreateTicket(user);

    await user.upload(
      screen.getByLabelText(/select attachments/i),
      makeFile("virus.exe", "application/x-msdownload", 1024),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /only jpg, jpeg, png, webp, and pdf/i,
    );
    expect(screen.queryByTestId("selected-attachments")).not.toBeInTheDocument();
  });

  it("restricts the file picker to the permitted types", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);

    // Belt and braces: the browser should not offer disallowed files at all.
    expect(screen.getByLabelText(/select attachments/i)).toHaveAttribute(
      "accept",
      ".jpg,.jpeg,.png,.webp,.pdf",
    );
  });

  it("rejects a file larger than 5 MB", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);

    await user.upload(
      screen.getByLabelText(/select attachments/i),
      makeFile("huge.pdf", "application/pdf", MAX_FILE_SIZE_BYTES + 1),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /5\.0 MB or smaller/i,
    );
    expect(screen.queryByTestId("selected-attachments")).not.toBeInTheDocument();
  });

  it("lets the user remove a selected attachment", async () => {
    const user = userEvent.setup();
    await openCreateTicket(user);

    await user.upload(
      screen.getByLabelText(/select attachments/i),
      makeFile("notes.pdf", "application/pdf", 4096),
    );
    expect(await screen.findByTestId("attachment-name")).toHaveTextContent(
      "notes.pdf",
    );

    await user.click(screen.getByRole("button", { name: /remove notes\.pdf/i }));
    expect(screen.queryByTestId("attachment-name")).not.toBeInTheDocument();
  });

  it("uploads selected attachments after the ticket is created", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "createTicket").mockResolvedValue(CREATED);
    const uploadSpy = vi.spyOn(api, "uploadAttachment").mockResolvedValue({
      id: 501,
      originalFilename: "screenshot.png",
      mimeType: "image/png",
      fileSize: 2048,
      uploadedAt: "2026-09-05T12:40:00.000Z",
      removedAt: null,
      removalReason: null,
    });

    await openCreateTicket(user);
    await user.upload(
      screen.getByLabelText(/select attachments/i),
      makeFile("screenshot.png", "image/png", 2048),
    );
    await fillValidForm(user);
    await submit(user);

    await screen.findByTestId("created-ticket-number");
    // Assumption 10 — uploaded against the ticket the backend just created.
    await waitFor(() => expect(uploadSpy).toHaveBeenCalledTimes(1));
    expect(uploadSpy.mock.calls[0][0]).toBe(11);
    expect(uploadSpy.mock.calls[0][1]).toBe(CREATED.id);
    expect(await screen.findByTestId("attachments-uploaded")).toHaveTextContent(
      "1 file attached",
    );
  });

  it("keeps the ticket and reports the failure when an upload fails (BR-34)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "createTicket").mockResolvedValue(CREATED);
    vi.spyOn(api, "uploadAttachment").mockRejectedValue(
      new api.ApiError("Could not upload the attachment.", { status: 500 }),
    );

    await openCreateTicket(user);
    await user.upload(
      screen.getByLabelText(/select attachments/i),
      makeFile("screenshot.png", "image/png", 2048),
    );
    await fillValidForm(user);
    await submit(user);

    // BR-34 — the ticket number is still shown; the ticket is not rolled back.
    expect(await screen.findByTestId("created-ticket-number")).toHaveTextContent(
      "TT-20260905-0042",
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not be attached/i);
    expect(alert).toHaveTextContent("screenshot.png");
    expect(alert.textContent).not.toMatch(/prisma|postgres|sql|stack|\.ts:/i);
  });

  it("does not block ticket creation when no attachment is selected", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "createTicket").mockResolvedValue(CREATED);
    await openCreateTicket(user);
    await fillValidForm(user);
    await submit(user);

    expect(await screen.findByTestId("created-ticket-number")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Attachment rules — unit coverage of the boundaries (BR-29, BR-30, BR-31)
// ---------------------------------------------------------------------------
describe("UNIT-04 — attachment selection rules (BR-29–31)", () => {
  it("accepts each permitted type", () => {
    const files = [
      makeFile("a.jpg", "image/jpeg", 10),
      makeFile("b.png", "image/png", 10),
      makeFile("c.webp", "image/webp", 10),
      makeFile("d.pdf", "application/pdf", 10),
    ];
    expect(selectAttachments(files).accepted).toHaveLength(4);
  });

  it("accepts a file exactly at the size limit but not one byte over", () => {
    expect(
      selectAttachments([makeFile("ok.pdf", "application/pdf", MAX_FILE_SIZE_BYTES)])
        .accepted,
    ).toHaveLength(1);
    expect(
      selectAttachments([
        makeFile("big.pdf", "application/pdf", MAX_FILE_SIZE_BYTES + 1),
      ]).rejected,
    ).toHaveLength(1);
  });

  it("stops at five attachments and explains the sixth rejection", () => {
    const files = Array.from({ length: 6 }, (_, i) =>
      makeFile(`file-${i}.png`, "image/png", 10),
    );
    const { accepted, rejected } = selectAttachments(files);

    expect(accepted).toHaveLength(MAX_ACTIVE_ATTACHMENTS);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/at most 5 attachments/i);
  });

  it("counts files already selected against the limit", () => {
    const existing = selectAttachments(
      Array.from({ length: 5 }, (_, i) => makeFile(`x-${i}.png`, "image/png", 10)),
    ).accepted;

    const { accepted, rejected } = selectAttachments(
      [makeFile("late.png", "image/png", 10)],
      existing,
    );
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/at most 5 attachments/i);
  });

  it("rejects a duplicate filename", () => {
    const existing = selectAttachments([makeFile("same.png", "image/png", 10)])
      .accepted;
    const { rejected } = selectAttachments(
      [makeFile("same.png", "image/png", 10)],
      existing,
    );
    expect(rejected[0].reason).toMatch(/already been selected/i);
  });

  it("rejects an empty file", () => {
    const { rejected } = selectAttachments([
      makeFile("empty.pdf", "application/pdf", 0),
    ]);
    expect(rejected[0].reason).toMatch(/empty/i);
  });

  it("falls back to the extension when the browser reports no MIME type", () => {
    expect(
      selectAttachments([makeFile("photo.JPG", "", 10)]).accepted,
    ).toHaveLength(1);
    expect(
      selectAttachments([makeFile("script.sh", "", 10)]).rejected,
    ).toHaveLength(1);
  });
});
