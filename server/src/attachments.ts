import { Router, type Request, type Response } from "express";
import multer from "multer";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { getPrisma } from "./prisma.js";
import {
  MAX_ACTIVE_ATTACHMENTS,
  MAX_FILE_SIZE_BYTES,
  generateStorageKey,
  isPermittedFile,
  safeDisplayFilename,
  validateRemovalReason,
} from "./attachmentPolicy.js";

export const attachmentsRouter = Router();

/** Where attachment bytes live. Overridable so tests get their own directory. */
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), "uploads");

/**
 * Files are buffered in memory and only written to disk once every rule has
 * passed, so a rejected upload never leaves a stray file behind.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  // One byte of headroom over the limit, so a file of exactly 5 MB is read in
  // full and the explicit `file.size` check below decides the boundary. Left
  // at exactly MAX_FILE_SIZE_BYTES, busboy rejects the allowed 5 MB file too.
  // The cap still stops an unbounded body from being buffered.
  limits: { fileSize: MAX_FILE_SIZE_BYTES + 1, files: 1 },
});

// --- response helpers -------------------------------------------------------

function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return res.status(status).json({ error: { code, message, ...extra } });
}

/** BR-39 — safe message only; never a stack trace, SQL, or a filesystem path. */
function internalError(res: Response, message: string) {
  return fail(res, 500, "INTERNAL_ERROR", message);
}

function parseId(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return parsed > 0 ? parsed : null;
}

/** The Attachment metadata shape from api-spec.md §9. */
interface AttachmentRecord {
  id: number;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date;
  removedAt: Date | null;
  removalReason: string | null;
}

function toAttachmentMetadata(attachment: AttachmentRecord) {
  return {
    id: attachment.id,
    originalFilename: attachment.originalFilename,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    uploadedAt: attachment.uploadedAt,
    removedAt: attachment.removedAt,
    removalReason: attachment.removalReason,
  };
}

type OwnershipFailure = { ok: false };
type OwnershipSuccess = { ok: true; ticketId: number };

/**
 * BR-10 — every attachment operation requires the parent Ticket to belong to
 * the selected Requester. Resolves ownership once and answers 404/403 itself.
 *
 * BR-09 — a Ticket owned by someone else returns 403 with nothing about the
 * real owner.
 */
async function requireOwnedTicket(
  req: Request,
  res: Response,
): Promise<OwnershipFailure | OwnershipSuccess> {
  const requesterId = parseId(req.params.requesterId);
  const ticketId = parseId(req.params.ticketId);

  if (requesterId === null || ticketId === null) {
    fail(res, 400, "VALIDATION_ERROR", "The request contains invalid data.", {
      fieldErrors: {
        ...(requesterId === null
          ? { requesterId: "A valid requester is required." }
          : {}),
        ...(ticketId === null ? { ticketId: "A valid ticket is required." } : {}),
      },
    });
    return { ok: false };
  }

  const ticket = await getPrisma().ticket.findFirst({
    where: { id: ticketId, deletedAt: null },
    select: { id: true, requesterId: true },
  });

  if (!ticket) {
    fail(res, 404, "NOT_FOUND", "Ticket not found.");
    return { ok: false };
  }

  if (ticket.requesterId !== requesterId) {
    fail(res, 403, "FORBIDDEN", "You do not have access to this ticket.");
    return { ok: false };
  }

  return { ok: true, ticketId: ticket.id };
}

// ---------------------------------------------------------------------------
// GET /api/requesters/:requesterId/tickets/:ticketId — Ticket Detail (§8)
// ---------------------------------------------------------------------------
attachmentsRouter.get(
  "/api/requesters/:requesterId/tickets/:ticketId",
  async (req: Request, res: Response) => {
    try {
      const owned = await requireOwnedTicket(req, res);
      if (!owned.ok) return;

      const ticket = await getPrisma().ticket.findUniqueOrThrow({
        where: { id: owned.ticketId },
        include: {
          requester: { select: { id: true, name: true, email: true } },
          category: { select: { id: true, name: true } },
          relatedSystem: { select: { id: true, name: true } },
          // BR-38 — removed attachments stay visible as metadata.
          attachments: { orderBy: { id: "asc" } },
        },
      });

      return res.status(200).json({
        data: {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          ticketDate: ticket.ticketDate,
          requester: ticket.requester,
          category: ticket.category,
          relatedSystem: ticket.relatedSystem,
          summary: ticket.summary,
          requestedPriority: ticket.requestedPriority,
          currentStatus: ticket.currentStatus,
          description: ticket.description,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt,
          attachments: ticket.attachments.map(toAttachmentMetadata),
        },
      });
    } catch (err) {
      console.error("GET ticket detail failed:", err);
      return internalError(res, "Could not load the ticket. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// GET .../attachments — Attachment metadata (§10)
// ---------------------------------------------------------------------------
attachmentsRouter.get(
  "/api/requesters/:requesterId/tickets/:ticketId/attachments",
  async (req: Request, res: Response) => {
    try {
      const owned = await requireOwnedTicket(req, res);
      if (!owned.ok) return;

      const attachments = await getPrisma().attachment.findMany({
        where: { ticketId: owned.ticketId },
        orderBy: { id: "asc" },
      });

      return res
        .status(200)
        .json({ data: attachments.map(toAttachmentMetadata) });
    } catch (err) {
      console.error("GET attachments failed:", err);
      return internalError(res, "Could not load attachments. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// POST .../attachments — upload one Attachment (§9)
// ---------------------------------------------------------------------------
attachmentsRouter.post(
  "/api/requesters/:requesterId/tickets/:ticketId/attachments",
  (req: Request, res: Response) => {
    upload.single("file")(req, res, async (uploadErr: unknown) => {
      // BR-30 — multer aborts the stream once the limit is passed.
      if (uploadErr instanceof multer.MulterError) {
        if (uploadErr.code === "LIMIT_FILE_SIZE") {
          return fail(
            res,
            413,
            "FILE_TOO_LARGE",
            "Each attachment must be 5 MB or smaller.",
          );
        }
        return fail(res, 400, "BAD_UPLOAD", "The upload request was malformed.");
      }
      if (uploadErr) {
        console.error("Attachment upload parsing failed:", uploadErr);
        return internalError(res, "Could not upload the attachment.");
      }

      try {
        const owned = await requireOwnedTicket(req, res);
        if (!owned.ok) return;

        const file = req.file;
        if (!file) {
          return fail(
            res,
            400,
            "BAD_UPLOAD",
            "A file is required in the `file` field.",
          );
        }

        // BR-29 — permitted types only.
        if (!isPermittedFile(file.mimetype, file.originalname)) {
          return fail(
            res,
            415,
            "UNSUPPORTED_FILE_TYPE",
            "Only JPG, JPEG, PNG, WEBP, and PDF files are allowed.",
          );
        }

        // BR-30 — the authoritative size boundary: 5 MB exactly is allowed,
        // one byte more is not.
        if (file.size > MAX_FILE_SIZE_BYTES) {
          return fail(
            res,
            413,
            "FILE_TOO_LARGE",
            "Each attachment must be 5 MB or smaller.",
          );
        }

        if (file.size === 0) {
          return fail(res, 400, "BAD_UPLOAD", "The file is empty.");
        }

        // BR-31 — only active attachments count towards the limit, so removing
        // one frees a slot.
        const activeCount = await getPrisma().attachment.count({
          where: { ticketId: owned.ticketId, removedAt: null },
        });
        if (activeCount >= MAX_ACTIVE_ATTACHMENTS) {
          return fail(
            res,
            409,
            "ATTACHMENT_LIMIT_REACHED",
            `A ticket may have at most ${MAX_ACTIVE_ATTACHMENTS} active attachments.`,
          );
        }

        // BR-33 — server-generated storage key, never the client's filename.
        const storageKey = generateStorageKey(file.originalname);
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        await fs.writeFile(path.join(UPLOAD_DIR, storageKey), file.buffer);

        try {
          const attachment = await getPrisma().attachment.create({
            data: {
              ticketId: owned.ticketId,
              originalFilename: safeDisplayFilename(file.originalname),
              storageKey,
              mimeType: file.mimetype,
              fileSize: file.size,
            },
          });

          return res
            .status(201)
            .json({ data: toAttachmentMetadata(attachment) });
        } catch (dbErr) {
          // Do not leave bytes on disk with no metadata row pointing at them.
          await fs
            .unlink(path.join(UPLOAD_DIR, storageKey))
            .catch(() => undefined);
          throw dbErr;
        }
      } catch (err) {
        console.error("POST attachment failed:", err);
        return internalError(
          res,
          "Could not upload the attachment. Please try again.",
        );
      }
    });
  },
);

// ---------------------------------------------------------------------------
// GET .../attachments/:attachmentId — download an active Attachment (§11)
// ---------------------------------------------------------------------------
attachmentsRouter.get(
  "/api/requesters/:requesterId/tickets/:ticketId/attachments/:attachmentId",
  async (req: Request, res: Response) => {
    try {
      const owned = await requireOwnedTicket(req, res);
      if (!owned.ok) return;

      const attachmentId = parseId(req.params.attachmentId);
      if (attachmentId === null) {
        return fail(res, 404, "NOT_FOUND", "Attachment not found.");
      }

      const attachment = await getPrisma().attachment.findFirst({
        where: { id: attachmentId, ticketId: owned.ticketId },
      });

      if (!attachment) {
        return fail(res, 404, "NOT_FOUND", "Attachment not found.");
      }

      // BR-37 — a removed attachment never returns file content.
      if (attachment.removedAt !== null) {
        return fail(
          res,
          410,
          "ATTACHMENT_REMOVED",
          "This attachment has been removed.",
        );
      }

      // storageKey is server-generated, but resolve and re-check anyway so a
      // corrupted row can never read outside the upload directory.
      const filePath = path.resolve(UPLOAD_DIR, attachment.storageKey);
      if (
        path.dirname(filePath) !== path.resolve(UPLOAD_DIR) ||
        !(await fs
          .stat(filePath)
          .then((s) => s.isFile())
          .catch(() => false))
      ) {
        console.error(
          `Attachment ${attachment.id} has no readable file on disk.`,
        );
        return fail(res, 404, "NOT_FOUND", "Attachment file is unavailable.");
      }

      res.setHeader("Content-Type", attachment.mimeType);
      res.setHeader("Content-Length", String(attachment.fileSize));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeDisplayFilename(attachment.originalFilename)}"`,
      );

      const stream = createReadStream(filePath);
      stream.on("error", (streamErr) => {
        console.error("Attachment download stream failed:", streamErr);
        if (!res.headersSent) {
          internalError(res, "Could not download the attachment.");
        } else {
          res.destroy();
        }
      });
      return stream.pipe(res);
    } catch (err) {
      console.error("GET attachment download failed:", err);
      return internalError(res, "Could not download the attachment.");
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE .../attachments/:attachmentId — soft removal (§12)
// ---------------------------------------------------------------------------
attachmentsRouter.delete(
  "/api/requesters/:requesterId/tickets/:ticketId/attachments/:attachmentId",
  async (req: Request, res: Response) => {
    try {
      const owned = await requireOwnedTicket(req, res);
      if (!owned.ok) return;

      const attachmentId = parseId(req.params.attachmentId);
      if (attachmentId === null) {
        return fail(res, 404, "NOT_FOUND", "Attachment not found.");
      }

      const attachment = await getPrisma().attachment.findFirst({
        where: { id: attachmentId, ticketId: owned.ticketId },
        select: { id: true, removedAt: true },
      });

      if (!attachment) {
        return fail(res, 404, "NOT_FOUND", "Attachment not found.");
      }

      // BR-35 — an explicit, non-empty reason is required.
      const { reason, error } = validateRemovalReason(
        (req.body as { removalReason?: unknown } | undefined)?.removalReason,
      );
      if (!reason) {
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "The request contains invalid data.",
          { fieldErrors: { removalReason: error } },
        );
      }

      if (attachment.removedAt !== null) {
        return fail(
          res,
          409,
          "ALREADY_REMOVED",
          "This attachment has already been removed.",
        );
      }

      // BR-36 — set the removal state; the metadata row stays.
      const removed = await getPrisma().attachment.update({
        where: { id: attachment.id },
        data: { removedAt: new Date(), removalReason: reason },
        select: { id: true, removedAt: true, removalReason: true },
      });

      return res.status(200).json({ data: removed });
    } catch (err) {
      console.error("DELETE attachment failed:", err);
      return internalError(
        res,
        "Could not remove the attachment. Please try again.",
      );
    }
  },
);

export default attachmentsRouter;
