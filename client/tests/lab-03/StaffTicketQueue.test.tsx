import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import * as authApi from "../../src/authApi.js";
import { STAFF } from "./authTestUtils.js";

// IT Staff Ticket Queue issue — tests.md §5, UI-24/UI-25/UI-26.

function row(overrides: Partial<api.QueueRow> = {}): api.QueueRow {
  return {
    id: 1,
    ticketNumber: "TT-20260905-0001",
    ticketDate: "2026-09-05T12:30:00.000Z",
    summary: "Printer jams constantly",
    category: { id: 2, name: "Hardware" },
    requester: { id: 1, name: "Requester A", email: "requester-a@example.com" },
    requestedPriority: "LOW",
    itPriority: "MEDIUM",
    currentStatus: "New",
    ticketOwner: null,
    problemAppearsResolvedAt: null,
    updatedAt: "2026-09-05T12:30:00.000Z",
    ...overrides,
  };
}

const ROWS: api.QueueRow[] = [
  row(),
  row({
    id: 2,
    ticketNumber: "TT-20260905-0002",
    summary: "VPN disconnects randomly",
    requestedPriority: "URGENT",
    itPriority: "URGENT",
    currentStatus: "InProgress",
    ticketOwner: { id: STAFF.id, name: STAFF.name, role: "ITStaff" },
  }),
];

function queueResponse(
  data: api.QueueRow[] = ROWS,
  metaOverrides: Partial<api.QueueMeta> = {},
): api.QueueResponse {
  return {
    data,
    meta: {
      page: 1,
      pageSize: 20,
      totalItems: data.length,
      totalPages: data.length === 0 ? 0 : 1,
      counts: { active: data.length, unassigned: 1, assignedToMe: 1 },
      ...metaOverrides,
    },
  };
}

function mockCategories() {
  vi.spyOn(api, "fetchCategories").mockResolvedValue([
    { id: 2, name: "Hardware" },
    { id: 3, name: "Software" },
  ]);
}

/**
 * Renders the whole app signed in as staff. Callers must set up their
 * `fetchQueue`/`fetchCategories` mocks *before* calling this, since the
 * queue screen fetches on mount.
 */
async function openQueue() {
  vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(STAFF);
  render(<App />);
  await screen.findByRole("heading", { name: /ticket queue/i });
}

function lastCall() {
  const spy = vi.mocked(api.fetchQueue);
  return spy.mock.calls[spy.mock.calls.length - 1][0];
}

describe("UI-24 — queue table content (AC-28)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockCategories();
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders the seven documented columns and row content", async () => {
    vi.spyOn(api, "fetchQueue").mockResolvedValue(queueResponse());

    await openQueue();
    await screen.findByTestId("queue-rows");

    for (const header of [
      /ticket/i,
      /summary/i,
      /req\. priority/i,
      /it priority/i,
      /status/i,
      /owner/i,
      /last updated/i,
    ]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }

    const rows = within(screen.getByTestId("queue-rows")).getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("TT-20260905-0001")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/requester a/i)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/it: medium/i)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/unassigned/i)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/^you$/i)).toBeInTheDocument();
  });

  it("shows the resolution indicator badge when set", async () => {
    vi.spyOn(api, "fetchQueue").mockResolvedValue(
      queueResponse([row({ problemAppearsResolvedAt: "2026-09-06T00:00:00.000Z" })]),
    );

    await openQueue();

    const rows = await waitFor(() =>
      within(screen.getByTestId("queue-rows")).getAllByRole("row"),
    );
    expect(within(rows[0]).getByText(/problem appears resolved/i)).toBeInTheDocument();
  });
});

describe("UI-25 — queue controls (AC-29–AC-32)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockCategories();
  });
  afterEach(() => vi.restoreAllMocks());

  it("defaults to the Active quick view with counts shown", async () => {
    vi.spyOn(api, "fetchQueue").mockResolvedValue(queueResponse());

    await openQueue();
    await waitFor(() => expect(lastCall()).toMatchObject({ statusGroup: "active" }));

    const active = screen.getByRole("button", { name: /^active/i });
    expect(active).toHaveAttribute("aria-pressed", "true");
    expect(active).toHaveTextContent("2");
  });

  it("Unassigned quick view sends statusGroup=active and ownership=unassigned", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchQueue").mockResolvedValue(queueResponse());
    await openQueue();

    await user.click(screen.getByRole("button", { name: /^unassigned/i }));
    await waitFor(() =>
      expect(lastCall()).toMatchObject({ statusGroup: "active", ownership: "unassigned" }),
    );
  });

  it("Assigned to Me quick view sends ownership=mine", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchQueue").mockResolvedValue(queueResponse());
    await openQueue();

    await user.click(screen.getByRole("button", { name: /assigned to me/i }));
    await waitFor(() => expect(lastCall()).toMatchObject({ ownership: "mine" }));
  });

  it("All quick view clears status and ownership", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchQueue").mockResolvedValue(queueResponse());
    await openQueue();

    await user.click(screen.getByRole("button", { name: /^all$/i }));
    await waitFor(() =>
      expect(lastCall()).toMatchObject({ statusGroup: "", ownership: "" }),
    );
  });

  it("sends the search term on submit", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "fetchQueue").mockResolvedValue(queueResponse());
    await openQueue();
    await waitFor(() => expect(spy).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/^search$/i), "printer");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => expect(lastCall()).toMatchObject({ search: "printer" }));
  });

  it("filters by IT Priority, Requested Priority, and category", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchQueue").mockResolvedValue(queueResponse());
    await openQueue();

    await user.click(screen.getByRole("button", { name: /^filters/i }));
    await user.selectOptions(screen.getByLabelText(/it priority/i), "URGENT");
    await waitFor(() => expect(lastCall()).toMatchObject({ itPriority: "URGENT" }));

    await user.selectOptions(screen.getByLabelText(/requested priority/i), "HIGH");
    await waitFor(() => expect(lastCall()).toMatchObject({ requestedPriority: "HIGH" }));

    await user.selectOptions(screen.getByLabelText(/^category$/i), "3");
    await waitFor(() => expect(lastCall()).toMatchObject({ categoryId: "3" }));
  });

  it("sorts by IT Priority descending", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchQueue").mockResolvedValue(queueResponse());
    await openQueue();

    await user.click(screen.getByRole("button", { name: /^filters/i }));
    await user.selectOptions(screen.getByLabelText(/sort by/i), "itPriority");
    await user.selectOptions(screen.getByLabelText(/^order$/i), "desc");

    await waitFor(() =>
      expect(lastCall()).toMatchObject({ sortBy: "itPriority", sortOrder: "desc" }),
    );
  });

  it("resets to page 1 on a filter change and paginates", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(api, "fetchQueue")
      .mockResolvedValue(queueResponse(ROWS, { page: 1, totalItems: 45, totalPages: 3 }));
    await openQueue();
    await waitFor(() => expect(spy).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(lastCall()).toMatchObject({ page: 2 }));

    await user.click(screen.getByRole("button", { name: /^filters/i }));
    await user.selectOptions(screen.getByLabelText(/it priority/i), "HIGH");
    await waitFor(() => expect(lastCall()).toMatchObject({ page: 1, itPriority: "HIGH" }));
  });

  it("clears filters back to the Active defaults", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchQueue").mockResolvedValue(queueResponse());
    await openQueue();

    await user.type(screen.getByLabelText(/^search$/i), "printer");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    await waitFor(() => expect(lastCall()).toMatchObject({ search: "printer" }));

    await user.click(screen.getByRole("button", { name: /^filters/i }));
    await user.click(screen.getByRole("button", { name: /clear filters/i }));
    await waitFor(() =>
      expect(lastCall()).toMatchObject({ search: "", statusGroup: "active", ownership: "" }),
    );
  });
});

describe("UI-26 — queue feedback states (AC-33, AC-59)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockCategories();
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows a loading state, then the busy attribute clears", async () => {
    let resolvePending: (v: api.QueueResponse) => void = () => {};
    vi.spyOn(api, "fetchQueue").mockReturnValue(
      new Promise((resolve) => {
        resolvePending = resolve;
      }),
    );

    await openQueue();
    expect(screen.getByRole("status", { hidden: true })).toHaveAttribute("aria-busy", "true");

    resolvePending(queueResponse());
    expect(await screen.findByTestId("queue-rows")).toBeInTheDocument();
  });

  it("shows the empty state only in the All view with zero tickets", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchQueue").mockResolvedValue(queueResponse([]));
    await openQueue();

    // Active view (default) with zero tickets is "no results", not "empty".
    expect(await screen.findByTestId("no-results-state")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^all$/i }));
    expect(await screen.findByTestId("empty-state")).toHaveTextContent(
      /no tickets in the system yet/i,
    );
  });

  it("shows no-results with Clear filters wording for Unassigned", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchQueue").mockResolvedValue(queueResponse([]));
    await openQueue();

    await user.click(screen.getByRole("button", { name: /^unassigned/i }));
    const noResults = await screen.findByTestId("no-results-state");
    expect(noResults).toHaveTextContent(/no unassigned active tickets/i);
    expect(within(noResults).getByRole("button", { name: /clear filters/i })).toBeInTheDocument();
  });

  it("resets filters and shows a warning banner on an invalid query (400)", async () => {
    vi.spyOn(api, "fetchQueue").mockRejectedValue(
      new api.ApiError("The request contains invalid data.", {
        status: 400,
        code: "VALIDATION_ERROR",
        fieldErrors: { pageSize: "Page size must be one of: 10, 20, 50." },
      }),
    );

    await openQueue();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /some filters were not valid and have been reset/i,
    );
  });

  it("shows a safe failure banner with Retry on a server error", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(api, "fetchQueue")
      .mockRejectedValueOnce(
        new api.ApiError("Could not load the queue. Please try again.", {
          status: 500,
          code: "INTERNAL_ERROR",
        }),
      )
      .mockResolvedValue(queueResponse());

    await openQueue();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not load the queue/i);
    expect(alert.textContent).not.toMatch(/prisma|postgres|sql|stack|\.ts:/i);

    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByTestId("queue-rows")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("shows the Forbidden panel is not applicable here; a 403 surfaces as a failure state", async () => {
    // The queue route itself is role-gated server-side; a Requester never
    // reaches this screen (see RoleNavigation.test.tsx). This documents
    // that an unexpected 403 still fails safely rather than crashing.
    vi.spyOn(api, "fetchQueue").mockRejectedValue(
      new api.ApiError("You do not have access to this resource.", {
        status: 403,
        code: "FORBIDDEN",
      }),
    );

    await openQueue();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
