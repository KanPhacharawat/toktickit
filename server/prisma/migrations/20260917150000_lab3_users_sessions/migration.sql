-- Lab 3 — Authentication foundation (specification.md §7.2, §7.3, §7.7).
--
-- Hand-written on purpose: Prisma's generated diff for a model rename drops
-- "DevelopmentRequester" and creates "User", which would delete every Lab 2
-- Requester and break Ticket ownership. Renaming in place keeps ids and the
-- Ticket foreign key intact (BR-57).

-- 1. Rename the Lab 2 Development Requester table and its constraints/indexes
--    to the names Prisma expects for the `User` model.
ALTER TABLE "DevelopmentRequester" RENAME TO "User";
ALTER TABLE "User" RENAME CONSTRAINT "DevelopmentRequester_pkey" TO "User_pkey";
ALTER INDEX "DevelopmentRequester_email_key" RENAME TO "User_email_key";
ALTER INDEX "DevelopmentRequester_isActive_idx" RENAME TO "User_isActive_idx";
ALTER INDEX "DevelopmentRequester_deletedAt_idx" RENAME TO "User_deletedAt_idx";
ALTER SEQUENCE "DevelopmentRequester_id_seq" RENAME TO "User_id_seq";

-- 2. Roles and credentials. Existing rows become Requesters with no password
--    and a pending password change (BR-57, BR-58).
CREATE TYPE "UserRole" AS ENUM ('Requester', 'ITStaff', 'Administrator');

ALTER TABLE "User"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'Requester',
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
  ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- 3. BR-11 — emails are compared trimmed and lower-cased from now on.
UPDATE "User" SET "email" = lower(trim("email"));

CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- 4. Server-side sessions (BR-17, BR-18).
CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The Ticket foreign key keeps its name ("Ticket_requesterId_fkey") and now
-- references "User" automatically, because the table was renamed, not replaced.
