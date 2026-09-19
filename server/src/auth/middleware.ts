import type { UserRole } from "@prisma/client";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  readCookie,
  resolveSession,
} from "./session.js";

export type AuthUser = NonNullable<Awaited<ReturnType<typeof resolveSession>>>["user"];

export interface RequestAuth {
  sessionId: number;
  user: AuthUser;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `requireAuth` from the database, never from client input. */
      auth?: RequestAuth;
    }
  }
}

/** Lab 3 api-spec §2.1 envelope for an absent, expired, or revoked session. */
export function unauthenticated(res: Response) {
  clearSessionCookie(res);
  return res.status(401).json({
    error: {
      code: "UNAUTHENTICATED",
      message: "Please sign in to continue.",
    },
  });
}

/** The session token sent by the browser, if any. */
export function sessionTokenFrom(req: Request): string | null {
  return readCookie(req.headers.cookie, SESSION_COOKIE);
}

/**
 * BR-08 step 1 — resolves the session cookie to an active user, or answers
 * `401`. Identity and role come from the database on every request (BR-22).
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = sessionTokenFrom(req);
    const resolved = token ? await resolveSession(token) : null;
    if (!resolved) return unauthenticated(res);

    req.auth = resolved;
    return next();
  } catch (err) {
    console.error("Session resolution failed:", err);
    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Could not verify your session. Please try again.",
      },
    });
  }
}

/** Lab 3 api-spec §2.1 envelope for a route blocked by the password-change gate. */
function passwordChangeRequired(res: Response) {
  return res.status(403).json({
    error: {
      code: "PASSWORD_CHANGE_REQUIRED",
      message: "Change your password before continuing.",
    },
  });
}

/**
 * BR-08 step 2 / BR-02 — every protected route requires a completed password
 * change, except `/auth/me`, `/auth/logout`, and `/auth/change-password`
 * (which call `requireAuth` directly and never this). Must run after
 * `requireAuth`, which sets `req.auth`.
 */
export function requirePasswordChangeComplete(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.auth!.user.mustChangePassword) return passwordChangeRequired(res);
  return next();
}

/** Lab 3 api-spec §2.1 envelope for a role the caller does not have. */
function forbidden(res: Response) {
  return res.status(403).json({
    error: {
      code: "FORBIDDEN",
      message: "You do not have access to this resource.",
    },
  });
}

/**
 * BR-08 step 3 — the caller's role must be one of `roles`. Must run after
 * `requireAuth`.
 *
 * BR-09 — this runs before any resource lookup, so a role that may never use
 * a route gets the identical `403` for every id, valid or not.
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, res, next) => {
    if (!roles.includes(req.auth!.user.role)) return forbidden(res);
    return next();
  };
}

/**
 * Composes the standard guard chain for a protected route (BR-08 steps 1–3):
 * session, then the password-change gate, then role when `roles` is given.
 * Spread the result into an Express route:
 * `router.get(path, ...protect("Requester"), handler)`. With no roles, every
 * authenticated, gated user may proceed — the Lab 3 matrix's "Yes" for every
 * role (Categories, Related Systems).
 */
export function protect(...roles: UserRole[]): RequestHandler[] {
  const chain: RequestHandler[] = [requireAuth, requirePasswordChangeComplete];
  if (roles.length > 0) chain.push(requireRole(...roles));
  return chain;
}
