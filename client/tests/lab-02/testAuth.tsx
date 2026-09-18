import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { AuthProvider } from "../../src/AuthContext.js";
import * as authApi from "../../src/authApi.js";
import type { CurrentUser } from "../../src/authApi.js";

// Lab 3 — the Requester screens read identity from AuthContext instead of the
// removed Development Requester selector. These Lab 2 component suites test
// the screens themselves, not authentication, so they sign in once as a
// fixture Requester and render straight past the session check. Callers use
// `findBy*` queries (which poll) rather than `getBy*` for the first assertion,
// since the session check resolves asynchronously.

export const REQUESTER: CurrentUser = {
  id: 11,
  name: "Alpha Requester",
  email: "alpha@example.com",
  role: "Requester",
  mustChangePassword: false,
};

/** Renders `children` inside an AuthProvider signed in as the given user. */
export function renderAsRequester(children: ReactElement, user: CurrentUser = REQUESTER) {
  vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(user);
  return render(<AuthProvider>{children}</AuthProvider>);
}
