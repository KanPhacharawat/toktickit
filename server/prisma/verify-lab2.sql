-- Manual verification of the Lab 2 database Definition of Done.
-- Run with:
--   psql -h localhost -U toktickit -d toktickit -f prisma/verify-lab2.sql
--
-- Read-only apart from section 8, which creates rows inside a transaction
-- and rolls them back, so the database is left untouched.

\echo ''
\echo '### 1. Models exist (expect Attachment, Category, DevelopmentRequester, RelatedSystem, Ticket)'
\dt

\echo ''
\echo '### 2. Primary keys (expect one per model)'
SELECT table_name, constraint_name
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND constraint_type = 'PRIMARY KEY'
  AND table_name IN ('Ticket','Attachment','Category','RelatedSystem','DevelopmentRequester')
ORDER BY table_name;

\echo ''
\echo '### 3. Foreign keys (expect Ticket->requester/category/relatedSystem, Attachment->ticket)'
SELECT tc.table_name       AS child_table,
       kcu.column_name     AS fk_column,
       ccu.table_name      AS parent_table,
       rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, kcu.column_name;

\echo ''
\echo '### 4. Unique constraints (Prisma creates these as unique indexes)'
SELECT t.relname AS table_name, i.relname AS index_name
FROM pg_index x
JOIN pg_class i ON i.oid = x.indexrelid
JOIN pg_class t ON t.oid = x.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND x.indisunique
  AND NOT x.indisprimary
ORDER BY t.relname, i.relname;

\echo ''
\echo '### 5. Indexes'
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('Ticket','Attachment','Category','RelatedSystem','DevelopmentRequester')
ORDER BY tablename, indexname;

\echo ''
\echo '### 6. Enums (expect RequestedPriority and TicketStatus with their values)'
SELECT t.typname AS enum_name, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS values
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
GROUP BY t.typname
ORDER BY t.typname;

\echo ''
\echo '### 7. Timestamp and soft-removal columns per model'
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('createdAt','updatedAt','deletedAt','removedAt','removalReason','uploadedAt','ticketDate')
ORDER BY table_name, column_name;

\echo ''
\echo '### 8. Seed data counts'
\echo '--- expect: 4 categories, >=6 related systems, >=4 active requesters'
SELECT (SELECT count(*) FROM "Category"  WHERE "isActive") AS active_categories,
       (SELECT count(*) FROM "RelatedSystem" WHERE "isActive") AS active_systems,
       (SELECT count(*) FROM "DevelopmentRequester" WHERE "isActive") AS active_requesters,
       (SELECT count(*) FROM "DevelopmentRequester" WHERE NOT "isActive") AS inactive_requesters;

\echo ''
\echo '--- the four required categories'
SELECT id, name, "isActive" FROM "Category" ORDER BY "sortOrder", id;

\echo ''
\echo '--- the related systems'
SELECT id, name, "isActive" FROM "RelatedSystem" ORDER BY "sortOrder", id;

\echo ''
\echo '--- the development requesters'
SELECT id, name, email, "isActive" FROM "DevelopmentRequester" ORDER BY id;

\echo ''
\echo '### 9. Behaviour checks (rolled back, nothing is persisted)'
BEGIN;

\echo ''
\echo '--- 9a. One requester owns many tickets; one ticket has many attachments'
INSERT INTO "Ticket" ("ticketNumber","ticketDate","requesterId","categoryId","relatedSystemId",
                      "summary","description","requestedPriority","updatedAt")
SELECT 'VERIFY-0001', now(), r.id, c.id, s.id,
       'First verification ticket',
       'Created by prisma/verify-lab2.sql to prove the relationships.',
       'MEDIUM', now()
FROM "DevelopmentRequester" r, "Category" c, "RelatedSystem" s
WHERE r.email = 'requester-a@example.com' AND c.name = 'Hardware' AND s.name = 'Corporate Laptop';

INSERT INTO "Ticket" ("ticketNumber","ticketDate","requesterId","categoryId","relatedSystemId",
                      "summary","description","requestedPriority","updatedAt")
SELECT 'VERIFY-0002', now(), r.id, c.id, s.id,
       'Second verification ticket',
       'Proves that one requester can own more than one ticket.',
       'HIGH', now()
FROM "DevelopmentRequester" r, "Category" c, "RelatedSystem" s
WHERE r.email = 'requester-a@example.com' AND c.name = 'Software' AND s.name = 'VPN';

INSERT INTO "Attachment" ("ticketId","originalFilename","storageKey","mimeType","fileSize","updatedAt")
SELECT t.id, 'screenshot.png', 'verify/screenshot.png', 'image/png', 182034, now()
FROM "Ticket" t WHERE t."ticketNumber" = 'VERIFY-0001';

INSERT INTO "Attachment" ("ticketId","originalFilename","storageKey","mimeType","fileSize","updatedAt")
SELECT t.id, 'report.pdf', 'verify/report.pdf', 'application/pdf', 40211, now()
FROM "Ticket" t WHERE t."ticketNumber" = 'VERIFY-0001';

\echo '--- expect requester-a with 2 tickets, and VERIFY-0001 with 2 attachments'
SELECT r.name AS requester, count(DISTINCT t.id) AS tickets, count(a.id) AS attachments
FROM "DevelopmentRequester" r
JOIN "Ticket" t ON t."requesterId" = r.id AND t."ticketNumber" LIKE 'VERIFY-%'
LEFT JOIN "Attachment" a ON a."ticketId" = t.id
GROUP BY r.name;

\echo ''
\echo '--- 9b. Backend defaults: currentStatus = New, ticketDate set by the database'
SELECT "ticketNumber", "currentStatus", "ticketDate" IS NOT NULL AS has_ticket_date
FROM "Ticket" WHERE "ticketNumber" LIKE 'VERIFY-%' ORDER BY "ticketNumber";

\echo ''
\echo '--- 9c. Ticket joins to its category and related system'
SELECT t."ticketNumber", r.name AS requester, c.name AS category, s.name AS related_system
FROM "Ticket" t
JOIN "DevelopmentRequester" r ON r.id = t."requesterId"
JOIN "Category" c ON c.id = t."categoryId"
JOIN "RelatedSystem" s ON s.id = t."relatedSystemId"
WHERE t."ticketNumber" LIKE 'VERIFY-%' ORDER BY t."ticketNumber";

\echo ''
\echo '--- 9d. Attachment soft removal: metadata survives, active count drops'
UPDATE "Attachment"
SET "removedAt" = now(), "removalReason" = 'Duplicate screenshot'
WHERE "storageKey" = 'verify/screenshot.png';

SELECT "originalFilename",
       "removedAt" IS NOT NULL AS is_removed,
       "removalReason"
FROM "Attachment" WHERE "storageKey" LIKE 'verify/%' ORDER BY "originalFilename";

\echo '--- expect active_attachments = 1, total_metadata_rows = 2'
SELECT count(*) FILTER (WHERE "removedAt" IS NULL) AS active_attachments,
       count(*)                                    AS total_metadata_rows
FROM "Attachment" a
JOIN "Ticket" t ON t.id = a."ticketId"
WHERE t."ticketNumber" = 'VERIFY-0001';

ROLLBACK;

\echo ''
\echo '### 10. Verify the rollback left nothing behind (expect 0 and 0)'
SELECT (SELECT count(*) FROM "Ticket"     WHERE "ticketNumber" LIKE 'VERIFY-%') AS leftover_tickets,
       (SELECT count(*) FROM "Attachment" WHERE "storageKey"   LIKE 'verify/%') AS leftover_attachments;
