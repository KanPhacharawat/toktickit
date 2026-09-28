# Lab 4 API Specification — TokTickIT

> Location in repo: `docs/lab-04/api-spec.md`
> Related: [`specification.md`](./specification.md) · [`ui-spec.md`](./ui-spec.md)

---

## 1. Conventions

- Base path: `/api`. JSON only (`Content-Type: application/json`).
- Auth: same mechanism as Labs 2–3 (session cookie / Bearer JWT). All endpoints except `/api/health` require authentication.
- Timestamps: ISO-8601 UTC strings (`2026-10-01T03:14:00.000Z`). Dashboard date boundaries use `Asia/Bangkok`.
- IDs: positive integers, unchanged from Labs 1–3 (`Ticket.id`, `User.id`, and the new `ActionTaken.id` / `TicketStatusHistory.id` are all Int autoincrement). A non-integer path id returns `400 VALIDATION_ERROR`, matching Lab 3 §1.1.
- Validation: request bodies validated with a schema library (e.g. Zod) **before** any DB write.
- Authorization is enforced in the server for every route; UI hiding is never relied on.
- Ownership leak protection: a Requester accessing a Ticket they don't own receives **404** (not 403) so existence is not revealed.

### 1.1 Error format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid.",
    "details": [
      {
        "field": "followUpNote",
        "message": "Follow-up note is required when follow-up is needed."
      }
    ]
  }
}
```

| HTTP | code                           | When                                                |
| ---- | ------------------------------ | --------------------------------------------------- |
| 400  | `VALIDATION_ERROR`             | shape/format/length invalid                         |
| 401  | `UNAUTHENTICATED`              | no/invalid session                                  |
| 403  | `FORBIDDEN`                    | role not allowed for the operation                  |
| 404  | `NOT_FOUND`                    | resource missing or not visible to user             |
| 409  | `STALE_UPDATE`                 | `version` mismatch (body includes `current`)        |
| 409  | `TICKET_LOCKED`                | Ticket is Closed/Cancelled                          |
| 409  | `ACTION_LOCKED`                | Action Taken is Cancelled                           |
| 422  | `INVALID_TRANSITION`           | status change not in matrix for role                |
| 422  | `RESOLUTION_GATE_FAILED`       | resolve preconditions failed (`details` lists them) |
| 422  | `INACTIVE_OR_INVALID_ASSIGNEE` | performedBy not active staff               |
| 500  | `INTERNAL_ERROR`               | unexpected; generic message, no stack/SQL           |

### 1.2 Shared objects

**UserSummary**

```json
{ "id": 7, "name": "Michael Chan", "role": "ITStaff" }
```

**TicketSummary**

```json
{
  "id": 101,
  "ticketNumber": "TT-20260905-0001",
  "summary": "Laptop battery drains quickly",
  "currentStatus": "InProgress",
  "itPriority": "HIGH",
  "ticketOwner": { "id": 7, "name": "Michael Chan", "role": "ITStaff" },
  "updatedAt": "2026-10-01T03:14:00.000Z",
  "createdAt": "2026-09-30T02:00:00.000Z"
}
```

**ActionTaken**

```json
{
  "id": 501,
  "ticketId": 101,
  "actionAt": "2026-10-01T02:14:00.000Z",
  "description": "Replaced battery",
  "result": "Laptop runs 4 hours on battery",
  "status": "Completed",
  "performedBy": { "id": 9, "name": "Somchai K.", "role": "ITStaff" },
  "isPerformedByOwner": false,
  "followUpRequired": true,
  "followUpNote": "Check battery health again in one week",
  "attachmentNotes": "See battery.jpg in Attachments",
  "completedAt": "2026-10-01T02:30:00.000Z",
  "cancelledAt": null,
  "cancelReason": null,
  "createdBy": { "id": 9, "name": "Somchai K.", "role": "ITStaff" },
  "updatedBy": null,
  "createdAt": "2026-10-01T02:15:00.000Z",
  "updatedAt": "2026-10-01T02:30:00.000Z",
  "version": 2
}
```

For Requesters, `createdBy` and `updatedBy` are omitted.

---

## 2. Actions Taken

### 2.1 `GET /api/tickets/:ticketId/actions`

| Roles | Requester (own ticket), ITStaff, Administrator |
| ----- | --------------------------------------- |

Response `200`:

```json
{ "items": [ActionTaken, "..."], "total": 3 }
```

Ordering: `actionAt ASC, createdAt ASC, id ASC`. Cancelled actions included (UI shows them muted).
Errors: 401, 404 (not found / not owner).

### 2.2 `POST /api/tickets/:ticketId/actions`

| Roles | ITStaff, Administrator |
| ----- | --------------- |

Request:

```json
{
  "clientRequestId": "7b3e1c9a-…",
  "actionAt": "2026-10-01T02:14:00.000Z",
  "description": "Replaced battery",
  "status": "Completed",
  "result": "Laptop runs 4 hours on battery",
  "performedById": 9,
  "followUpRequired": true,
  "followUpNote": "Check again in one week",
  "attachmentNotes": "See battery.jpg"
}
```

| Field                                        | Rule                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `clientRequestId`                            | required UUID (idempotency key)                                                   |
| `actionAt`                                   | required ISO; ≤ now + 5 min; ≥ ticket.createdAt                                   |
| `description`                                | required, trimmed 1–2000                                                          |
| `status`                                     | `Planned` \| `Completed` (default `Completed`); `Cancelled` not allowed on create |
| `result`                                     | required 1–2000 if `status = Completed`; else optional                            |
| `performedById`                              | optional; defaults to current user; must be active ITStaff/Administrator                 |
| `followUpRequired`                           | boolean, default false                                                            |
| `followUpNote`                               | required 1–1000 if `followUpRequired`; ignored/null otherwise                     |
| `attachmentNotes`                            | optional ≤ 500                                                                    |
| `createdById`, `ticketId`, `version` in body | ignored (server-controlled)                                                       |

Responses:

- `201 Created` + `ActionTaken` (new).
- `200 OK` + existing `ActionTaken` if `(ticketId, clientRequestId)` already exists (idempotent replay).
- Errors: 400, 401, 403 (Requester), 404, 409 `TICKET_LOCKED`, 422 `INACTIVE_OR_INVALID_ASSIGNEE`.

Side effect: Ticket `updatedAt` is touched (so it shows in "recent").

### 2.3 `PATCH /api/tickets/:ticketId/actions/:actionId`

| Roles | ITStaff, Administrator |
| ----- | --------------- |

Request (partial; `version` required):

```json
{
  "version": 2,
  "description": "Replaced battery with OEM part",
  "followUpRequired": false
}
```

Editable fields: `actionAt, description, result, performedById, followUpRequired, followUpNote, attachmentNotes`. `status` cannot be changed here.
Re-validation uses the merged record (e.g. Completed still needs `result`).
Responses: `200` + updated `ActionTaken` (`version` + 1, `updatedBy` = current user).
Errors: 400, 401, 403, 404, 409 `STALE_UPDATE` (body `{ error, current: ActionTaken }`), 409 `ACTION_LOCKED`, 409 `TICKET_LOCKED`, 422.

### 2.4 `POST /api/tickets/:ticketId/actions/:actionId/complete`

| Roles | ITStaff, Administrator |
| ----- | --------------- |

Request: `{ "version": 1, "result": "Fixed", "followUpRequired": false, "followUpNote": null }`
Only from `Planned`. Sets `status = Completed`, `completedAt = now`.
Responses: `200` ActionTaken. Errors: 400, 403, 404, 409 (`STALE_UPDATE`, `ACTION_LOCKED`, `TICKET_LOCKED`), 422 `INVALID_TRANSITION` if not Planned.

### 2.5 `POST /api/tickets/:ticketId/actions/:actionId/cancel`

| Roles | ITStaff, Administrator |
| ----- | --------------- |

Request: `{ "version": 3, "reason": "Duplicate entry" }` (`reason` 1–500)
From `Planned` or `Completed`. Sets `Cancelled`, `cancelledAt`, `cancelReason`.
Responses: `200` ActionTaken. Errors: 400, 403, 404, 409.

> There is **no DELETE** endpoint for Actions Taken (append-only). `DELETE` returns `405`.

---

## 3. Ticket Workflow

### 3.1 `GET /api/tickets/:ticketId/transitions`

| Roles | Requester (own), ITStaff, Administrator |
| ----- | -------------------------------- |

Returns permitted targets for **this user** from the current status.

```json
{
  "currentStatus": "InProgress",
  "version": 7,
  "transitions": [
    { "to": "WaitingForRequester", "requiresReason": false },
    {
      "to": "Resolved",
      "requiresReason": true,
      "gate": {
        "passed": false,
        "checks": [
          { "id": "HAS_OWNER", "passed": true },
          { "id": "HAS_COMPLETED_ACTION", "passed": true },
          { "id": "NO_PLANNED_ACTIONS", "passed": false },
          {
            "id": "FOLLOW_UPS_ACKNOWLEDGED",
            "passed": true,
            "requiresAcknowledgement": false
          }
        ]
      }
    },
    { "to": "Cancelled", "requiresReason": true }
  ],
  "requesterCanIndicateResolved": false
}
```

### 3.2 `POST /api/tickets/:ticketId/status`

| Roles | per transition matrix in specification §5.3 |
| ----- | ------------------------------------------- |

Request:

```json
{
  "version": 7,
  "toStatus": "Resolved",
  "reason": "Battery replaced and verified with user",
  "followUpAcknowledged": true
}
```

- `reason` = resolution summary for Resolved, required for Resolved / Cancelled / Reopened, optional otherwise (≤ 2000).
- Runs in one DB transaction: check version → check matrix → check gate → update Ticket (+timestamps per BR-22, `version + 1`) → insert `TicketStatusHistory`.

Response `200`:

```json
{ "ticket": { "...TicketDetail", "currentStatus": "Resolved", "version": 8, "resolvedAt": "…" },
  "history": { "id": 301, "fromStatus": "InProgress", "toStatus": "Resolved", "actor": UserSummary, "reason": "…", "createdAt": "…" } }
```

Errors:

- 400 (missing reason/shape), 401, 403 (role never allowed e.g. Requester → Closed), 404
- 409 `STALE_UPDATE` (+ `current` ticket summary), 409 if already in target status
- 422 `INVALID_TRANSITION`
- 422 `RESOLUTION_GATE_FAILED`:

```json
{
  "error": {
    "code": "RESOLUTION_GATE_FAILED",
    "message": "Ticket cannot be resolved yet.",
    "details": [
      { "check": "NO_PLANNED_ACTIONS", "message": "1 action is still planned." }
    ]
  }
}
```

> Lab 3's `PATCH /api/tickets/:ticketId/status` endpoint is retired: its matrix, roles, and lack of a resolution gate are superseded by this `POST /api/tickets/:ticketId/status`. The old route returns `404 NOT_FOUND` so the gate cannot be bypassed by calling it directly.

### 3.3 `POST /api/tickets/:ticketId/requester-resolution`

| Roles | Requester (own ticket) |
| ----- | ---------------------- |

Request: `{}` — Response `200`: `{ "ticketId": 101, "currentStatus": "InProgress", "requesterResolvedIndicatedAt": "…" }`
Status unchanged. Repeating the call is idempotent (keeps first timestamp).
Errors: 403 (staff), 404, 422 `INVALID_TRANSITION` (status not InProgress / WaitingForRequester / Reopened).

### 3.4 `GET /api/tickets/:ticketId/status-history`

Roles: Requester (own), ITStaff, Administrator. Response `200`: `{ "items": [History...] }` ordered `createdAt ASC, id ASC`. No write endpoints exist for history.

---

## 4. Dashboards

All dashboard responses are small aggregates — never full ticket collections. Recent lists contain at most 5 `TicketSummary` objects. Each metric includes its drill-down link so the UI never builds filters itself.

Metric object:

```json
{
  "key": "waitingForRequester",
  "label": "Waiting for Requester",
  "value": 7,
  "drillDown": "/queue?status=WaitingForRequester"
}
```

### 4.1 `GET /api/dashboard/requester`

| Roles | Requester only (403 for others) |
| ----- | ------------------------------- |

```json
{
  "generatedAt": "2026-10-01T03:40:00.000Z",
  "timeZone": "Asia/Bangkok",
  "metrics": [
    { "key": "myOpen", "label": "My Open Tickets", "value": 3, "drillDown": "/my-tickets?status=open" },
    { "key": "waitingForMe", "label": "Waiting for You", "value": 1, "drillDown": "/my-tickets?status=WaitingForRequester" },
    { "key": "inProgress", "label": "In Progress", "value": 2, "drillDown": "/my-tickets?status=InProgress" },
    { "key": "resolved", "label": "Resolved", "value": 5, "drillDown": "/my-tickets?status=Resolved" },
    { "key": "closed", "label": "Closed", "value": 12, "drillDown": "/my-tickets?status=Closed" }
  ],
  "needsAttention": [TicketSummary],
  "recentTickets": [TicketSummary]
}
```

All queries include `WHERE requesterId = :currentUserId` (derived from session, never from query params).

### 4.2 `GET /api/dashboard/staff`

| Roles | ITStaff, Administrator |
| ----- | --------------- |

```json
{
  "generatedAt": "…", "timeZone": "Asia/Bangkok",
  "metrics": [
    { "key": "new", "label": "New", "value": 14, "drillDown": "/queue?status=New" },
    { "key": "open", "label": "Open", "value": 23, "drillDown": "/queue?status=Open,Reopened" },
    { "key": "inProgress", "label": "In Progress", "value": 18, "drillDown": "/queue?status=InProgress" },
    { "key": "waitingForRequester", "label": "Waiting for Requester", "value": 7, "drillDown": "/queue?status=WaitingForRequester" },
    { "key": "myAssigned", "label": "My Assigned", "value": 16, "drillDown": "/queue?ownership=mine&status=open" }
  ],
  "secondary": [
    { "key": "unassigned", "label": "Unassigned", "value": 5, "drillDown": "/queue?ownership=unassigned&status=open" },
    { "key": "myOpenFollowUps", "label": "My open follow-ups", "value": 2, "drillDown": "/queue?followUpFor=me" }
  ],
  "byPriority": [
    { "priority": "URGENT", "value": 2, "drillDown": "/queue?priority=URGENT&status=open" },
    { "priority": "HIGH", "value": 6, "drillDown": "/queue?priority=HIGH&status=open" },
    { "priority": "MEDIUM", "value": 9, "drillDown": "/queue?priority=MEDIUM&status=open" },
    { "priority": "LOW", "value": 4, "drillDown": "/queue?priority=LOW&status=open" }
  ],
  "urgentTickets": [TicketSummary],
  "recentTickets": [TicketSummary]
}
```

### 4.3 `GET /api/dashboard/admin`

| Roles | Administrator |
| ----- | ----- |

Same body as `/dashboard/staff` plus:

```json
"users": { "active": { "Requester": 40, "ITStaff": 6, "Administrator": 2 }, "inactive": 3 }
```

### 4.4 Drill-down support on existing list endpoints

Extend the Lab 3 list endpoints (no new list endpoint):

| Endpoint                            | New/confirmed query params                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/tickets/queue` (staff queue) | `status` (comma list or `open` alias), `ownership=mine\|unassigned` (Lab 3 BR-29), `priority`, `followUpFor=me`, `sort=updatedAt\|createdAt\|priority`, `page`, `pageSize` |
| `GET /api/tickets/mine` (requester) | `status` (comma list or `open` alias), `sort`, `page`, `pageSize`                                                                                           |
| `GET /api/admin/users`              | `role`, `active=true\|false`                                                                                                                                |

Counts returned by dashboards must equal `total` of the corresponding drill-down list (verified by tests).

### 4.5 Metric query reference (Prisma)

```ts
const OPEN_LIKE = [
  "New",
  "Open",
  "InProgress",
  "WaitingForRequester",
  "Reopened",
];
prisma.ticket.count({ where: { currentStatus: "New" } }); // new
prisma.ticket.count({ where: { currentStatus: { in: ["Open", "Reopened"] } } }); // open
prisma.ticket.count({ where: { ticketOwnerId: me, currentStatus: { in: OPEN_LIKE } } }); // myAssigned
prisma.ticket.count({ where: { ticketOwnerId: null, currentStatus: { in: OPEN_LIKE } } }); // unassigned
prisma.ticket.groupBy({
  by: ["itPriority"],
  where: { currentStatus: { in: OPEN_LIKE } },
  _count: true,
}); // byPriority (zero-fill)
prisma.actionTaken.count({
  where: {
    performedById: me,
    status: "Completed",
    followUpRequired: true,
    ticket: { currentStatus: { in: OPEN_LIKE } },
  },
}); // myOpenFollowUps
```

---

## 5. Health

### `GET /api/health` (public)

`200`: `{ "status": "ok", "db": "up", "version": "lab4", "time": "…" }`
`503`: `{ "status": "degraded", "db": "down" }` — no connection strings or error internals.

---

## 6. Authorization Matrix (Lab 4 endpoints)

| Endpoint                             | Requester                                         | ITStaff   | Administrator      |
| ------------------------------------ | ------------------------------------------------- | ---------- | ---------- |
| GET actions                          | own ticket                                        | ✔          | ✔          |
| POST/PATCH actions, complete, cancel | ✘ 403                                             | ✔          | ✔          |
| GET transitions / status-history     | own ticket                                        | ✔          | ✔          |
| POST status                          | own ticket: New→Cancelled, Resolved→Reopened only | per matrix | per matrix |
| POST requester-resolution            | own ticket                                        | ✘ 403      | ✘ 403      |
| GET dashboard/requester              | ✔                                                 | ✘ 403      | ✘ 403      |
| GET dashboard/staff                  | ✘ 403                                             | ✔          | ✔          |
| GET dashboard/admin                  | ✘ 403                                             | ✘ 403      | ✔          |
| GET health                           | public                                            | public     | public     |

Inactive users: rejected at authentication (401) as in Lab 3.

## 7. Preserved Lab 2–3 APIs

All previously approved endpoints (auth, tickets CRUD, my tickets, assignment, attachments, public comments, internal notes, admin users) remain unchanged except:

1. `PATCH /api/tickets/:ticketId/status` (Lab 3 §9.4) is retired and replaced by `POST /api/tickets/:ticketId/status` (§3.2), which carries the expanded matrix, the resolution gate, and Requester-initiated transitions. The old route returns `404`.
2. `PATCH /api/tickets/:ticketId/owner` and `PATCH /api/tickets/:ticketId/it-priority` (Lab 3 §9.2–9.3) are unchanged.
3. Ticket detail response adds `version`, `resolutionSummary`, `resolvedAt`, `closedAt`, `cancelledAt`, `cancelReason`, `requesterResolvedIndicatedAt`, `actionsTakenCount`.
4. Ticket list endpoints gain the drill-down query params in §4.4.

Regression tests from Labs 2–3 must pass unchanged (except tests that set status via `PATCH /api/tickets/:ticketId/status`, which are updated to use the new status endpoint).
