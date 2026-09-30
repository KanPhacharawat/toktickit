import { z } from "zod";
import { TICKET_STATUSES } from "./ticketListQuery.js";

// api-spec.md §3.2 — POST /api/tickets/:ticketId/status request validation.

const versionSchema = z
  .number()
  .int("version must be a whole number.")
  .positive("version is required.");

/** BR-23 — 1-500 chars; also doubles as the resolution summary (1-2000) or reopen reason. */
const reasonSchema = z
  .string()
  .trim()
  .min(1, "A reason is required for this transition.")
  .max(2000, "Reason must be 2000 characters or fewer.");

export const postStatusSchema = z.object({
  version: versionSchema,
  toStatus: z.enum(TICKET_STATUSES, { error: "Select a valid status." }),
  reason: reasonSchema.optional(),
  followUpAcknowledged: z.boolean().default(false),
});

export type PostStatusInput = z.infer<typeof postStatusSchema>;

/** Maps a ZodError to the api-spec.md §1.1 `details` array / fieldErrors shape. */
export function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.length > 0 ? String(issue.path[0]) : "body";
    if (!(field in fieldErrors)) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}
