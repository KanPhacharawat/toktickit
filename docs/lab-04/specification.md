# Lab 4 Specification — TokTickIT Actions Taken, Dashboards, and Final Regression

> Location in repo: `docs/lab-04/specification.md`
> Related: [`ui-spec.md`](./ui-spec.md) · [`api-spec.md`](./api-spec.md) · [`tests.md`](./tests.md)
> Status: Draft v1.0 — must be merged to `lab4-staging` before implementation PRs are merged.

---

## 1. Sprint Goal

Sprint 4 completes the TokTickIT service-desk workflow. IT Staff can record the real work done on a Ticket as a list of **Actions Taken**, the Ticket lifecycle is enforced end-to-end by the backend (including a **resolution gate**), and every role gets a concise **dashboard** that links into the detailed screens. The whole application built in Labs 1–3 is regression-tested, hardened, and polished under the Zen Green design language so it is ready for final demonstration.

## 2. Stakeholder Request (interpretation)

The service desk can already receive Tickets and let IT Staff talk to Requesters, but there is no record of _what work was actually done_. The stakeholder wants:

- a timeline of Actions Taken under each Ticket, written by whichever IT Staff member did the work (not necessarily the Ticket Owner);
- the Ticket Owner to stay responsible for coordinating the Ticket as a whole;
- Requesters to be able to say "this looks fixed", but only IT Staff can formally resolve the Ticket;
- short, useful dashboards for Requesters and IT Staff that link to the existing detailed screens instead of replacing them;
- a final polish pass so all earlier features keep working consistently.

## 3. Scope

### 3.1 Included

| Area            | Included work                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Actions Taken   | Model, migration, list/create/edit/complete/cancel on Ticket Detail, role rules, validation, concurrency                            |
| Ticket workflow | Final status-transition matrix, resolution gate, Requester "appears resolved" indication, append-only status history                |
| Dashboards      | Requester Dashboard, IT Staff Dashboard, Administrator Dashboard (reuses IT Staff + user counts)                                    |
| Data            | Prisma migration, backfill for legacy Tickets, idempotent seed                                                                      |
| API             | Actions Taken endpoints, workflow endpoint, dashboard endpoints, health endpoint; all Lab 2–3 APIs preserved                        |
| Hardening       | Regression of Labs 1–3, safe errors, duplicate-submit protection, form data preservation, accessibility, responsive layout, cleanup |

### 3.2 Explicitly excluded

- Automatic SLA clocks, escalation engines, on-call scheduling, breach notifications.
- Email, SMS, LINE, push, or other external notifications.
- Inventory, spare parts, purchasing, cost accounting.
- Timesheet billing, payroll, labor-cost calculation.
- Multi-level approval workflows, electronic signatures.
- BI tools, custom report builders, export warehouses, charts beyond simple count cards.
- Multi-tenant organizations, production-scale cloud operations.
- Any feature not listed in this specification.

## 4. Functional Requirements

### 4.1 Actions Taken

| ID    | Requirement                                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01 | IT Staff and Administrators can view the list of Actions Taken on any Ticket they can access.                                                                                   |
| FR-02 | Requesters can view Actions Taken (read-only) on Tickets they own. Requesters never see Internal Notes.                                                                         |
| FR-03 | IT Staff and Administrators can create an Action Taken on an accessible Ticket that is not Closed or Cancelled.                                                                 |
| FR-04 | An Action Taken contains: Action Date/Time, Action Description, Result, Performed By, Follow-Up Required, Follow-Up Note, Attachment Notes, Status, audit timestamps.           |
| FR-05 | `createdBy` is set automatically from the authenticated user. `performedBy` defaults to the authenticated user and may be changed to another **active** IT Staff/Administrator. |
| FR-06 | IT Staff can edit an Action Taken while its status is `Planned` or `Completed` and the Ticket is not Closed/Cancelled.                                                          |
| FR-07 | IT Staff can mark a `Planned` Action Taken as `Completed` (Result becomes required).                                                                                            |
| FR-08 | IT Staff can cancel an Action Taken (`Cancelled`) with a reason. Actions Taken are never physically deleted (append-only).                                                      |
| FR-09 | Actions Taken are listed in stable order: `actionAt` ascending, then `createdAt`, then `id`.                                                                                    |
| FR-10 | Multiple different IT Staff may record Actions Taken on the same Ticket.                                                                                                        |

### 4.2 Ticket Workflow

| ID    | Requirement                                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------- |
| FR-11 | Ticket status controls show only transitions permitted for the current role and current status (see §5.3).     |
| FR-12 | The backend validates every status change against the transition matrix regardless of the client.              |
| FR-13 | Changing to `Resolved` requires passing the resolution gate (BR-20) and a Resolution Summary.                  |
| FR-14 | A Requester can mark "Problem appears resolved" on an owned Ticket; this is advisory and never changes status. |
| FR-15 | Every status change is appended to an immutable Ticket Status History (from, to, actor, time, reason).         |
| FR-16 | After a successful status change the Ticket summary header (status badge, owner, timestamps) refreshes.        |

### 4.3 Dashboards

| ID    | Requirement                                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| FR-17 | After login, Requesters land on the Requester Dashboard; IT Staff and Administrators land on the IT Staff Dashboard.                      |
| FR-18 | The Requester Dashboard shows metrics and recent Tickets for the authenticated Requester only.                                            |
| FR-19 | The IT Staff Dashboard shows queue metrics, "My Assigned", unassigned, by-priority counts, recent/urgent Tickets, and my open follow-ups. |
| FR-20 | The Administrator Dashboard reuses the IT Staff Dashboard and adds user-account counts.                                                   |
| FR-21 | Every metric card is a link/button that drills down to a filtered Ticket list (or user list) with matching results.                       |
| FR-22 | Dashboards show loading, empty, error, and forbidden states, and a manual Refresh control.                                                |

### 4.4 Hardening and Regression

| ID    | Requirement                                                                                                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-23 | All Lab 1–3 features (auth, My Tickets, Ticket Detail, Attachments, Public Comments, Internal Notes, Ticket Queue, assignment, user management) continue to work. |
| FR-24 | Loading, validation, success, empty, forbidden (403), not-found (404), conflict (409), and safe server-failure feedback are consistent across screens.            |
| FR-25 | Repeated clicks or network retries do not create duplicate Actions Taken, comments, or status changes.                                                            |
| FR-26 | Forms keep user input after a recoverable failure (validation, 409, 5xx, network).                                                                                |
| FR-27 | No console errors, broken links, placeholder text, or unfinished controls remain.                                                                                 |
| FR-28 | `GET /api/health` reports API and database status.                                                                                                                |
| FR-29 | README documents setup, migration, seed, test, and demo steps for the final product.                                                                              |

## 5. Business Rules

### 5.1 Actions Taken

| ID    | Rule                                                                                                                                                     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR-01 | An Action Taken belongs to exactly one Ticket (`ticketId` required, immutable).                                                                          |
| BR-02 | The Ticket Owner coordinates the Ticket, but an Action Taken may be performed by a different IT Staff member.                                            |
| BR-03 | Only IT Staff and Administrators can create, edit, complete, or cancel Actions Taken. Requesters are read-only.                                          |
| BR-04 | `createdBy` is always the authenticated user; clients cannot set it.                                                                                     |
| BR-05 | `performedBy` must reference an **active** user with role ITStaff or Administrator; otherwise the request is rejected (422 `INACTIVE_OR_INVALID_ASSIGNEE`).     |
| BR-06 | `actionAt` is required, cannot be more than 5 minutes in the future (server time), and cannot be earlier than the Ticket's `createdAt`.                  |
| BR-07 | `description` is required, 1–2000 characters after trim.                                                                                                 |
| BR-08 | `result` is optional while `Planned`, required (1–2000 chars) when `Completed`.                                                                          |
| BR-09 | If `followUpRequired = true`, `followUpNote` is required (1–1000 chars). If false, `followUpNote` is stored as null.                                     |
| BR-10 | `attachmentNotes` is optional free text (≤ 500 chars) describing which files/images to look at; it does not upload files.                                |
| BR-11 | Action status values: `Planned → Completed`, `Planned → Cancelled`, `Completed → Cancelled`. `Cancelled` is terminal and read-only.                      |
| BR-12 | Cancelling requires `cancelReason` (1–500 chars). Actions Taken are never deleted.                                                                       |
| BR-13 | Actions Taken cannot be created or edited when the Ticket is `Closed` or `Cancelled` (409 `TICKET_LOCKED`).                                              |
| BR-14 | Every edit must send the current `version`; a mismatch returns 409 `STALE_UPDATE`.                                                                       |
| BR-15 | Create requests carry a client-generated `clientRequestId` (UUID). A repeated id for the same Ticket returns the original record instead of a duplicate. |

### 5.2 Assignment and Dates

| ID    | Rule                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------ |
| BR-16 | A Ticket has at most one Ticket Owner (`ticketOwnerId`), who must be an active ITStaff/Administrator (preserved from Lab 3). |
| BR-17 | All timestamps are stored in UTC. Dashboard day/week boundaries use **Asia/Bangkok (UTC+7)**.                      |
| BR-18 | "Recent" means `updatedAt` within the last 7 days (rolling, now − 7×24h).                                          |

### 5.3 Ticket Status Transition Matrix

Statuses: `New`, `Open`, `InProgress`, `WaitingForRequester`, `Resolved`, `Closed`, `Reopened`, `Cancelled`.

| From \ To             | Open  | InProgress | WaitingForRequester | Resolved | Closed | Reopened              | Cancelled             |
| --------------------- | ----- | ----------- | --------------------- | -------- | ------ | --------------------- | --------------------- |
| New                   | Staff | Staff ¹     | –                     | –        | –      | –                     | Staff, Requester(own) |
| Open                  | –     | Staff ¹     | Staff                 | –        | –      | –                     | Staff                 |
| InProgress           | –     | –           | Staff                 | Staff ²  | –      | –                     | Staff                 |
| WaitingForRequester | –     | Staff       | –                     | Staff ²  | –      | –                     | Staff                 |
| Resolved              | –     | –           | –                     | –        | Staff  | Staff, Requester(own) | –                     |
| Reopened              | –     | Staff ¹     | Staff                 | Staff ²  | –      | –                     | Staff                 |
| Closed                | –     | –           | –                     | –        | –      | –                     | –                     |
| Cancelled             | –     | –           | –                     | –        | –      | –                     | –                     |

"Staff" = ITStaff or Administrator. ¹ requires a Ticket Owner. ² requires the resolution gate.

| ID    | Rule                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR-19 | Any transition not in the matrix returns 422 `INVALID_TRANSITION`. `Closed` and `Cancelled` are terminal.                                                                                                                                                                                                                                                                                                                       |
| BR-20 | **Resolution gate:** a Ticket may move to `Resolved` only if (a) it has a Ticket Owner, (b) at least one Action Taken is `Completed`, (c) no Action Taken is `Planned`, (d) no `Completed` Action has `followUpRequired = true` unless `followUpAcknowledged = true` in the request, and (e) a `resolutionSummary` (1–2000 chars) is supplied. Failures return 422 `RESOLUTION_GATE_FAILED` with the failing conditions listed. |
| BR-21 | A Requester's "appears resolved" indication sets `requesterResolvedIndicatedAt`; it never changes status. It is allowed only in `InProgress`, `WaitingForRequester`, or `Reopened`.                                                                                                                                                                                                                                          |
| BR-22 | Moving to `InProgress`, `WaitingForRequester`, or `Reopened` clears `requesterResolvedIndicatedAt`; moving to `Resolved` sets `resolvedAt`; `Closed` sets `closedAt`; `Reopened` clears `resolvedAt`.                                                                                                                                                                                                                        |
| BR-23 | Cancelling a Ticket requires `reason` (1–500 chars).                                                                                                                                                                                                                                                                                                                                                                            |
| BR-24 | Every status change writes one `TicketStatusHistory` row in the same DB transaction. History rows are never updated or deleted.                                                                                                                                                                                                                                                                                                 |
| BR-25 | Status changes require the Ticket's current `version` (409 `STALE_UPDATE` on mismatch).                                                                                                                                                                                                                                                                                                                                         |

### 5.4 Dashboard Calculations

"Open-like" statuses = `New, Open, InProgress, WaitingForRequester, Reopened`.

**Requester Dashboard** (always filtered by `requesterId = currentUser.id`):

| ID    | Metric           | Calculation                                                                                       | Drill-down                                 |
| ----- | ---------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| BR-26 | `myOpen`         | count where status ∈ open-like                                                                    | `/my-tickets?status=open`                  |
| BR-27 | `waitingForMe`   | count where status = WaitingForRequester                                                        | `/my-tickets?status=WaitingForRequester` |
| BR-28 | `inProgress`     | count where status = InProgress                                                                  | `/my-tickets?status=InProgress`           |
| BR-29 | `resolved`       | count where status = Resolved                                                                     | `/my-tickets?status=Resolved`              |
| BR-30 | `closed`         | count where status = Closed                                                                       | `/my-tickets?status=Closed`                |
| BR-31 | `recentTickets`  | 5 most recent by `updatedAt` desc, id desc                                                        | Ticket Detail                              |
| BR-32 | `needsAttention` | up to 5 with status = WaitingForRequester or Resolved (awaiting confirmation), `updatedAt` desc | Ticket Detail                              |

**IT Staff Dashboard** (all Tickets visible to staff):

| ID    | Metric                             | Calculation                                                                                               | Drill-down                            |
| ----- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| BR-33 | `new`                              | count status = New                                                                                        | `/queue?status=New`                   |
| BR-34 | `open`                             | count status ∈ {Open, Reopened}                                                                           | `/queue?status=Open,Reopened`         |
| BR-35 | `inProgress`                       | count status = InProgress                                                                                | `/queue?status=InProgress`           |
| BR-36 | `waitingForRequester`              | count status = WaitingForRequester                                                                      | `/queue?status=WaitingForRequester` |
| BR-37 | `unassigned`                       | count ticketOwnerId IS NULL and status ∈ open-like                                                           | `/queue?ownership=unassigned&status=open`    |
| BR-38 | `myAssigned`                       | count ticketOwnerId = me and status ∈ open-like                                                              | `/queue?ownership=mine&status=open`      |
| BR-39 | `byPriority`                       | count per IT Priority (all 4 levels, zero-filled) for open-like                                           | `/queue?priority=<P>&status=open`     |
| BR-40 | `myOpenFollowUps`                  | count Actions Taken where performedBy = me, status = Completed, followUpRequired = true, Ticket open-like | `/queue?followUpFor=me`               |
| BR-41 | `urgentTickets`                    | up to 5 open-like with priority ∈ {URGENT, HIGH}, ordered priority desc, createdAt asc                  | Ticket Detail                         |
| BR-42 | `recentTickets`                    | up to 5 open-like by `updatedAt` desc, id desc                                                            | Ticket Detail                         |
| BR-43 | `todayDelta` (optional small text) | count created since 00:00 Asia/Bangkok today per card; omitted if not implemented                         | —                                     |

**Administrator additions:**

| ID    | Metric  | Calculation                                      | Drill-down                            |
| ----- | ------- | ------------------------------------------------ | ------------------------------------- |
| BR-44 | `users` | counts of active users per role + inactive total | `/admin/users?role=<R>&active=<bool>` |

| ID    | Rule                                                                                                                                   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- |
| BR-45 | All metrics are computed by the backend from the database at request time; the client never computes counts from lists.                |
| BR-46 | Empty data returns `0` counts and `[]` lists (never null/omitted).                                                                     |
| BR-47 | Legacy Tickets with zero Actions Taken are counted normally; they simply cannot pass the resolution gate until an action is completed. |

## 6. UI Specification Summary

Full details in [`ui-spec.md`](./ui-spec.md).

- **Navigation:** Requester: Dashboard · My Tickets · Create Ticket · Profile. IT Staff: Dashboard · Ticket Queue · Create Ticket · Profile. Admin: IT Staff nav + Users. Active page is underlined and `aria-current="page"`.
- **Dashboards:** row of metric cards (label, value, "View all" link) → two-column area (Recent Tickets list + Quick Actions / Urgent). Stack to one column on mobile.
- **Ticket Detail → Actions Taken section:** list (table on desktop, cards on mobile), "Add Action" form (create mode), per-row View/Edit mode, Complete and Cancel actions with confirm dialog. Requesters see the list read-only.
- **Workflow panel:** status dropdown/buttons showing only permitted transitions, Resolve dialog (resolution summary + gate checklist), Cancel dialog (reason). Requester sees "Problem appears resolved" and "Reopen" buttons where allowed.
- **Feedback:** skeleton loading, empty state with call-to-action, inline field errors, toast on success, banner for 403/404/409/5xx; 409 offers "Reload latest".
- **Responsive:** desktop ≥1024px, tablet 768–1023px, mobile <768px; no horizontal page scroll.

## 7. Data Changes

### 7.1 New / changed models (Prisma)

```prisma
// Ticket.id and User.id are Int (autoincrement), unchanged since Lab 1. All
// foreign keys below are Int to match, and new models follow the same Int
// autoincrement PK convention as every other Lab 1–3 model.
enum ActionStatus { Planned Completed Cancelled }

model ActionTaken {
  id                 Int          @id @default(autoincrement())
  ticketId           Int
  ticket             Ticket       @relation(fields: [ticketId], references: [id], onDelete: Restrict)
  actionAt           DateTime
  description        String       @db.VarChar(2000)
  result             String?      @db.VarChar(2000)
  status             ActionStatus @default(Planned)
  performedById      Int
  performedBy        User         @relation("ActionPerformedBy", fields: [performedById], references: [id])
  createdById        Int
  createdBy          User         @relation("ActionCreatedBy", fields: [createdById], references: [id])
  updatedById        Int?
  updatedBy          User?        @relation("ActionUpdatedBy", fields: [updatedById], references: [id])
  followUpRequired   Boolean      @default(false)
  followUpNote       String?      @db.VarChar(1000)
  attachmentNotes    String?      @db.VarChar(500)
  completedAt        DateTime?
  cancelledAt        DateTime?
  cancelReason       String?      @db.VarChar(500)
  clientRequestId    String?
  version            Int          @default(1)
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt

  @@unique([ticketId, clientRequestId])
  @@index([ticketId, actionAt, createdAt, id])
  @@index([performedById, status, followUpRequired])
}

model TicketStatusHistory {
  id          Int          @id @default(autoincrement())
  ticketId    Int
  ticket      Ticket       @relation(fields: [ticketId], references: [id], onDelete: Restrict)
  fromStatus  TicketStatus?
  toStatus    TicketStatus
  actorId     Int
  actor       User         @relation(fields: [actorId], references: [id])
  reason      String?      @db.VarChar(2000)
  createdAt   DateTime     @default(now())

  @@index([ticketId, createdAt])
}

// Ticket — added fields
//   version                       Int       @default(1)
//   resolutionSummary             String?   @db.VarChar(2000)
//   resolvedAt                    DateTime?
//   closedAt                      DateTime?
//   cancelledAt                   DateTime?
//   cancelReason                  String?   @db.VarChar(500)
//   requesterResolvedIndicatedAt  DateTime?
//   actionsTaken                  ActionTaken[]
//   statusHistory                 TicketStatusHistory[]
//   @@index([status, ticketOwnerId])
//   @@index([requesterId, status, updatedAt])
//   @@index([itPriority, status])
```

> Model and enum names for `Ticket`, `User`, `TicketStatus`, `ItPriority` must match the names already used in Lab 3's `schema.prisma`.

### 7.2 Design decisions (justified)

1. **DD-01 — Separate `ActionTaken` table (1:N) instead of JSON on Ticket.** Actions need their own authorization, validation, ordering, version, and indexes for dashboard queries (`myOpenFollowUps`). A JSON column cannot be queried or constrained efficiently.
2. **DD-02 — Optimistic concurrency via integer `version`.** Updates use `UPDATE … WHERE id = ? AND version = ?`; zero rows affected → 409. This avoids locks, works over stateless REST, and satisfies §6.1 (no silent overwrite).
3. **DD-03 — Soft cancel instead of delete (append-only).** Keeps the audit trail required for final evidence; `onDelete: Restrict` prevents cascading loss of history.
4. **DD-04 — `clientRequestId` unique per Ticket** for idempotent creates, preventing duplicates from double-click or network retry.
5. **DD-05 — Separate `TicketStatusHistory`** so transitions are auditable and demonstrate append-only behavior.

### 7.3 Migration and backfill

- Migration name: `20261001_lab4_actions_taken_workflow` (additive only; no column drops or renames).
- New Ticket columns are nullable or have defaults (`version = 1`).
- Backfill script (inside migration SQL):
  - For Tickets already `Resolved`/`Closed`: `resolvedAt = updatedAt`, `closedAt = updatedAt` (for Closed), `resolutionSummary = 'Legacy ticket resolved before Lab 4'`.
  - Insert one `TicketStatusHistory` row per existing Ticket (`fromStatus = null`, `toStatus = current status`, `actorId = requesterId`, `reason = 'Backfill Lab 4'`).
  - Legacy Tickets have zero Actions Taken (valid; see BR-47).
- **Rollback/recovery:** take `pg_dump` before `prisma migrate deploy`; a down SQL script (`rollback.sql`) drops the two new tables and new Ticket columns. Tested by: migrate → seed → rollback → migrate again on a scratch DB.

### 7.4 Seed data (idempotent)

- Uses `upsert` keyed by fixed emails/ticket numbers; running `npm run seed` twice produces identical counts.
- Users: 3 Requesters, 3 IT Staff (1 inactive), 1 Admin.
- ≥ 16 Tickets covering all 8 statuses, all 4 priorities, assigned and unassigned.
- Tickets with 0, 1, and ≥3 Actions Taken, including one performed by a non-owner staff member, one Planned, one Cancelled, one Completed with follow-up.
- One Requester with **no** Tickets (zero-metric dashboard demo).

## 8. API Contract Summary

Full details in [`api-spec.md`](./api-spec.md).

| Method | Path                                                | Roles                           |
| ------ | --------------------------------------------------- | ------------------------------- |
| GET    | `/api/tickets/:ticketId/actions`                    | Requester(own), ITStaff, Administrator |
| POST   | `/api/tickets/:ticketId/actions`                    | ITStaff, Administrator                 |
| PATCH  | `/api/tickets/:ticketId/actions/:actionId`          | ITStaff, Administrator                 |
| POST   | `/api/tickets/:ticketId/actions/:actionId/complete` | ITStaff, Administrator                 |
| POST   | `/api/tickets/:ticketId/actions/:actionId/cancel`   | ITStaff, Administrator                 |
| GET    | `/api/tickets/:ticketId/transitions`                | Requester(own), ITStaff, Administrator |
| POST   | `/api/tickets/:ticketId/status`                     | per matrix                      |
| POST   | `/api/tickets/:ticketId/requester-resolution`       | Requester(own)                  |
| GET    | `/api/tickets/:ticketId/status-history`             | Requester(own), ITStaff, Administrator |
| GET    | `/api/dashboard/requester`                          | Requester                       |
| GET    | `/api/dashboard/staff`                              | ITStaff, Administrator                 |
| GET    | `/api/dashboard/admin`                              | Administrator                           |
| GET    | `/api/health`                                       | public                          |

Standard error body: `{ "error": { "code", "message", "details?" } }`. Status codes: 400 validation shape, 401, 403, 404, 409 conflict/stale, 422 business rule, 500 safe error (no stack traces).

## 9. Acceptance Criteria

### Actions Taken

| ID    | Criterion                                                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | Given a permitted IT Staff user and valid data, when an Action Taken is created, then it is saved under the correct Ticket with the authenticated creator and approved performer. |
| AC-02 | Given an authenticated Requester, when dashboard data is retrieved, then only metrics and recent Tickets owned by that Requester are returned.                                    |
| AC-03 | Given an IT Staff user on Ticket Detail, when they add an Action, complete it, and view the list, then the action appears in stable chronological order with status Completed.    |
| AC-04 | Given a Requester, when they call POST/PATCH on Actions Taken, then the API returns 403 and nothing changes.                                                                      |
| AC-05 | Given a Requester viewing an owned Ticket, then Actions Taken are shown read-only with no Add/Edit controls.                                                                      |
| AC-06 | Given a Requester, when they request Actions Taken of a Ticket they don't own, then 404 is returned.                                                                              |
| AC-07 | Given `performedById` of an inactive user or a Requester, then 422 `INACTIVE_OR_INVALID_ASSIGNEE` is returned.                                                                    |
| AC-08 | Given `followUpRequired = true` and empty `followUpNote`, then 400 validation error is shown inline under the field.                                                              |
| AC-09 | Given completing an action without `result`, then 400 validation error is returned.                                                                                               |
| AC-10 | Given two staff editing the same action, when the second saves with an old version, then 409 `STALE_UPDATE` is returned and the UI offers to reload while keeping typed data.     |
| AC-11 | Given the same `clientRequestId` submitted twice, then only one Action Taken exists.                                                                                              |
| AC-12 | Given a Cancelled action, then it cannot be edited (409) and shows a Cancelled badge with reason.                                                                                 |
| AC-13 | Given a Closed or Cancelled Ticket, then creating/editing actions returns 409 `TICKET_LOCKED` and the UI hides Add Action.                                                        |
| AC-14 | Given actions by two different IT Staff on one Ticket, then each shows its own "Performed by" name.                                                                               |
| AC-15 | Given `actionAt` in the future (> 5 min) or before Ticket creation, then 400 is returned.                                                                                         |

### Ticket Workflow

| ID    | Criterion                                                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-16 | For every allowed cell in the transition matrix, the transition succeeds for the permitted role and writes one history row.                    |
| AC-17 | For every disallowed transition, the API returns 422 `INVALID_TRANSITION` even when called directly (bypassing UI).                            |
| AC-18 | Given no Completed action or a Planned action exists, when moving to Resolved, then 422 `RESOLUTION_GATE_FAILED` lists the failing conditions. |
| AC-19 | Given a Requester clicks "Problem appears resolved", then status is unchanged and staff see the indication on Ticket Detail.                   |
| AC-20 | Given a Resolved owned Ticket, the Requester can Reopen it; a Closed Ticket shows no transition controls.                                      |
| AC-21 | Given a stale Ticket version, status change returns 409 and the UI reloads the latest status.                                                  |
| AC-22 | Status controls show only transitions returned by `/transitions` for the current user.                                                         |
| AC-23 | Status history is listed oldest→newest and has no edit/delete controls or endpoints.                                                           |

### Dashboards

| ID    | Criterion                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------- |
| AC-24 | Given seed data, each IT Staff Dashboard count equals the documented SQL/Prisma query result.                   |
| AC-25 | Clicking any metric card opens the drill-down list whose row count equals the card value.                       |
| AC-26 | Given a Requester with no Tickets, the dashboard shows 0 counts and an empty state with "Create Ticket".        |
| AC-27 | Given a Requester, when calling `/api/dashboard/staff`, then 403 is returned.                                   |
| AC-28 | Given an API failure, the dashboard shows an error banner with Retry and no stale numbers presented as current. |
| AC-29 | Admin Dashboard shows IT Staff metrics plus user counts per role.                                               |
| AC-30 | After login, each role lands on its own dashboard and the Dashboard nav item is active.                         |

### Hardening / Regression

| ID    | Criterion                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-31 | All Lab 1–3 automated tests pass on `main`.                                                                                                |
| AC-32 | Double-clicking any submit button creates at most one record.                                                                              |
| AC-33 | After a 5xx or network failure, form fields keep their values.                                                                             |
| AC-34 | All Lab 4 screens have no horizontal page scroll at 375px, 768px, and 1280px widths.                                                       |
| AC-35 | All interactive elements are keyboard reachable with visible focus; statuses have text labels (not color only).                            |
| AC-36 | No console errors on any major screen during E2E runs.                                                                                     |
| AC-37 | `GET /api/health` returns 200 with `db: "up"` when the DB is reachable, 503 otherwise.                                                     |
| AC-38 | Seed can run twice without errors or duplicated rows.                                                                                      |
| AC-39 | Migration applied to a Lab 3 database preserves all existing Users, Tickets, Attachments, Comments, and Notes (counts equal before/after). |

Every AC maps to at least one test in [`tests.md`](./tests.md).

## 10. Definition of Done (Product Completion)

- [ ] All FRs implemented; all BRs enforced by the backend.
- [ ] Every AC has a passing automated test listed in `tests.md` with its file path.
- [ ] Unit, API/integration, UI component, E2E, migration, and Lab 1–3 regression suites pass on `main`.
- [ ] Prisma migration applies cleanly on a Lab 3 database; rollback tested; seed idempotent.
- [ ] No endpoint relies on UI hiding for authorization.
- [ ] Dashboards verified against database queries (evidence in PR).
- [ ] Desktop, tablet, mobile screenshots saved under `artifacts/lab-04/screenshots/`.
- [ ] Accessibility checklist in `ui-spec.md` completed.
- [ ] No console errors, broken links, placeholder text, TODO controls.
- [ ] README (setup, env, migrate, seed, test, demo accounts) is current.
- [ ] All GitHub Issues closed and in Done; every PR reviewed and recorded in `reviewer.md`.
- [ ] `ai-use.md` includes LLM name, 6–10 key prompts, and reflection.
- [ ] `lab4-staging` merged into `main`; `main` is green.

## 11. Assumptions and Decisions

| ID   | Assumption / Decision                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-01 | The Lab 3 stack is kept: React + TypeScript client, Node/Express + TypeScript server, Prisma + PostgreSQL, Vitest/Jest + Supertest, React Testing Library, Playwright.                                                    |
| A-02 | Handout grading mentions "assign, complete, cancel" for Actions Taken, so an action has a status (Planned/Completed/Cancelled) and an assignable `performedBy`, while "Performed by (auto)" defaults to the current user. |
| A-03 | Any IT Staff may add actions to any Ticket (not only their own), matching BR-02 and the "accessible Tickets" wording.                                                                                                     |
| A-04 | Requesters see all Actions Taken fields except `createdBy/updatedBy` audit ids; internal details belong in Internal Notes, not actions.                                                                                   |
| A-05 | IT Priority levels are `LOW, MEDIUM, HIGH, URGENT` (unchanged from Lab 3's `ItPriority` enum).                                                                                                                                                       |
| A-06 | Time zone for all date boundaries is Asia/Bangkok; the API returns ISO-8601 UTC and the client formats in local time.                                                                                                     |
| A-07 | No real-time push; dashboards refresh on load and via a Refresh button.                                                                                                                                                   |
| A-08 | Only the Requester who owns the Ticket may Reopen it, and only from Resolved (not Closed).                                                                                                                                |
