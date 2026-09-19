// Shared content processing for Public Comments and Internal Notes
// (api-spec.md §10.2, BR-45).

export const THREAD_BODY_MAX = 2000;

export interface ThreadContentResult {
  /** Present only when the body passed every rule. */
  body?: string;
  error?: string;
}

/**
 * BR-45 — CRLF is normalized to LF, control characters other than newline and
 * tab are stripped, the result is trimmed, and the trimmed body must be
 * 1–2000 characters. Content is stored and rendered as plain text only.
 */
export function normalizeThreadBody(
  raw: unknown,
  label: "Comment" | "Note",
): ThreadContentResult {
  if (typeof raw !== "string") {
    return { error: `${label} is required.` };
  }

  const normalized = raw
    .replace(/\r\n/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  const trimmed = normalized.trim();

  if (trimmed.length === 0) {
    return { error: `${label} is required.` };
  }
  if (trimmed.length > THREAD_BODY_MAX) {
    return { error: `${label} must be ${THREAD_BODY_MAX} characters or fewer.` };
  }

  return { body: trimmed };
}
