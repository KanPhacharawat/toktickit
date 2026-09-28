-- Rollback for 20261001100000_lab4_actions_taken_workflow.
--
-- Not run automatically by Prisma (Prisma has no down-migrations); run by
-- hand only, and only after taking a backup (see README "Rollback" section).
-- Drops exactly what the migration added and nothing else: the two new
-- tables, the new Ticket columns, the two new Ticket indexes, and the
-- ActionStatus enum. Every Lab 1–3 table, column, and row is untouched.
--
-- Usage:
--   pg_dump -h <host> -U <user> -d <db> -f backup-before-rollback.sql
--   psql   -h <host> -U <user> -d <db> -f rollback.sql
--
-- After rolling back, `prisma migrate resolve --rolled-back
-- 20261001100000_lab4_actions_taken_workflow` tells Prisma's migration
-- history the migration is no longer applied, so `prisma migrate deploy`
-- can re-apply it cleanly.

BEGIN;

DROP TABLE IF EXISTS "TicketStatusHistory";
DROP TABLE IF EXISTS "ActionTaken";

DROP INDEX IF EXISTS "Ticket_requesterId_currentStatus_updatedAt_idx";
DROP INDEX IF EXISTS "Ticket_itPriority_currentStatus_idx";

ALTER TABLE "Ticket"
  DROP COLUMN IF EXISTS "version",
  DROP COLUMN IF EXISTS "resolutionSummary",
  DROP COLUMN IF EXISTS "resolvedAt",
  DROP COLUMN IF EXISTS "closedAt",
  DROP COLUMN IF EXISTS "cancelledAt",
  DROP COLUMN IF EXISTS "cancelReason",
  DROP COLUMN IF EXISTS "requesterResolvedIndicatedAt";

DROP TYPE IF EXISTS "ActionStatus";

COMMIT;
