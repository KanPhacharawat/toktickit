import { z } from "zod";

// Actions Taken request validation (api-spec.md §2, specification.md §5.1
// BR-06..BR-15). Zod schemas validate shape and length; cross-field and
// database-dependent rules (performedById is an active IT Staff/Administrator,
// actionAt relative to the Ticket's createdAt) are checked by the route after
// the schema passes, since they need data the schema alone cannot see.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** BR-15 — the create idempotency key. */
export const clientRequestIdSchema = z
  .string()
  .trim()
  .min(1, "A clientRequestId is required.")
  .refine((v) => UUID_RE.test(v), "clientRequestId must be a UUID.");

/** BR-07 — 1-2000 characters after trim. */
export const descriptionSchema = z
  .string()
  .trim()
  .min(1, "Description is required.")
  .max(2000, "Description must be 2000 characters or fewer.");

/** BR-08 — 1-2000 characters after trim, only required when Completed. */
export const resultSchema = z
  .string()
  .trim()
  .min(1, "Result is required.")
  .max(2000, "Result must be 2000 characters or fewer.");

/** BR-09 — 1-1000 characters after trim, only required when followUpRequired. */
export const followUpNoteSchema = z
  .string()
  .trim()
  .min(1, "Follow-up note is required when follow-up is needed.")
  .max(1000, "Follow-up note must be 1000 characters or fewer.");

/** BR-10 — optional free text, never a file path. */
export const attachmentNotesSchema = z
  .string()
  .trim()
  .max(500, "Attachment notes must be 500 characters or fewer.");

/** BR-12 — required, 1-500 characters, when cancelling. */
export const cancelReasonSchema = z
  .string()
  .trim()
  .min(1, "A cancellation reason is required.")
  .max(500, "Cancellation reason must be 500 characters or fewer.");

const performedByIdSchema = z
  .number()
  .int("performedById must be a whole number.")
  .positive("performedById must be a valid user id.");

const versionSchema = z
  .number()
  .int("version must be a whole number.")
  .positive("version is required.");

/** api-spec.md §2.2 — POST /api/tickets/:ticketId/actions. */
export const createActionSchema = z
  .object({
    clientRequestId: clientRequestIdSchema,
    actionAt: z.coerce.date({ error: "A valid action date/time is required." }),
    description: descriptionSchema,
    status: z.enum(["Planned", "Completed"]).default("Completed"),
    result: resultSchema.optional(),
    performedById: performedByIdSchema.optional(),
    followUpRequired: z.boolean().default(false),
    followUpNote: followUpNoteSchema.optional(),
    attachmentNotes: attachmentNotesSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === "Completed" && !data.result) {
      ctx.addIssue({ code: "custom", path: ["result"], message: "Result is required when the action is Completed." });
    }
    if (data.followUpRequired && !data.followUpNote) {
      ctx.addIssue({
        code: "custom",
        path: ["followUpNote"],
        message: "Follow-up note is required when follow-up is needed.",
      });
    }
  });

export type CreateActionInput = z.infer<typeof createActionSchema>;

/** api-spec.md §2.3 — PATCH .../actions/:actionId. Every field optional; version required. */
export const editActionSchema = z.object({
  version: versionSchema,
  actionAt: z.coerce.date({ error: "A valid action date/time is required." }).optional(),
  description: descriptionSchema.optional(),
  result: resultSchema.optional(),
  performedById: performedByIdSchema.optional(),
  followUpRequired: z.boolean().optional(),
  followUpNote: followUpNoteSchema.optional(),
  attachmentNotes: attachmentNotesSchema.optional(),
});

export type EditActionInput = z.infer<typeof editActionSchema>;

/** api-spec.md §2.4 — POST .../complete. */
export const completeActionSchema = z.object({
  version: versionSchema,
  result: resultSchema,
  followUpRequired: z.boolean().default(false),
  followUpNote: followUpNoteSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.followUpRequired && !data.followUpNote) {
    ctx.addIssue({
      code: "custom",
      path: ["followUpNote"],
      message: "Follow-up note is required when follow-up is needed.",
    });
  }
});

export type CompleteActionInput = z.infer<typeof completeActionSchema>;

/** api-spec.md §2.5 — POST .../cancel. */
export const cancelActionSchema = z.object({
  version: versionSchema,
  reason: cancelReasonSchema,
});

export type CancelActionInput = z.infer<typeof cancelActionSchema>;

/** Maps a ZodError to the api-spec.md §1.1 `details` array / fieldErrors shape. */
export function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.length > 0 ? String(issue.path[0]) : "body";
    if (!(field in fieldErrors)) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

/** BR-06 — actionAt must be within 5 minutes of the future and not before the Ticket's createdAt. */
export function validateActionAtBounds(
  actionAt: Date,
  ticketCreatedAt: Date,
): string | null {
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
  if (Number.isNaN(actionAt.getTime())) return "A valid action date/time is required.";
  if (actionAt.getTime() > fiveMinutesFromNow) {
    return "Action date/time cannot be more than 5 minutes in the future.";
  }
  if (actionAt.getTime() < ticketCreatedAt.getTime()) {
    return "Action date/time cannot be before the ticket was created.";
  }
  return null;
}
