import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Lab2App from "../../src/Lab2App.js";
import * as api from "../../src/api.js";

const REQUESTERS: api.DevelopmentRequester[] = [
  { id: 11, name: "Alpha Requester", email: "alpha@example.com", department: "Finance" },
  { id: 22, name: "Beta Requester", email: "beta@example.com", department: "Library" },
];

const CATEGORIES: api.ReferenceItem[] = [
  { id: 7, name: "Test Category One" },
  { id: 8, name: "Test Category Two" },
];

function row(overrides: Partial<api.TicketListRow> = {}): api.TicketListRow {
  return {
    id: 1,
    ticketNumber: "TT-20260905-0001",
    summary: "Printer jams constantly",
    category: "Test Category One",
    requestedPriority: "LOW",
    currentStatus: "New",
    updatedAt: "2026-09-05T12:30:00.000Z",
    ...overrides,
  };
}

const ROWS: api.TicketListRow[] = [
  row(),
  row({
    id: 2,
    ticketNumber: "TT-20260905-0002",
    summary: "VPN disconnects randomly",
    category: "Test Category Two",
    requestedPriority: "URGENT",
    currentStatus: "InProgress",
    updatedAt: "2026-09-06T09:00:00.000Z",
  }),
];

function listResponse(
  data: api.TicketListRow[] = ROWS,
  meta: Partial<api.TicketListMeta> = {},
): api.TicketListResponse {
  return {
    data,
    meta: {
      page: 1,
      pageSize: 10,
      totalItems: data.length,
      totalPages: data.length === 0 ? 0 : 1,
      ...meta,
    },
  };
}

/** Mocks the requester selector and the Category filter's reference data. */
function mockShell() {
  vi.spyOn(api, "fetchActiveRequesters").mockResolvedValue(REQUESTERS);
  vi.spyOn(api, "fetchCategories").mockResolvedValue(CATEGORIES);
}

/** Selects a requester and lands on My Tickets (the default view). */
async function openMyTickets(
  user: ReturnType<typeof userEvent.setup>,
  requester: RegExp = /Alpha Requester/,
) {
  render(<Lab2App />);

  await user.selectOptions(
    await screen.findByLabelText(/development requester/i),
    screen.getByRole("option", { name: requester }),
  );
  await user.click(screen.getByRole("button", { name: /continue/i }));

  await screen.findByRole("heading", { name: /my tickets/i });
}

/** The filter panel is collapsed by default; open it before using it. */
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  const toggle = screen.getByRole("button", { name: /^filters/i });
  if (toggle.getAttribute("aria-expanded") !== "true") await user.click(toggle);
}

/** The arguments of the most recent fetchMyTickets call. */
function lastCall() {
  const spy = vi.mocked(api.fetchMyTickets);
  return spy.mock.calls[spy.mock.calls.length - 1];
}

function ticketRows() {
  return within(screen.getByTestId("ticket-rows")).getAllByRole("row");
}

describe("UI-08 / UI-09 — My Tickets states and controls (AC-11, AC-13–17)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockShell();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Ownership (AC-11)
  // -------------------------------------------------------------------------
  it("requests only the selected requester's tickets", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse());

    await openMyTickets(user);

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(lastCall()[0]).toBe(11);
  });

  it("renders the documented columns for each ticket", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse());

    await openMyTickets(user);

    for (const header of [
      /ticket number/i,
      /summary/i,
      /category/i,
      /requested priority/i,
      /current status/i,
      /last updated/i,
    ]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }

    const rows = await waitFor(() => ticketRows());
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("TT-20260905-0001")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Printer jams constantly")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Test Category One")).toBeInTheDocument();
    expect(within(rows[1]).getByText(/in progress/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // UI-08 — states
  // -------------------------------------------------------------------------
  it("shows a loading state while tickets are loading", async () => {
    const user = userEvent.setup();
    let resolvePending: (value: api.TicketListResponse) => void = () => {};
    vi.spyOn(api, "fetchMyTickets").mockReturnValue(
      new Promise((resolve) => {
        resolvePending = resolve;
      }),
    );

    await openMyTickets(user);

    expect(screen.getByRole("status")).toHaveTextContent(/loading tickets/i);

    resolvePending(listResponse());
    expect(await screen.findByTestId("ticket-rows")).toBeInTheDocument();
  });

  it("shows the empty state with a Create Ticket action when there are no tickets", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse([]));

    await openMyTickets(user);

    const empty = await screen.findByTestId("empty-state");
    expect(empty).toHaveTextContent(/no tickets yet/i);
    expect(
      within(empty).getByRole("button", { name: /create ticket/i }),
    ).toBeInTheDocument();
    // The empty state is not the no-results state.
    expect(screen.queryByTestId("no-results-state")).not.toBeInTheDocument();
  });

  it("shows the no-results state when a search matches nothing (BR-27)", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(api, "fetchMyTickets")
      .mockResolvedValueOnce(listResponse())
      .mockResolvedValue(listResponse([]));

    await openMyTickets(user);
    await waitFor(() => expect(ticketRows()).toHaveLength(2));

    await user.type(screen.getByLabelText(/^search$/i), "nothing-matches");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    const noResults = await screen.findByTestId("no-results-state");
    expect(noResults).toHaveTextContent(/no tickets match/i);
    expect(
      within(noResults).getByRole("button", { name: /clear filters/i }),
    ).toBeInTheDocument();
    // No unrelated tickets are shown (BR-27).
    expect(screen.queryByTestId("ticket-rows")).not.toBeInTheDocument();
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("shows a safe error state with Retry when the API fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchMyTickets").mockRejectedValue(
      new api.ApiError("Could not load tickets. Please try again.", {
        status: 500,
        code: "INTERNAL_ERROR",
      }),
    );

    await openMyTickets(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not load your tickets/i);
    // BR-39 — nothing internal leaks through.
    expect(alert.textContent).not.toMatch(/prisma|postgres|sql|stack|\.ts:/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("reloads the list when Retry is pressed", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(api, "fetchMyTickets")
      .mockRejectedValueOnce(new api.ApiError("Could not reach the server.", { status: 0 }))
      .mockResolvedValue(listResponse());

    await openMyTickets(user);

    await user.click(await screen.findByRole("button", { name: /retry/i }));

    expect(await screen.findByTestId("ticket-rows")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Collapsible filter panel
  // -------------------------------------------------------------------------
  it("keeps the filter panel collapsed until it is opened", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse());

    await openMyTickets(user);

    const toggle = screen.getByRole("button", { name: /^filters/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    // The panel is hidden, so its controls are not reachable...
    expect(screen.getByLabelText(/^category$/i)).not.toBeVisible();
    expect(screen.getByLabelText(/per page/i)).not.toBeVisible();
    // ...but search stays available without opening anything.
    expect(screen.getByLabelText(/^search$/i)).toBeVisible();
  });

  it("expands and collapses the filter panel from the toggle", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse());

    await openMyTickets(user);
    const toggle = screen.getByRole("button", { name: /^filters/i });

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText(/^category$/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /hide filters/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /hide filters/i }));
    expect(screen.getByRole("button", { name: /^filters/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByLabelText(/^category$/i)).not.toBeVisible();
  });

  it("points the toggle at the panel it controls", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse());

    await openMyTickets(user);

    const controls = screen
      .getByRole("button", { name: /^filters/i })
      .getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls!)).toBeTruthy();
  });

  it("shows how many filters are applied while the panel is collapsed", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse());

    await openMyTickets(user);
    // No count before anything is filtered.
    expect(
      screen.getByRole("button", { name: /^filters/i }).textContent,
    ).not.toMatch(/\d/);

    await openFilters(user);
    await user.selectOptions(screen.getByLabelText(/requested priority/i), "HIGH");
    await user.selectOptions(screen.getByLabelText(/current status/i), "New");
    await user.click(screen.getByRole("button", { name: /hide filters/i }));

    // Collapsing must not hide the fact that the list is narrowed.
    const toggle = screen.getByRole("button", { name: /^filters/i });
    expect(toggle).toHaveTextContent("2");
    // The count is stated in text, not by colour alone (AC-25).
    expect(toggle).toHaveAccessibleName(/2 active/i);
  });

  it("keeps the search box usable while the panel is collapsed", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse());

    await openMyTickets(user);
    await waitFor(() => expect(spy).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/^search$/i), "printer");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => expect(lastCall()[1]).toMatchObject({ search: "printer" }));
    expect(
      screen.getByRole("button", { name: /^filters/i }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  // -------------------------------------------------------------------------
  // UI-09 — search, filter, sort, pagination
  // -------------------------------------------------------------------------
  it("sends the search term when the search form is submitted (AC-13)", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse());

    await openMyTickets(user);
    await waitFor(() => expect(spy).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/^search$/i), "  printer  ");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => expect(lastCall()[1]).toMatchObject({ search: "printer" }));
  });

  it("does not call the API on every keystroke", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse());

    await openMyTickets(user);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    await user.type(screen.getByLabelText(/^search$/i), "printer");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("filters by category, priority, and status (AC-14)", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse());

    await openMyTickets(user);
    await waitFor(() => expect(spy).toHaveBeenCalled());

    await openFilters(user);
    await user.selectOptions(screen.getByLabelText(/^category$/i), "8");
    await waitFor(() => expect(lastCall()[1]).toMatchObject({ categoryId: "8" }));

    await user.selectOptions(screen.getByLabelText(/requested priority/i), "URGENT");
    await waitFor(() =>
      expect(lastCall()[1]).toMatchObject({ requestedPriority: "URGENT" }),
    );

    await user.selectOptions(screen.getByLabelText(/current status/i), "Resolved");
    await waitFor(() =>
      expect(lastCall()[1]).toMatchObject({
        categoryId: "8",
        requestedPriority: "URGENT",
        currentStatus: "Resolved",
      }),
    );
  });

  it("offers only the categories returned by the backend", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse());

    await openMyTickets(user);

    await openFilters(user);

    const categoryFilter = screen.getByLabelText(/^category$/i);
    expect(
      within(categoryFilter).getByRole("option", { name: "Test Category One" }),
    ).toBeInTheDocument();
    expect(
      within(categoryFilter).getByRole("option", { name: /all categories/i }),
    ).toBeInTheDocument();
  });

  it("sorts by the documented fields and orders (AC-15)", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse());

    await openMyTickets(user);
    await waitFor(() => expect(spy).toHaveBeenCalled());

    // BR-24 — the default request is last-updated descending.
    expect(lastCall()[1]).toMatchObject({ sortBy: "updatedAt", sortOrder: "desc" });

    await openFilters(user);
    await user.selectOptions(screen.getByLabelText(/sort by/i), "ticketNumber");
    await waitFor(() => expect(lastCall()[1]).toMatchObject({ sortBy: "ticketNumber" }));

    await user.selectOptions(screen.getByLabelText(/^order$/i), "asc");
    await waitFor(() => expect(lastCall()[1]).toMatchObject({ sortOrder: "asc" }));
  });

  it("navigates between pages and shows pagination metadata (AC-16)", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(api, "fetchMyTickets")
      .mockResolvedValue(
        listResponse(ROWS, { page: 1, pageSize: 10, totalItems: 25, totalPages: 3 }),
      );

    await openMyTickets(user);
    await waitFor(() => expect(spy).toHaveBeenCalled());

    expect(await screen.findByTestId("page-indicator")).toHaveTextContent(
      "Page 1 of 3",
    );
    // Previous is unavailable on the first page.
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();

    spy.mockResolvedValue(
      listResponse(ROWS, { page: 2, pageSize: 10, totalItems: 25, totalPages: 3 }),
    );
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => expect(lastCall()[1]).toMatchObject({ page: 2 }));
    expect(await screen.findByTestId("page-indicator")).toHaveTextContent(
      "Page 2 of 3",
    );
    expect(screen.getByRole("button", { name: /previous/i })).toBeEnabled();
  });

  it("disables Next on the last page", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchMyTickets").mockResolvedValue(
      listResponse(ROWS, { page: 3, pageSize: 10, totalItems: 25, totalPages: 3 }),
    );

    await openMyTickets(user);

    expect(await screen.findByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("changes the page size and returns to page 1 (BR-25)", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(api, "fetchMyTickets")
      .mockResolvedValue(
        listResponse(ROWS, { page: 2, pageSize: 10, totalItems: 25, totalPages: 3 }),
      );

    await openMyTickets(user);
    await waitFor(() => expect(spy).toHaveBeenCalled());

    await openFilters(user);
    await user.selectOptions(screen.getByLabelText(/per page/i), "20");

    await waitFor(() =>
      expect(lastCall()[1]).toMatchObject({ pageSize: 20, page: 1 }),
    );
  });

  it("returns to page 1 when a filter changes", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(api, "fetchMyTickets")
      .mockResolvedValue(
        listResponse(ROWS, { page: 1, pageSize: 10, totalItems: 25, totalPages: 3 }),
      );

    await openMyTickets(user);
    await waitFor(() => expect(spy).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(lastCall()[1]).toMatchObject({ page: 2 }));

    await openFilters(user);
    await user.selectOptions(screen.getByLabelText(/requested priority/i), "HIGH");
    await waitFor(() =>
      expect(lastCall()[1]).toMatchObject({ page: 1, requestedPriority: "HIGH" }),
    );
  });

  it("clears search and filters back to the defaults", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse());

    await openMyTickets(user);
    await waitFor(() => expect(spy).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/^search$/i), "printer");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    await openFilters(user);
    await user.selectOptions(screen.getByLabelText(/requested priority/i), "HIGH");
    await waitFor(() => expect(lastCall()[1]).toMatchObject({ search: "printer" }));

    await user.click(screen.getByRole("button", { name: /clear filters/i }));

    await waitFor(() =>
      expect(lastCall()[1]).toMatchObject({
        search: "",
        categoryId: "",
        requestedPriority: "",
        currentStatus: "",
        page: 1,
      }),
    );
    expect(screen.getByLabelText(/^search$/i)).toHaveValue("");
  });

  // -------------------------------------------------------------------------
  // AC-04 — changing requester reloads the list
  // -------------------------------------------------------------------------
  it("reloads the list for the new requester after a change", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse());

    await openMyTickets(user);
    await waitFor(() => expect(lastCall()[0]).toBe(11));

    await user.click(screen.getByRole("button", { name: /change requester/i }));
    await user.selectOptions(
      await screen.findByLabelText(/development requester/i),
      screen.getByRole("option", { name: /Beta Requester/ }),
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(lastCall()[0]).toBe(22));
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("returns to My Tickets when the requester changes from another screen (BR-07)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse());
    vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue([
      { id: 21, name: "Test System One" },
    ]);

    await openMyTickets(user);

    // Move to Create Ticket, then switch requester from there.
    await user.click(
      within(screen.getByRole("navigation", { name: /main/i })).getByRole(
        "button",
        { name: /create ticket/i },
      ),
    );
    await screen.findByRole("form", { name: /create ticket/i });

    await user.click(screen.getByRole("button", { name: /change requester/i }));
    await user.selectOptions(
      await screen.findByLabelText(/development requester/i),
      screen.getByRole("option", { name: /Beta Requester/ }),
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // The new requester lands on their own ticket list, not the previous
    // requester's Create Ticket form.
    expect(
      await screen.findByRole("heading", { name: /my tickets/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: /create ticket/i }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(lastCall()[0]).toBe(22));
  });

  it("discards the previous requester's filters when the requester changes", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse());

    await openMyTickets(user);
    await user.type(screen.getByLabelText(/^search$/i), "printer");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    await waitFor(() => expect(lastCall()[1]).toMatchObject({ search: "printer" }));

    await user.click(screen.getByRole("button", { name: /change requester/i }));
    await user.selectOptions(
      await screen.findByLabelText(/development requester/i),
      screen.getByRole("option", { name: /Beta Requester/ }),
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(lastCall()[0]).toBe(22));
    // The new requester starts from the documented defaults, not Alpha's search.
    expect(lastCall()[1]).toMatchObject({ search: "" });
    expect(screen.getByLabelText(/^search$/i)).toHaveValue("");
  });

  // -------------------------------------------------------------------------
  // Create Ticket action (BR-28)
  // -------------------------------------------------------------------------
  it("navigates to Create Ticket from the list header", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchMyTickets").mockResolvedValue(listResponse());
    vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue([
      { id: 21, name: "Test System One" },
    ]);

    await openMyTickets(user);

    const header = screen.getByRole("heading", { name: /my tickets/i }).parentElement!;
    await user.click(within(header).getByRole("button", { name: /create ticket/i }));

    expect(
      await screen.findByRole("form", { name: /create ticket/i }),
    ).toBeInTheDocument();
  });
});
