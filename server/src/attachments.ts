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
import { protect } from "./auth/middleware.js";
import { fail, internalError, parseId, resolveTicketAccess } from "./ticketAccess.js";
import { isTerminal } from "./statusTransitions.js";
import { loadStaffTicketDetail } from "./ticketDetailView.js";

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

// ---------------------------------------------------------------------------
// GET /api/tickets/:ticketId — Ticket Detail (api-spec.md §8.1, §3.5, §3.6).
//
// Requester (own): RequesterTicketDetail. IT Staff / Administrator (any):
// StaffTicketDetail, with itPriority, ticketOwner, allowedStatusTransitions,
// and the staff permissions object.
// ---------------------------------------------------------------------------
attachmentsRouter.get(
  "/api/tickets/:ticketId",
  ...protect("Requester", "ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      const ticket = await getPrisma().ticket.findUniqueOrThrow({
        where: { id: access.ticketId },
        include: {
          requester: { select: { id: true, name: true, email: true } },
          ticketOwner: { select: { id: true, name: true, role: true } },
          category: { select: { id: true, name: true } },
          relatedSystem: { select: { id: true, name: true } },
          // BR-38 — removed attachments stay visible as metadata.
          attachments: { orderBy: { id: "asc" } },
        },
      });

      const terminal = isTerminal(ticket.currentStatus);
      const shared = {
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
        problemAppearsResolvedAt: ticket.problemAppearsResolvedAt,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        attachments: ticket.attachments.map(toAttachmentMetadata),
      };

      if (req.auth!.user.role === "Requester") {
        // BR-48 — eligible statuses for the resolution signal.
        const canReportProblemResolved =
          !terminal &&
          ticket.problemAppearsResolvedAt === null &&
          ["New", "Open", "InProgress", "WaitingForRequester", "Reopened"].includes(
            ticket.currentStatus,
          );

        return res.status(200).json({
          data: {
            ...shared,
            ticketOwner: ticket.ticketOwner ? { name: ticket.ticketOwner.name } : null,
            permissions: {
              canManageAttachments: !terminal,
              canAddPublicComment: !terminal,
              canReportProblemResolved,
            },
          },
        });
      }

      // Staff view (IT Staff or Administrator).
      return res.status(200).json({
        data: await loadStaffTicketDetail(access.ticketId, req.auth!.user),
      });
    } catch (err) {
      console.error("GET ticket detail failed:", err);
      return internalError(res, "Could not load the ticket. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// GET .../attachments — Attachment metadata (§10). Requester (own), IT
// Staff, Administrator (any).
// ---------------------------------------------------------------------------
attachmentsRouter.get(
  "/api/tickets/:ticketId/attachments",
  ...protect("Requester", "ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      const attachments = await getPrisma().attachment.findMany({
        where: { ticketId: access.ticketId },
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
// POST .../attachments — upload one Attachment (§9). Requester (own) only
// (matrix §5.1 "Attachment upload, soft removal": Own for Requester, No for
// IT Staff/Administrator).
// ---------------------------------------------------------------------------
attachmentsRouter.post(
  "/api/tickets/:ticketId/attachments",
  ...protect("Requester"),
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
        const access = await resolveTicketAccess(req, res);
        if (!access.ok) return;

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
          where: { ticketId: access.ticketId, removedAt: null },
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
              ticketId: access.ticketId,
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
// GET .../attachments/:attachmentId — download an active Attachment (§11).
// Requester (own), IT Staff, Administrator (any).
// ---------------------------------------------------------------------------
attachmentsRouter.get(
  "/api/tickets/:ticketId/attachments/:attachmentId",
  ...protect("Requester", "ITStaff", "Administrator"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      const attachmentId = parseId(req.params.attachmentId);
      if (attachmentId === null) {
        return fail(res, 404, "NOT_FOUND", "Attachment not found.");
      }

      const attachment = await getPrisma().attachment.findFirst({
        where: { id: attachmentId, ticketId: access.ticketId },
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
// DELETE .../attachments/:attachmentId — soft removal (§12). Requester (own)
// only.
// ---------------------------------------------------------------------------
attachmentsRouter.delete(
  "/api/tickets/:ticketId/attachments/:attachmentId",
  ...protect("Requester"),
  async (req: Request, res: Response) => {
    try {
      const access = await resolveTicketAccess(req, res);
      if (!access.ok) return;

      const attachmentId = parseId(req.params.attachmentId);
      if (attachmentId === null) {
        return fail(res, 404, "NOT_FOUND", "Attachment not found.");
      }

      const attachment = await getPrisma().attachment.findFirst({
        where: { id: attachmentId, ticketId: access.ticketId },
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
