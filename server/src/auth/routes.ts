import { Router, type Request, type Response } from "express";
import { getPrisma } from "../prisma.js";
import {
  hashPassword,
  normalizeEmail,
  passwordRuleError,
  timingSafeDummyHash,
  verifyPassword,
} from "./credentials.js";
import { loginThrottle } from "./loginThrottle.js";
import { requireAuth, sessionTokenFrom, type AuthUser } from "./middleware.js";
import {
  clearSessionCookie,
  createSession,
  hashSessionToken,
  revokeOtherSessions,
  setSessionCookie,
} from "./session.js";

// Authentication API — Lab 3 api-spec.md §4.

export const authRouter = Router();

const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password. Please try again.";

function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  fieldErrors?: Record<string, string>,
) {
  return res
    .status(status)
    .json({ error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } });
}

/** BR-20 — the only user fields the auth endpoints ever return. */
function toCurrentUser(user: Pick<AuthUser, "id" | "name" | "email" | "role" | "mustChangePassword">) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// ---------------------------------------------------------------------------
// POST /api/auth/login — api-spec.md §4.1
// ---------------------------------------------------------------------------
authRouter.post("/api/auth/login", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  // Shape errors are not credential failures, so they never count towards
  // the throttle (BR-16).
  const fieldErrors: Record<string, string> = {};
  if (!nonEmptyString(body.email) || body.email.trim() === "") {
    fieldErrors.email = "Email is required.";
  }
  if (!nonEmptyString(body.password)) {
    fieldErrors.password = "Password is required.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", fieldErrors);
  }

  const email = normalizeEmail(body.email as string);
  const password = body.password as string;

  // BR-16 — checked before credentials, so a locked email is refused even
  // with the right password, and the refusal is not counted again.
  const retryAfter = loginThrottle.retryAfterSeconds(email);
  if (retryAfter > 0) {
    res.setHeader("Retry-After", String(retryAfter));
    return fail(res, 429, "TOO_MANY_ATTEMPTS", "Too many sign-in attempts. Try again later.");
  }

  try {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        mustChangePassword: true,
        passwordHash: true,
        isActive: true,
        deletedAt: true,
      },
    });

    // BR-14 — unknown email, a removed row, and "no password yet" all do the
    // same bcrypt work and get the same answer as a wrong password.
    const hash = user && user.deletedAt === null ? user.passwordHash : null;
    const matches = await verifyPassword(password, hash ?? (await timingSafeDummyHash()));

    if (!user || !hash || !matches) {
      loginThrottle.recordFailure(email);
      return fail(res, 401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE);
    }

    // BR-15 — the inactive message is only revealed to the password holder.
    if (!user.isActive) {
      return fail(
        res,
        403,
        "ACCOUNT_INACTIVE",
        "This account cannot sign in. Contact your administrator.",
      );
    }

    loginThrottle.recordSuccess(email);

    // Signing in again replaces whatever session this browser already had.
    const previousToken = sessionTokenFrom(req);
    if (previousToken) {
      await prisma.session.updateMany({
        where: { tokenHash: hashSessionToken(previousToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    const { token } = await createSession(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    setSessionCookie(res, token);
    return res.status(200).json({ data: { user: toCurrentUser(user) } });
  } catch (err) {
    console.error("POST /api/auth/login failed:", err);
    return fail(res, 500, "INTERNAL_ERROR", "Could not sign in. Please try again.");
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout — api-spec.md §4.2
// ---------------------------------------------------------------------------
authRouter.post("/api/auth/logout", async (req: Request, res: Response) => {
  const token = sessionTokenFrom(req);
  try {
    // BR-19 — idempotent: no cookie, or a dead one, still answers 204.
    if (token) {
      await getPrisma().session.updateMany({
        where: { tokenHash: hashSessionToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearSessionCookie(res);
    return res.status(204).end();
  } catch (err) {
    console.error("POST /api/auth/logout failed:", err);
    clearSessionCookie(res);
    return fail(res, 500, "INTERNAL_ERROR", "Could not sign out. Please try again.");
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/me — api-spec.md §4.3
// ---------------------------------------------------------------------------
authRouter.get("/api/auth/me", requireAuth, (req: Request, res: Response) => {
  // BR-20 — identity comes from the session only; any user id in the query
  // string is ignored.
  return res.status(200).json({ data: toCurrentUser(req.auth!.user) });
});

// ---------------------------------------------------------------------------
// POST /api/auth/change-password — api-spec.md §4.4
// ---------------------------------------------------------------------------
authRouter.post(
  "/api/auth/change-password",
  requireAuth,
  async (req: Request, res: Response) => {
    const { user, sessionId } = req.auth!;
    const body = (req.body ?? {}) as Record<string, unknown>;

    // 1. Shape and rule errors, all returned together.
    const fieldErrors: Record<string, string> = {};
    if (!nonEmptyString(body.currentPassword)) {
      fieldErrors.currentPassword = "Current password is required.";
    }
    if (!nonEmptyString(body.newPassword)) {
      fieldErrors.newPassword = "New password is required.";
    } else {
      const ruleError = passwordRuleError(body.newPassword, user.email);
      if (ruleError) fieldErrors.newPassword = ruleError;
    }
    if (Object.keys(fieldErrors).length > 0) {
      return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", fieldErrors);
    }

    const currentPassword = body.currentPassword as string;
    const newPassword = body.newPassword as string;

    try {
      const prisma = getPrisma();
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { passwordHash: true },
      });

      // 2. BR-21 — a wrong current password is a field error, not a 401, so
      //    the user is not signed out for a typo.
      const currentMatches =
        stored.passwordHash !== null &&
        (await verifyPassword(currentPassword, stored.passwordHash));
      if (!currentMatches) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          currentPassword: "Current password is incorrect.",
        });
      }

      // 3. The new password must actually change something.
      if (newPassword === currentPassword) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
          newPassword: "New password must be different from your current password.",
        });
      }

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(newPassword),
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
        select: { id: true, name: true, email: true, role: true, mustChangePassword: true },
      });

      // BR-21 — every other session ends; this one continues.
      await revokeOtherSessions(user.id, sessionId);

      return res.status(200).json({ data: { user: toCurrentUser(updated) } });
    } catch (err) {
      console.error("POST /api/auth/change-password failed:", err);
      return fail(res, 500, "INTERNAL_ERROR", "Could not change the password. Please try again.");
    }
  },
);

export default authRouter;
