import type { NextFunction, Request, Response } from "express";
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
