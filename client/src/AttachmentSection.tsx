import { useRef, useState } from "react";
import {
  ApiError,
  attachmentDownloadUrl,
  removeAttachment,
  uploadAttachment,
  type AttachmentMetadata,
} from "./api.js";
import {
  ALLOWED_EXTENSIONS,
  MAX_ACTIVE_ATTACHMENTS,
  formatFileSize,
  selectAttachments,
  type RejectedAttachment,
} from "./attachmentRules.js";

/** Short label for the file type shown beside each attachment. */
function typeLabel(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "JPEG image",
    "image/png": "PNG image",
    "image/webp": "WEBP image",
    "application/pdf": "PDF document",
  };
  return map[mimeType] ?? mimeType;
}

export default function AttachmentSection({
  requesterId,
  ticketId,
  attachments,
  onChanged,
}: {
  requesterId: number;
  ticketId: number;
  attachments: AttachmentMetadata[];
  /** Called after a successful upload or removal so the parent can refresh. */
  onChanged: () => void | Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [rejected, setRejected] = useState<RejectedAttachment[]>([]);

  // Removal is a confirmation flow: the user must supply a reason (BR-35).
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [removalReason, setRemovalReason] = useState("");
  const [removalError, setRemovalError] = useState("");
  const [removalPending, setRemovalPending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const active = attachments.filter((a) => a.removedAt === null);
  const atLimit = active.length >= MAX_ACTIVE_ATTACHMENTS;

  async function handleFilesPicked(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    setUploadError("");

    // Client-side rules first, so obvious problems never reach the network.
    const alreadySelected = active.map((a) => ({
      file: new File([], a.originalFilename),
      name: a.originalFilename,
      size: a.fileSize,
      type: a.mimeType,
    }));
    const { accepted, rejected: refused } = selectAttachments(
      Array.from(fileList),
      alreadySelected,
    );
    setRejected(refused);

    if (fileInputRef.current) fileInputRef.current.value = "";
    if (accepted.length === 0) return;

    setUploading(true);
    // One file's failure must not cancel the others: each is attempted, and
    // every failure is reported by name.
    const failures: string[] = [];
    try {
      // Sequential, so the five-attachment limit is enforced per file rather
      // than raced past.
      for (const candidate of accepted) {
        try {
          await uploadAttachment(requesterId, ticketId, candidate.file);
        } catch (err) {
          failures.push(
            `${candidate.name}: ${
              err instanceof ApiError
                ? err.message
                : "Upload failed. Please try again."
            }`,
          );
        }
      }

      if (failures.length > 0) setUploadError(failures.join(" "));
    } finally {
      // BR-34 — a failed upload never affects the ticket; refresh either way
      // so the files that did succeed are shown.
      await onChanged();
      setUploading(false);
    }
  }

  function startRemoval(id: number) {
    setRemovingId(id);
    setRemovalReason("");
    setRemovalError("");
  }

  async function confirmRemoval(event: React.FormEvent) {
    event.preventDefault();
    if (removingId === null || removalPending) return;

    // BR-35 — the reason is mandatory; the button stays available so the
    // message is reachable by keyboard.
    if (removalReason.trim().length === 0) {
      setRemovalError("A removal reason is required.");
      return;
    }

    setRemovalPending(true);
    setRemovalError("");
    try {
      await removeAttachment(
        requesterId,
        ticketId,
        removingId,
        removalReason.trim(),
      );
      setRemovingId(null);
      setRemovalReason("");
      await onChanged();
    } catch (err) {
      setRemovalError(
        err instanceof ApiError
          ? err.message
          : "Could not remove the attachment. Please try again.",
      );
    } finally {
      setRemovalPending(false);
    }
  }

  return (
    <section className="zen-card p-4 mt-3" aria-label="Attachments">
      <h2 className="zen-title h5 mb-1">Attachments</h2>
      <p className="text-secondary small">
        JPG, JPEG, PNG, WEBP, or PDF. Up to 5 MB each, at most{" "}
        {MAX_ACTIVE_ATTACHMENTS} active files.
      </p>

      <label className="form-label fw-semibold" htmlFor="attachment-upload">
        Add an attachment
      </label>
      <input
        ref={fileInputRef}
        id="attachment-upload"
        type="file"
        multiple
        className="form-control zen-input"
        accept={ALLOWED_EXTENSIONS.join(",")}
        onChange={(e) => handleFilesPicked(e.target.files)}
        disabled={uploading || atLimit}
      />

      {atLimit && (
        <p className="text-secondary small mt-1 mb-0">
          Attachment limit reached. Remove a file to add another.
        </p>
      )}

      {uploading && (
        <p className="text-secondary small mt-2 mb-0" role="status">
          <span
            className="spinner-border spinner-border-sm me-2"
            aria-hidden="true"
          />
          Uploading…
        </p>
      )}

      {rejected.length > 0 && (
        <ul className="list-unstyled mt-2 mb-0" role="alert">
          {rejected.map((item) => (
            <li
              key={`${item.name}-${item.reason}`}
              className="zen-error-text small"
            >
              {item.name}: {item.reason}
            </li>
          ))}
        </ul>
      )}

      {uploadError && (
        <div className="alert zen-error-banner mt-3 mb-0" role="alert">
          <strong>Attachment upload failed.</strong>
          <p className="mb-0 mt-1 small">{uploadError}</p>
        </div>
      )}

      {attachments.length === 0 ? (
        <p className="text-secondary mt-3 mb-0" data-testid="no-attachments">
          No attachments yet.
        </p>
      ) : (
        <ul className="list-group mt-3" data-testid="attachment-list">
          {attachments.map((attachment) => {
            const isRemoved = attachment.removedAt !== null;
            return (
              <li
                key={attachment.id}
                className={`list-group-item${isRemoved ? " zen-attachment-removed" : ""}`}
                data-testid={isRemoved ? "removed-attachment" : "active-attachment"}
              >
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <span
                    className="fw-semibold text-break me-auto"
                    data-testid="attachment-name"
                  >
                    {attachment.originalFilename}
                  </span>

                  {/* BR-38 — removed files stay identifiable as removed. */}
                  {isRemoved && (
                    <span className="zen-badge zen-removed-badge">Removed</span>
                  )}

                  {/* BR-37 — no download or preview action for a removed
                      attachment; the link is not rendered at all. */}
                  {!isRemoved && (
                    <>
                      <a
                        className="btn btn-sm zen-btn-outline"
                        href={attachmentDownloadUrl(
                          requesterId,
                          ticketId,
                          attachment.id,
                        )}
                        download={attachment.originalFilename}
                      >
                        Download
                        <span className="visually-hidden">
                          {` ${attachment.originalFilename}`}
                        </span>
                      </a>
                      <button
                        type="button"
                        className="btn btn-sm zen-btn-outline"
                        onClick={() => startRemoval(attachment.id)}
                      >
                        Remove
                        <span className="visually-hidden">
                          {` ${attachment.originalFilename}`}
                        </span>
                      </button>
                    </>
                  )}
                </div>

                <p className="text-secondary small mb-0 mt-1">
                  {typeLabel(attachment.mimeType)} ·{" "}
                  {formatFileSize(attachment.fileSize)} · Uploaded{" "}
                  {new Date(attachment.uploadedAt).toLocaleString()}
                </p>

                {isRemoved && (
                  <p className="text-secondary small mb-0">
                    {`Removed ${new Date(attachment.removedAt!).toLocaleString()}`}
                    {attachment.removalReason
                      ? ` · Reason: ${attachment.removalReason}`
                      : ""}
                  </p>
                )}

                {/* Confirmation UI with the mandatory reason (BR-35). */}
                {removingId === attachment.id && (
                  <form className="zen-removal-form mt-3" onSubmit={confirmRemoval}>
                    <label
                      className="form-label fw-semibold"
                      htmlFor={`removal-reason-${attachment.id}`}
                    >
                      Reason for removing this attachment
                      <span className="zen-required" aria-hidden="true">
                        {" *"}
                      </span>
                      <span className="visually-hidden"> (required)</span>
                    </label>
                    <input
                      id={`removal-reason-${attachment.id}`}
                      className={`form-control zen-input${removalError ? " zen-invalid" : ""}`}
                      value={removalReason}
                      onChange={(e) => setRemovalReason(e.target.value)}
                      aria-invalid={removalError ? true : undefined}
                      aria-describedby={
                        removalError ? `removal-error-${attachment.id}` : undefined
                      }
                    />
                    {removalError && (
                      <p
                        className="zen-error-text small mt-1 mb-0"
                        id={`removal-error-${attachment.id}`}
                      >
                        {removalError}
                      </p>
                    )}

                    <div className="d-flex flex-wrap gap-2 mt-2">
                      <button
                        type="submit"
                        className="btn btn-sm zen-btn-primary"
                        disabled={removalPending}
                        aria-busy={removalPending}
                      >
                        {removalPending ? "Removing…" : "Confirm removal"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm zen-btn-outline"
                        onClick={() => setRemovingId(null)}
                        disabled={removalPending}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
