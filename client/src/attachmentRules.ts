// Attachment selection rules — BR-29, BR-30, BR-31.
//
// These run when the user picks files on Create Ticket. The backend re-checks
// them on upload; this layer exists to give immediate feedback.

/** BR-29 — permitted types. */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

/** Shown in the file picker and in the help text. */
export const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

/** BR-30 — 5 MB per file. */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** BR-31 — at most five active attachments per ticket. */
export const MAX_ACTIVE_ATTACHMENTS = 5;

export interface SelectedAttachment {
  file: File;
  name: string;
  size: number;
  type: string;
}

export interface RejectedAttachment {
  name: string;
  reason: string;
}

export interface AttachmentSelectionResult {
  accepted: SelectedAttachment[];
  rejected: RejectedAttachment[];
}

/** Human-readable size for the attachment list. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Some browsers report an empty `type` for a known extension, so fall back to
 * the extension rather than rejecting a permitted file.
 */
function isAllowedType(file: File): boolean {
  if ((ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return true;
  }
  return file.type === "" && hasAllowedExtension(file.name);
}

/**
 * Filters a newly picked set of files against the rules, given what is already
 * staged. Returns both the accepted files and a reason for each rejection so
 * the UI can explain exactly what happened (ui-spec.md §8).
 */
export function selectAttachments(
  incoming: File[],
  alreadySelected: SelectedAttachment[] = [],
): AttachmentSelectionResult {
  const accepted: SelectedAttachment[] = [];
  const rejected: RejectedAttachment[] = [];

  let slotsLeft = MAX_ACTIVE_ATTACHMENTS - alreadySelected.length;
  const takenNames = new Set(alreadySelected.map((a) => a.name));

  for (const file of incoming) {
    if (!isAllowedType(file)) {
      rejected.push({
        name: file.name,
        reason: "Only JPG, JPEG, PNG, WEBP, and PDF files are allowed.",
      });
      continue;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      rejected.push({
        name: file.name,
        reason: `Each file must be ${formatFileSize(MAX_FILE_SIZE_BYTES)} or smaller.`,
      });
      continue;
    }

    if (file.size === 0) {
      rejected.push({ name: file.name, reason: "The file is empty." });
      continue;
    }

    if (takenNames.has(file.name)) {
      rejected.push({
        name: file.name,
        reason: "This file has already been selected.",
      });
      continue;
    }

    if (slotsLeft <= 0) {
      rejected.push({
        name: file.name,
        reason: `A ticket may have at most ${MAX_ACTIVE_ATTACHMENTS} attachments.`,
      });
      continue;
    }

    accepted.push({
      file,
      name: file.name,
      size: file.size,
      type: file.type,
    });
    takenNames.add(file.name);
    slotsLeft -= 1;
  }

  return { accepted, rejected };
}
