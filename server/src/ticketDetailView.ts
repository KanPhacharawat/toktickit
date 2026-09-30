import { getPrisma } from "./prisma.js";
import { allowedStatusTransitions, isTerminal } from "./statusTransitions.js";
import { hasOperationalAuthority, type TicketAccess } from "./ticketAccess.js";

/** api-spec.md §3.4 — the attachment metadata shape. */
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

/**
 * api-spec.md §3.6 — StaffTicketDetail, re-loaded fresh after a mutation so
 * the response's `permissions`, `allowedStatusTransitions`, and
 * `expectedUpdatedAt` (via `updatedAt`) always reflect the new state.
 */
export async function loadStaffTicketDetail(
  ticketId: number,
  caller: { id: number; role: string },
) {
  const ticket = await getPrisma().ticket.findUniqueOrThrow({
    where: { id: ticketId },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      ticketOwner: { select: { id: true, name: true, role: true } },
      category: { select: { id: true, name: true } },
      relatedSystem: { select: { id: true, name: true } },
      attachments: { orderBy: { id: "asc" } },
    },
  });

  const access: TicketAccess = {
    ok: true,
    ticketId: ticket.id,
    requesterId: ticket.requesterId,
    ticketOwnerId: ticket.ticketOwnerId,
    currentStatus: ticket.currentStatus,
    itPriority: ticket.itPriority,
    problemAppearsResolvedAt: ticket.problemAppearsResolvedAt,
    updatedAt: ticket.updatedAt,
  };

  const terminal = isTerminal(ticket.currentStatus);
  const hasAuthority = hasOperationalAuthority(access, caller);
  const hasOwner = ticket.ticketOwnerId !== null;

  return {
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
    itPriority: ticket.itPriority,
    ticketOwner: ticket.ticketOwner,
    allowedStatusTransitions: allowedStatusTransitions(ticket.currentStatus, hasOwner, hasAuthority),
    permissions: {
      canClaim: !hasOwner && !terminal,
      canAssign: !hasOwner && !terminal,
      canReassign: hasOwner && hasAuthority && !terminal,
      canChangeItPriority: hasAuthority && !terminal,
      canChangeStatus: hasAuthority && !terminal,
      canAddPublicComment: !terminal,
      canAddInternalNote: true,
      canManageAttachments: false,
    },
  };
}
