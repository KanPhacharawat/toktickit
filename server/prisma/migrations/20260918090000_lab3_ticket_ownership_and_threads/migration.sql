-- Lab 3 — Requester Regression (specification.md §7.1, §7.4–§7.7).
--
-- Hand-written on purpose: a generated diff for the TicketStatus rename would
-- drop and recreate the enum (and the column that depends on it), which is
-- unsafe for existing rows. Renaming/adding values in place preserves data.

-- 1. TicketStatus — rename OnHold, add Open and Reopened (spec §7.1, §7.7).
ALTER TYPE "TicketStatus" RENAME VALUE 'OnHold' TO 'WaitingForRequester';
ALTER TYPE "TicketStatus" ADD VALUE 'Open';
ALTER TYPE "TicketStatus" ADD VALUE 'Reopened';

-- 2. IT Priority — separate from Requested Priority (BR-37).
CREATE TYPE "ItPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- 3. Ticket — ownership, IT Priority, and the resolution signal.
ALTER TABLE "Ticket" ADD COLUMN "ticketOwnerId" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN "itPriority" "ItPriority";
ALTER TABLE "Ticket" ADD COLUMN "problemAppearsResolvedAt" TIMESTAMP(3);

-- Backfill existing rows: IT Priority starts as a copy of Requested Priority.
UPDATE "Ticket" SET "itPriority" = "requestedPriority"::text::"ItPriority";

ALTER TABLE "Ticket" ALTER COLUMN "itPriority" SET NOT NULL;

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ticketOwnerId_fkey"
  FOREIGN KEY ("ticketOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Ticket_ticketOwnerId_idx" ON "Ticket"("ticketOwnerId");
CREATE INDEX "Ticket_itPriority_idx" ON "Ticket"("itPriority");
CREATE INDEX "Ticket_currentStatus_ticketDate_idx" ON "Ticket"("currentStatus", "ticketDate");
CREATE INDEX "Ticket_ticketOwnerId_currentStatus_idx" ON "Ticket"("ticketOwnerId", "currentStatus");

-- 4. Public Comments and Internal Notes — separate, identically-shaped tables
--    (spec §7.5) so a filtering mistake can never expose a note publicly.
CREATE TABLE "PublicComment" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InternalNote" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PublicComment_ticketId_createdAt_idx" ON "PublicComment"("ticketId", "createdAt");
CREATE INDEX "InternalNote_ticketId_createdAt_idx" ON "InternalNote"("ticketId", "createdAt");

ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
