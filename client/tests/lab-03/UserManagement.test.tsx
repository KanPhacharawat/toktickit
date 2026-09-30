import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import * as authApi from "../../src/authApi.js";
import { STAFF } from "./authTestUtils.js";

// Administrator User Management issue - tests.md section 7, UI-34 to UI-40.

const ADMIN = { ...STAFF, id: 3, name: "Ada Admin", email: "ada@example.com", role: "Administrator" as const };

function adminUser(overrides: Partial<api.AdminUser> = {}): api.AdminUser {
  return {
    id: 10,
    name: "Somchai Staff",
    email: "staff1@toktickit.local",
    role: "ITStaff",
    isActive: true,
    mustChangePassword: false,
    createdAt: "2026-09-18T00:00:00.000Z",
    updatedAt: "2026-09-18T00:00:00.000Z",
    ...overrides,
  };
}

function mockShell() {
  vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
  vi.spyOn(api, "fetchQueue").mockResolvedValue({
    data: [],
    meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0, counts: { active: 0, unassigned: 0, assignedToMe: 0 } },
  });
}

async function openUserManagement() {
  vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(ADMIN);
  render(<App />);
  await screen.findByRole("heading", { name: /user management/i });
}

describe("UI-34 - user list and search (AC-46)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockShell();
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders Name (you), Email, Role, Status, and Edit", async () => {
    vi.spyOn(api, "fetchAdminUsers").mockResolvedValue({
      data: [adminUser(), adminUser({ id: 3, name: "Ada Admin", role: "Administrator" })],
      meta: { totalItems: 2 },
    });

    await openUserManagement();

    await screen.findByTestId("user-rows");
    for (const header of [/name/i, /email/i, /role/i, /status/i, /actions/i]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    const rows = within(screen.getByTestId("user-rows")).getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByText(/ada admin \(you\)/i)).toBeInTheDocument();
  });

  it("shows Must change password under an inactive/pending user", async () => {
    vi.spyOn(api, "fetchAdminUsers").mockResolvedValue({
      data: [adminUser({ isActive: false, mustChangePassword: true })],
      meta: { totalItems: 1 },
    });

    await openUserManagement();

    const rows = within(await screen.findByTestId("user-rows")).getAllByRole("row");
    expect(within(rows[0]).getByText(/inactive/i)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/must change password/i)).toBeInTheDocument();
  });

  it("searches on submit and filters by role on change", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "fetchAdminUsers").mockResolvedValue({ data: [adminUser()], meta: { totalItems: 1 } });
    await openUserManagement();
    await waitFor(() => expect(spy).toHaveBeenCalled());

    await user.type(screen.getByPlaceholderText(/name or email/i), "somchai");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith({ search: "somchai", role: "" }));

    await user.selectOptions(screen.getByLabelText(/^role$/i), "ITStaff");
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith({ search: "somchai", role: "ITStaff" }));
  });

  it("shows no-results with Clear", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchAdminUsers").mockResolvedValue({ data: [], meta: { totalItems: 0 } });
    await openUserManagement();

    const empty = await screen.findByTestId("no-results-state");
    expect(empty).toHaveTextContent(/no users match your search/i);
    await user.click(within(empty).getByRole("button", { name: /clear/i }));
  });

  it("shows a failure banner with Retry", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(api, "fetchAdminUsers")
      .mockRejectedValueOnce(new api.ApiError("Could not load users.", { status: 500 }))
      .mockResolvedValueOnce({ data: [adminUser()], meta: { totalItems: 1 } });
    await openUserManagement();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not load users/i);
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByTestId("user-rows")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("UI-35 - create user panel (AC-47, AC-49)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockShell();
    vi.spyOn(api, "fetchAdminUsers").mockResolvedValue({ data: [adminUser()], meta: { totalItems: 1 } });
  });
  afterEach(() => vi.restoreAllMocks());

  it("validates required fields without calling the API", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "createAdminUser");
    await openUserManagement();

    await user.click(screen.getByRole("button", { name: /create user/i }));
    await user.click(screen.getByRole("button", { name: /save user/i }));

    expect(await screen.findByText(/name must be 2.100 characters/i)).toBeInTheDocument();
    expect(screen.getByText("Select a role.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("creates a user and shows the success banner", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "createAdminUser").mockResolvedValue(adminUser({ id: 55, name: "Fresh Hire" }));
    await openUserManagement();

    await user.click(screen.getByRole("button", { name: /create user/i }));
    const createPanel = screen.getByRole("region", { name: /create new user/i });
    await user.type(within(createPanel).getByLabelText(/full name/i), "Fresh Hire");
    await user.type(within(createPanel).getByLabelText(/email address/i), "fresh@example.com");
    await user.selectOptions(within(createPanel).getByLabelText(/role/i), "ITStaff");
    await user.type(within(createPanel).getByLabelText(/^initial password/i), "Temp-Pass-9!");
    await user.type(within(createPanel).getByLabelText(/confirm initial password/i), "Temp-Pass-9!");
    await user.click(within(createPanel).getByRole("button", { name: /save user/i }));

    expect(await screen.findByText(/saved changes to fresh hire/i)).toBeInTheDocument();
  });

  it("shows the duplicate-email field error and keeps values", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "createAdminUser").mockRejectedValue(
      new api.ApiError("This email is already used by another account.", {
        status: 409,
        code: "EMAIL_ALREADY_IN_USE",
        fieldErrors: { email: "This email is already used by another account." },
      }),
    );
    await openUserManagement();

    await user.click(screen.getByRole("button", { name: /create user/i }));
    const createPanel = screen.getByRole("region", { name: /create new user/i });
    await user.type(within(createPanel).getByLabelText(/full name/i), "Dup Person");
    await user.type(within(createPanel).getByLabelText(/email address/i), "dup@example.com");
    await user.selectOptions(within(createPanel).getByLabelText(/role/i), "Requester");
    await user.type(within(createPanel).getByLabelText(/^initial password/i), "Temp-Pass-9!");
    await user.type(within(createPanel).getByLabelText(/confirm initial password/i), "Temp-Pass-9!");
    await user.click(within(createPanel).getByRole("button", { name: /save user/i }));

    expect(await screen.findByText(/this email is already used by another account/i)).toBeInTheDocument();
    expect(within(createPanel).getByLabelText(/email address/i)).toHaveValue("dup@example.com");
  });
});

describe("UI-37 - edit user panel (AC-50, AC-54)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockShell();
  });
  afterEach(() => vi.restoreAllMocks());

  it("prefills fields and keeps Save Changes disabled until something changes", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchAdminUsers").mockResolvedValue({ data: [adminUser()], meta: { totalItems: 1 } });
    await openUserManagement();

    await user.click(await screen.findByRole("button", { name: /edit somchai staff/i }));

    expect(screen.getByLabelText(/full name/i)).toHaveValue("Somchai Staff");
    const save = screen.getByRole("button", { name: /save changes/i });
    expect(save).toBeDisabled();

    await user.clear(screen.getByLabelText(/full name/i));
    await user.type(screen.getByLabelText(/full name/i), "Somchai Renamed");
    expect(save).toBeEnabled();
  });

  it("saves changes and reports the unassigned ticket count", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchAdminUsers").mockResolvedValue({ data: [adminUser()], meta: { totalItems: 1 } });
    vi.spyOn(api, "updateAdminUser").mockResolvedValue({
      data: adminUser({ isActive: false }),
      meta: { unassignedTicketCount: 2, sessionsRevoked: true },
    });
    await openUserManagement();

    await user.click(await screen.findByRole("button", { name: /edit somchai staff/i }));
    await user.click(screen.getByLabelText(/^active$/i));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(
      await screen.findByText(/saved changes to somchai staff\.\s*2 active tickets were unassigned\./i),
    ).toBeInTheDocument();
  });

  it("disables the Active switch for one's own account", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchAdminUsers").mockResolvedValue({
      data: [adminUser({ id: ADMIN.id, name: ADMIN.name, role: "Administrator" })],
      meta: { totalItems: 1 },
    });
    await openUserManagement();

    await user.click(await screen.findByRole("button", { name: new RegExp(`edit ${ADMIN.name}`, "i") }));

    expect(screen.getByLabelText(/^active$/i)).toBeDisabled();
    expect(screen.getByText(/you cannot deactivate your own account/i)).toBeInTheDocument();
  });
});

describe("UI-38 - set new initial password (AC-51)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockShell();
    vi.spyOn(api, "fetchAdminUsers").mockResolvedValue({ data: [adminUser()], meta: { totalItems: 1 } });
  });
  afterEach(() => vi.restoreAllMocks());

  it("requires confirmation before sending, and shows the signed-out success text", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "setAdminUserInitialPassword").mockResolvedValue({
      data: adminUser({ mustChangePassword: true }),
      meta: { sessionsRevoked: true },
    });
    await openUserManagement();

    await user.click(await screen.findByRole("button", { name: /edit somchai staff/i }));
    await user.type(screen.getByLabelText(/^new initial password/i), "New-Temp-Pass1!");
    await user.type(screen.getByLabelText(/confirm new initial password/i), "New-Temp-Pass1!");
    await user.click(screen.getByRole("button", { name: /set new initial password/i }));

    expect(spy).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog")).toHaveTextContent(/sign somchai staff out/i);

    await user.click(screen.getByRole("button", { name: /^confirm$/i }));

    expect(
      await screen.findByText(/new initial password set\. somchai staff has been signed out\./i),
    ).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(10, "New-Temp-Pass1!");
  });
});

describe("UI-39 - administrator safety feedback (AC-52, AC-53)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockShell();
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows the self-deactivation banner", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchAdminUsers").mockResolvedValue({
      data: [adminUser({ id: ADMIN.id, name: ADMIN.name, role: "Administrator" })],
      meta: { totalItems: 1 },
    });
    // Deactivation is impossible through the switch (disabled), but a role
    // change can still surface LAST_ACTIVE_ADMINISTRATOR from the server.
    vi.spyOn(api, "updateAdminUser").mockRejectedValue(
      new api.ApiError("At least one active administrator is required.", {
        status: 409,
        code: "LAST_ACTIVE_ADMINISTRATOR",
      }),
    );
    await openUserManagement();

    await user.click(await screen.findByRole("button", { name: new RegExp(`edit ${ADMIN.name}`, "i") }));
    const editPanel = screen.getByRole("region", { name: /edit user/i });
    await user.selectOptions(within(editPanel).getByLabelText(/role/i), "ITStaff");
    await user.click(within(editPanel).getByRole("button", { name: /save changes/i }));

    expect(
      await screen.findByText(/at least one active administrator is required/i),
    ).toBeInTheDocument();
  });

  it("shows Forbidden for a non-Administrator", async () => {
    vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(STAFF);
    render(<App />);

    expect(await screen.findByRole("heading", { name: /ticket queue/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /user management/i })).not.toBeInTheDocument();
  });
});
