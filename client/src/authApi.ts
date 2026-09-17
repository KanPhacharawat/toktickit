import { API_URL, ApiError } from "./api.js";

// Authentication API client — Lab 3 api-spec.md §4.
//
// Every call sends `credentials: "include"` so the HttpOnly session cookie
// travels with it. The token itself is never visible to this code (BR-17).

export type UserRole = "Requester" | "ITStaff" | "Administrator";

export const ROLE_LABELS: Record<UserRole, string> = {
  Requester: "Requester",
  ITStaff: "IT Staff",
  Administrator: "Administrator",
};

/** BR-20 — the identity the server returns for the signed-in user. */
export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
}

const NETWORK_MESSAGE = "Could not reach the server. Please try again.";

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: init.body ? { "Content-Type": "application/json", ...init.headers } : init.headers,
    });
  } catch {
    throw new ApiError(NETWORK_MESSAGE, { status: 0, code: "NETWORK_ERROR" });
  }
}

async function readBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function errorFrom(res: Response, body: unknown, fallback: string): ApiError {
  const error = (body as { error?: Record<string, unknown> } | null)?.error;
  return new ApiError(typeof error?.message === "string" ? error.message : fallback, {
    status: res.status,
    code: typeof error?.code === "string" ? error.code : "UNKNOWN",
    fieldErrors:
      typeof error?.fieldErrors === "object" && error.fieldErrors !== null
        ? (error.fieldErrors as Record<string, string>)
        : {},
  });
}

function userFrom(res: Response, value: unknown): CurrentUser {
  const user = value as CurrentUser | undefined;
  if (!user || typeof user.id !== "number" || typeof user.role !== "string") {
    throw new ApiError("The server response was not understood.", {
      status: res.status,
      code: "BAD_RESPONSE",
    });
  }
  return user;
}

/** POST /api/auth/login — throws ApiError with the server's status and code. */
export async function login(email: string, password: string): Promise<CurrentUser> {
  const res = await send("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const body = await readBody(res);
  if (!res.ok) throw errorFrom(res, body, "Could not sign in. Please try again.");
  return userFrom(res, (body as { data?: { user?: unknown } } | null)?.data?.user);
}

/** POST /api/auth/logout — idempotent on the server. */
export async function logout(): Promise<void> {
  const res = await send("/api/auth/logout", { method: "POST" });
  if (!res.ok && res.status !== 204) {
    throw errorFrom(res, await readBody(res), "Could not sign out. Please try again.");
  }
}

/** GET /api/auth/me — resolves to null when there is no valid session. */
export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const res = await send("/api/auth/me");
  if (res.status === 401) return null;
  const body = await readBody(res);
  if (!res.ok) throw errorFrom(res, body, "Could not check your session. Please try again.");
  return userFrom(res, (body as { data?: unknown } | null)?.data);
}

/** POST /api/auth/change-password — field errors arrive on the thrown ApiError. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<CurrentUser> {
  const res = await send("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const body = await readBody(res);
  if (!res.ok) throw errorFrom(res, body, "Could not change the password. Please try again.");
  return userFrom(res, (body as { data?: { user?: unknown } } | null)?.data?.user);
}
