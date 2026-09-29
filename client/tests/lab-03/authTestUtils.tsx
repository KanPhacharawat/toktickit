import { render } from "@testing-library/react";
import { vi } from "vitest";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import * as authApi from "../../src/authApi.js";
import type { CurrentUser } from "../../src/authApi.js";

// Shared set-up for the Lab 3 authentication UI suites.

export const REQUESTER: CurrentUser = {
  id: 5,
  name: "Pat Requester",
  email: "pat@example.com",
  role: "Requester",
  mustChangePassword: false,
};

export const STAFF: CurrentUser = {
  id: 9,
  name: "Sam Staff",
  email: "sam@example.com",
  role: "ITStaff",
  mustChangePassword: false,
};

/** An empty Lab 4 staff dashboard body (api-spec.md §4.2), for suites that stay on auth. */
export function emptyStaffDashboard(): api.StaffDashboardData {
  return {
    generatedAt: "2026-10-01T00:00:00.000Z",
    timeZone: "Asia/Bangkok",
    metrics: [],
    secondary: [],
    byPriority: [],
    urgentTickets: [],
    recentTickets: [],
  };
}

/** Stubs the Lab 2/3/4 screens behind the gate so these suites stay on auth. */
export function stubLab2Screens() {
  vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
  vi.spyOn(api, "fetchMyTickets").mockResolvedValue({
    data: [],
    meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
  });
  vi.spyOn(api, "fetchQueue").mockResolvedValue({
    data: [],
    meta: {
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 0,
      counts: { active: 0, unassigned: 0, assignedToMe: 0 },
    },
  });
  vi.spyOn(api, "fetchAdminUsers").mockResolvedValue({ data: [], meta: { totalItems: 0 } });
  vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(emptyStaffDashboard());
  vi.spyOn(api, "fetchAdminDashboard").mockResolvedValue({
    ...emptyStaffDashboard(),
    users: { active: { Requester: 0, ITStaff: 0, Administrator: 0 }, inactive: 0 },
  });
}

/** Renders the whole app with the given session (null = signed out). */
export function renderApp(session: CurrentUser | null) {
  stubLab2Screens();
  vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(session);
  return render(<App />);
}

export function apiError(status: number, code: string, message = "Error", fieldErrors = {}) {
  return new api.ApiError(message, { status, code, fieldErrors });
}
