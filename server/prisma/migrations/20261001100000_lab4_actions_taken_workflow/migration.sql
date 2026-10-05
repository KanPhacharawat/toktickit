-- Lab 4 — Actions Taken and Ticket Workflow (specification.md §7).
--
-- Additive only: no column is dropped, renamed, or narrowed, and no existing
-- row is deleted. Every new Ticket column is nullable or has a default, so
-- this migration is safe to run against a live Lab 3 database (AC-39).
-- The backfill at the end is idempotent-safe to read but not to re-run blind;
-- it only touches rows this migration itself just added columns to, and runs
-- once as part of `prisma migrate deploy`.

-- 1. Action Taken lifecycle (spec §7.1).
CREATE TYPE "ActionStatus" AS ENUM ('Planned', 'Completed', 'Cancelled');

-- 2. Ticket — workflow and concurrency columns (spec §7.1).
ALTER TABLE "Ticket"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "resolutionSummary" VARCHAR(2000),
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelReason" VARCHAR(500),
  ADD COLUMN "requesterResolvedIndicatedAt" TIMESTAMP(3);

CREATE INDEX "Ticket_requesterId_currentStatus_updatedAt_idx" ON "Ticket"("requesterId", "currentStatus", "updatedAt");
CREATE INDEX "Ticket_itPriority_currentStatus_idx" ON "Ticket"("itPriority", "currentStatus");

-- 3. Action Taken (spec §7.1, DD-01, DD-02, DD-03, DD-04).
CREATE TABLE "ActionTaken" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "actionAt" TIMESTAMP(3) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "result" VARCHAR(2000),
    "status" "ActionStatus" NOT NULL DEFAULT 'Planned',
    "performedById" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "updatedById" INTEGER,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" VARCHAR(1000),
    "attachmentNotes" VARCHAR(500),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" VARCHAR(500),
    "clientRequestId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActionTaken_ticketId_clientRequestId_key" ON "ActionTaken"("ticketId", "clientRequestId");
CREATE INDEX "ActionTaken_ticketId_actionAt_createdAt_id_idx" ON "ActionTaken"("ticketId", "actionAt", "createdAt", "id");
CREATE INDEX "ActionTaken_performedById_status_followUpRequired_idx" ON "ActionTaken"("performedById", "status", "followUpRequired");

ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_performedById_fkey"
  FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Ticket Status History — append-only (spec §7.1, DD-05).
CREATE TABLE "TicketStatusHistory" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "fromStatus" "TicketStatus",
    "toStatus" "TicketStatus" NOT NULL,
    "actorId" INTEGER NOT NULL,
    "reason" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TicketStatusHistory_ticketId_createdAt_idx" ON "TicketStatusHistory"("ticketId", "createdAt");

ALTER TABLE "TicketStatusHistory" ADD CONSTRAINT "TicketStatusHistory_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketStatusHistory" ADD CONSTRAINT "TicketStatusHistory_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Backfill (spec §7.3) — legacy Tickets that are already Resolved/Closed
-- get a resolvedAt/closedAt derived from their last update, and every
-- existing Ticket gets one initial status-history row so the history is
-- never missing a starting point. Legacy Tickets keep zero Actions Taken
-- (BR-47); they simply cannot pass the resolution gate until IT Staff
-- completes one.
UPDATE "Ticket"
SET "resolvedAt" = "updatedAt",
    "resolutionSummary" = 'Legacy ticket resolved before Lab 4'
WHERE "currentStatus" IN ('Resolved', 'Closed');

UPDATE "Ticket"
SET "closedAt" = "updatedAt"
WHERE "currentStatus" = 'Closed';

INSERT INTO "TicketStatusHistory" ("ticketId", "fromStatus", "toStatus", "actorId", "reason", "createdAt")
SELECT "id", NULL, "currentStatus", "requesterId", 'Backfill Lab 4', "updatedAt"
FROM "Ticket";
