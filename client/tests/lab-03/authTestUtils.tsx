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

/** Stubs the Lab 2 screens behind the gate so these suites stay on auth. */
export function stubLab2Screens() {
  vi.spyOn(api, "fetchActiveRequesters").mockResolvedValue([]);
  vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
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
