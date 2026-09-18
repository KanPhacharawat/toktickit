import { Router, type Request, type Response } from "express";
import { getPrisma } from "./prisma.js";
import { protect } from "./auth/middleware.js";
import { hashPassword } from "./auth/credentials.js";
import { revokeAllSessions } from "./auth/session.js";
import { fail, internalError, parseId } from "./ticketAccess.js";
import {
  ROLES,
  validateCreateUserBody,
  validateEditUserBody,
  validateInitialPasswordBody,
} from "./adminUserValidation.js";

// Administrator User Management — api-spec.md §14, specification.md §5.9.

export const adminUsersRouter = Router();

/** Prisma's unique-constraint violation. */
const UNIQUE_VIOLATION = "P2002";

/** api-spec.md §3.2 — the only fields an admin endpoint ever returns. */
function toAdminUser(user: {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

const ADMIN_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
} as const;

function scalar(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

// ---------------------------------------------------------------------------
// GET /api/admin/users (§14.1). BR-56 — one search term, one role filter,
// sorted by name then id, not paginated.
// ---------------------------------------------------------------------------
adminUsersRouter.get(
  "/api/admin/users",
  ...protect("Administrator"),
  async (req: Request, res: Response) => {
    const fieldErrors: Record<string, string> = {};

    let search = "";
    const rawSearch = scalar(req.query.search);
    if (rawSearch !== null) {
      const trimmed = rawSearch.trim();
      if (trimmed.length > 200) {
        fieldErrors.search = "Search must be 200 characters or fewer.";
      } else {
        search = trimmed;
      }
    }

    let role: string | null = null;
    const rawRole = req.query.role;
    if (rawRole !== undefined && rawRole !== "") {
      const value = scalar(rawRole);
      if (value === null || !(ROLES as readonly string[]).includes(value)) {
        fieldErrors.role = "Select a valid role.";
      } else {
        role = value;
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", { fieldErrors });
    }

    try {
      const where = {
        deletedAt: null,
        ...(role ? { role: role as never } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { email: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };

      const users = await getPrisma().user.findMany({
        where,
        select: ADMIN_USER_SELECT,
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });

      return res.status(200).json({
        data: users.map(toAdminUser),
        meta: { totalItems: users.length },
      });
    } catch (err) {
      console.error("GET /api/admin/users failed:", err);
      return internalError(res, "Could not load users. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/admin/users (§14.2). BR-50.
// ---------------------------------------------------------------------------
adminUsersRouter.post(
  "/api/admin/users",
  ...protect("Administrator"),
  async (req: Request, res: Response) => {
    const { input, fieldErrors } = validateCreateUserBody(req.body);
    if (!input) {
      return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", { fieldErrors });
    }

    try {
      const passwordHash = await hashPassword(input.initialPassword);
      const created = await getPrisma().user.create({
        data: {
          name: input.name,
          email: input.email,
          role: input.role,
          isActive: input.isActive,
          passwordHash,
          mustChangePassword: true,
        },
        select: ADMIN_USER_SELECT,
      });

      return res.status(201).json({ data: toAdminUser(created) });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === UNIQUE_VIOLATION) {
        return fail(res, 409, "EMAIL_ALREADY_IN_USE", "This email is already used by another account.", {
          fieldErrors: { email: "This email is already used by another account." },
        });
      }
      console.error("POST /api/admin/users failed:", err);
      return internalError(res, "Could not create the user. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/admin/users/:userId (§14.3).
// ---------------------------------------------------------------------------
adminUsersRouter.get(
  "/api/admin/users/:userId",
  ...protect("Administrator"),
  async (req: Request, res: Response) => {
    const userId = parseId(req.params.userId);
    if (userId === null) {
      return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
        fieldErrors: { userId: "A valid user is required." },
      });
    }

    try {
      const user = await getPrisma().user.findFirst({
        where: { id: userId, deletedAt: null },
        select: ADMIN_USER_SELECT,
      });
      if (!user) return fail(res, 404, "NOT_FOUND", "User not found.");
      return res.status(200).json({ data: toAdminUser(user) });
    } catch (err) {
      console.error("GET /api/admin/users/:userId failed:", err);
      return internalError(res, "Could not load the user. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/:userId (§14.4). BR-51, BR-53, BR-54, BR-36.
// ---------------------------------------------------------------------------
adminUsersRouter.patch(
  "/api/admin/users/:userId",
  ...protect("Administrator"),
  async (req: Request, res: Response) => {
    const userId = parseId(req.params.userId);
    if (userId === null) {
      return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
        fieldErrors: { userId: "A valid user is required." },
      });
    }

    const { input, fieldErrors } = validateEditUserBody(req.body);
    if (!input) {
      return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", { fieldErrors });
    }

    try {
      const prisma = getPrisma();
      const target = await prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { id: true, email: true, role: true, isActive: true },
      });
      if (!target) return fail(res, 404, "NOT_FOUND", "User not found.");

      // BR-53 — an Administrator can never deactivate themselves.
      if (input.isActive === false && userId === req.auth!.user.id) {
        return fail(res, 409, "SELF_DEACTIVATION_BLOCKED", "You cannot deactivate your own account.");
      }

      // BR-54 — no change may leave zero active Administrators.
      const willDeactivate = input.isActive === false;
      const willChangeRoleAway = input.role !== undefined && input.role !== "Administrator";
      if (target.role === "Administrator" && target.isActive && (willDeactivate || willChangeRoleAway)) {
        const otherActiveAdmins = await prisma.user.count({
          where: { role: "Administrator", isActive: true, deletedAt: null, id: { not: userId } },
        });
        if (otherActiveAdmins === 0) {
          return fail(
            res,
            409,
            "LAST_ACTIVE_ADMINISTRATOR",
            "At least one active administrator is required.",
          );
        }
      }

      // BR-51 — duplicate email check (a race still fails safely on the
      // unique index below).
      if (input.email !== undefined && input.email !== target.email) {
        const duplicate = await prisma.user.findFirst({
          where: { email: input.email, id: { not: userId } },
          select: { id: true },
        });
        if (duplicate) {
          return fail(res, 409, "EMAIL_ALREADY_IN_USE", "This email is already used by another account.", {
            fieldErrors: { email: "This email is already used by another account." },
          });
        }
      }

      const deactivating = input.isActive === false && target.isActive === true;
      const demotingFromStaff = input.role === "Requester" && target.role !== "Requester";
      const shouldUnassign = deactivating || demotingFromStaff;

      const [updated, unassignedTicketCount] = await prisma.$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.email !== undefined ? { email: input.email } : {}),
            ...(input.role !== undefined ? { role: input.role } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          },
          select: ADMIN_USER_SELECT,
        });

        let count = 0;
        if (shouldUnassign) {
          const result = await tx.ticket.updateMany({
            where: { ticketOwnerId: userId, currentStatus: { notIn: ["Closed", "Cancelled"] } },
            data: { ticketOwnerId: null },
          });
          count = result.count;
        }
        return [updatedUser, count];
      });

      // BR-22 — deactivation revokes every session; a role change alone does
      // not (role is read fresh from the database on every request).
      const sessionsRevoked = deactivating ? await revokeAllSessions(userId) : false;

      return res.status(200).json({
        data: toAdminUser(updated),
        meta: { unassignedTicketCount, sessionsRevoked },
      });
    } catch (err) {
      console.error("PATCH /api/admin/users/:userId failed:", err);
      return internalError(res, "Could not update the user. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/admin/users/:userId/initial-password (§14.5). BR-55.
// ---------------------------------------------------------------------------
adminUsersRouter.post(
  "/api/admin/users/:userId/initial-password",
  ...protect("Administrator"),
  async (req: Request, res: Response) => {
    const userId = parseId(req.params.userId);
    if (userId === null) {
      return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
        fieldErrors: { userId: "A valid user is required." },
      });
    }

    try {
      const prisma = getPrisma();
      // Allowed for inactive users too — they still cannot log in until
      // reactivated.
      const target = await prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { id: true, email: true },
      });
      if (!target) return fail(res, 404, "NOT_FOUND", "User not found.");

      const { initialPassword, fieldErrors } = validateInitialPasswordBody(req.body, target.email);
      if (!initialPassword) {
        return fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", { fieldErrors });
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: await hashPassword(initialPassword),
          mustChangePassword: true,
        },
        select: ADMIN_USER_SELECT,
      });

      const sessionsRevoked = await revokeAllSessions(userId);

      return res.status(200).json({ data: toAdminUser(updated), meta: { sessionsRevoked } });
    } catch (err) {
      console.error("POST /api/admin/users/:userId/initial-password failed:", err);
      return internalError(res, "Could not set the password. Please try again.");
    }
  },
);

export default adminUsersRouter;
