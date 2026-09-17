# TokTickIT Lab 3 API Specification

## 1. General Rules

### 1.1 Conventions

- Base path: `/api`.
- JSON requests and responses, except Attachment upload (`multipart/form-data`) and download (the stored MIME type).
- Timestamps are ISO 8601 UTC strings. Ids are positive integers; a non-integer path id returns `400 VALIDATION_ERROR`.
- Successful payloads are wrapped in `data`, plus `meta` where relevant.
- Unknown `/api` routes, including removed Lab 2 routes (§15), return `404 NOT_FOUND`.
- A malformed JSON body returns `400 VALIDATION_ERROR` "The request body is not valid JSON."

### 1.2 Authentication Mechanism: Server-Side Session Cookie

| Property | Decision |
| --- | --- |
| Credential validation | Email trimmed and lower-cased; password compared with `bcryptjs.compare` against `User.passwordHash` (cost 12) |
| Session storage | `Session` row in PostgreSQL; only the SHA-256 hash of the token is stored |
| Token | 32 random bytes, base64url, opaque |
| Cookie | `toktickit_session`; `HttpOnly`; `SameSite=Lax`; `Path=/`; `Secure` when `COOKIE_SECURE=true`; `Max-Age` = lifetime |
| Expiration | 8 hours absolute from creation (`SESSION_TTL_HOURS`); not extended by activity |
| Logout invalidation | `Session.revokedAt` set; cookie cleared |
| Other revocation | Password change (the user's other sessions); deactivation and new initial password (all the target's sessions) |
| Client exposure | The token is never in a body, URL, log, or JavaScript-readable storage. There are no signing secrets. |

**Per-request resolution** for every protected route:

1. Read the cookie and hash the token.
2. Find a `Session` that is not revoked and not expired.
3. Load its `User`.
4. If the user is inactive, revoke the session.
5. Attach `{ id, role, mustChangePassword }` from the database to the request.

Any failure returns `401 UNAUTHENTICATED` and a cookie-clearing header.

### 1.3 CSRF and CORS

- The client (`localhost:5173`) and API (`localhost:3000`) are same-site, so the `SameSite=Lax` cookie is sent on the app's own requests but not on cross-site POST, PATCH, or DELETE requests.
- CORS responds with `Access-Control-Allow-Origin: <CLIENT_ORIGIN>` (never `*`) and `Access-Control-Allow-Credentials: true`.
- State-changing routes accept only `application/json` or `multipart/form-data` (Attachment upload) bodies.
- The client sends every request with `credentials: "include"`.

### 1.4 Environment Variables (server)

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL (unchanged) |
| `PORT` | `3000` | API port (unchanged) |
| `CLIENT_ORIGIN` | `http://localhost:5173` | The single CORS origin |
| `SESSION_TTL_HOURS` | `8` | Session lifetime |
| `COOKIE_SECURE` | `false` | Adds `Secure` to the cookie |
| `BCRYPT_COST` | `12` | bcrypt cost (startup fails below 10) |

`.env` stays gitignored; `.env.example` holds no real secrets.

### 1.5 Authorization Check Order

| Step | Check | Failure |
| --- | --- | --- |
| 1 | Valid session and active user | `401 UNAUTHENTICATED` |
| 2 | `mustChangePassword` false (exempt: `/auth/me`, `/auth/logout`, `/auth/change-password`) | `403 PASSWORD_CHANGE_REQUIRED` |
| 3 | Role allowed for the route | `403 FORBIDDEN` |
| 4 | Path, query, and body shape | `400 VALIDATION_ERROR` |
| 5 | Resource exists **and**, for Requesters, belongs to the caller | `404 NOT_FOUND` |
| 6 | IT Staff owner authority | `403 FORBIDDEN` |
| 7 | Database-backed references (e.g. assignable owner) | `400 VALIDATION_ERROR` |
| 8 | Business rules and concurrency | `409` |

**No-leak guarantees:**

- A role that may never call a route fails at step 3, before any lookup, so every id gives the same response.
- A Requester addressing another Requester's Ticket fails at step 5 with the same `404` as a nonexistent Ticket.
- IT Staff may see every Ticket, so a step-6 `403` reveals nothing new.

### 1.6 Enumerations

| Field | Values |
| --- | --- |
| `role` | `Requester`, `ITStaff`, `Administrator` |
| `currentStatus` | `New`, `Open`, `InProgress`, `WaitingForRequester`, `Resolved`, `Closed`, `Reopened`, `Cancelled` |
| `requestedPriority`, `itPriority` | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |

## 2. Errors

### 2.1 Envelope (unchanged from Lab 2)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data.",
    "fieldErrors": { "email": "Enter a valid email address." }
  }
}
```

`fieldErrors` is present only for field validation.

### 2.2 Codes

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid path, query, body, or reference |
| 400 | `BAD_UPLOAD` | Malformed or empty upload (Lab 2) |
| 401 | `UNAUTHENTICATED` | No valid session |
| 401 | `INVALID_CREDENTIALS` | Login failed |
| 403 | `ACCOUNT_INACTIVE` | Correct password, inactive account |
| 403 | `PASSWORD_CHANGE_REQUIRED` | Password change pending |
| 403 | `FORBIDDEN` | Role or owner authority denied |
| 404 | `NOT_FOUND` | Missing resource, another Requester's Ticket, or unknown route |
| 409 | `DUPLICATE_SUBMISSION` | Lab 2 duplicate Ticket window |
| 409 | `ATTACHMENT_LIMIT_REACHED` / `ALREADY_REMOVED` | Lab 2 Attachment rules |
| 409 | `TICKET_ALREADY_CLAIMED` | Claim on an owned Ticket |
| 409 | `STALE_TICKET` | `expectedUpdatedAt` or owner changed |
| 409 | `TICKET_CLOSED` | Operation on a Closed or Cancelled Ticket |
| 409 | `INVALID_STATUS_TRANSITION` | Not in the matrix |
| 409 | `OWNER_REQUIRED` | Target status needs an owner |
| 409 | `ACTION_NOT_ALLOWED_FOR_STATUS` | Resolution report on a Resolved Ticket |
| 409 | `ALREADY_REPORTED_RESOLVED` | Resolution already reported |
| 409 | `EMAIL_ALREADY_IN_USE` | Duplicate email |
| 409 | `SELF_DEACTIVATION_BLOCKED` | Administrator deactivating self |
| 409 | `LAST_ACTIVE_ADMINISTRATOR` | Would leave no active Administrator |
| 410 | `ATTACHMENT_REMOVED` | Lab 2 |
| 413 | `FILE_TOO_LARGE` | Lab 2 |
| 415 | `UNSUPPORTED_FILE_TYPE` | Lab 2 |
| 429 | `TOO_MANY_ATTEMPTS` | Login throttled |
| 500 | `INTERNAL_ERROR` | Unexpected |

### 2.3 Safe-Error Rules

1. `500` responses carry a generic operation message, e.g. "Could not load the queue. Please try again." Details go only to server logs.
2. No response or log contains a password, password hash, or session token.
3. No response contains a stack trace, SQL, Prisma message, file path, or storage key.
4. Login failures never reveal whether an email exists (§4.1).
5. `403 FORBIDDEN` says only "You do not have access to this resource." It never names owners or Requesters and never includes counts or content.
6. `fieldErrors` describe only the caller's own input.

## 3. Shared Shapes

### 3.1 `CurrentUser`

```json
{ "id": 7, "name": "Somchai Staff", "email": "staff1@toktickit.local", "role": "ITStaff", "mustChangePassword": false }
```

### 3.2 `AdminUser`

```json
{
  "id": 7, "name": "Somchai Staff", "email": "staff1@toktickit.local", "role": "ITStaff",
  "isActive": true, "mustChangePassword": false,
  "createdAt": "2026-09-18T02:00:00.000Z", "updatedAt": "2026-09-18T02:00:00.000Z"
}
```

### 3.3 `ThreadEntry` (Public Comment or Internal Note)

```json
{
  "id": 42,
  "body": "We have ordered a replacement battery.\nExpected Friday.",
  "author": { "id": 7, "name": "Somchai Staff", "role": "ITStaff" },
  "createdAt": "2026-09-20T08:15:00.000Z"
}
```

`body` is plain text. Clients must render it as text, never as HTML.

### 3.4 `Attachment`

Unchanged from Lab 2 (`docs/lab-02/api-spec.md` §9).

### 3.5 `RequesterTicketDetail`

```json
{
  "id": 101,
  "ticketNumber": "TT-20260905-0001",
  "ticketDate": "2026-09-05T12:30:00.000Z",
  "requester": { "id": 1, "name": "Requester A", "email": "requester-a@example.com" },
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 4, "name": "Corporate Laptop" },
  "summary": "Laptop battery drains quickly",
  "description": "The laptop battery reaches zero within approximately one hour.",
  "requestedPriority": "MEDIUM",
  "currentStatus": "InProgress",
  "ticketOwner": { "name": "Somchai Staff" },
  "problemAppearsResolvedAt": null,
  "createdAt": "2026-09-05T12:30:00.000Z",
  "updatedAt": "2026-09-20T08:15:00.000Z",
  "attachments": [],
  "permissions": {
    "canManageAttachments": true,
    "canAddPublicComment": true,
    "canReportProblemResolved": true
  }
}
```

- Never contains `itPriority`, `allowedStatusTransitions`, or the owner's id or email.
- `ticketOwner` is `null` when unassigned.

### 3.6 `StaffTicketDetail`

All `RequesterTicketDetail` fields, with `ticketOwner` and `permissions` replaced and two fields added:

```json
{
  "itPriority": "HIGH",
  "ticketOwner": { "id": 7, "name": "Somchai Staff", "role": "ITStaff" },
  "allowedStatusTransitions": ["WaitingForRequester", "Resolved", "Cancelled"],
  "permissions": {
    "canClaim": false,
    "canAssign": false,
    "canReassign": true,
    "canChangeItPriority": true,
    "canChangeStatus": true,
    "canAddPublicComment": true,
    "canAddInternalNote": true,
    "canManageAttachments": false
  }
}
```

`allowedStatusTransitions` is computed for the caller:

- It is empty without operational authority or on a terminal Ticket.
- It omits owner-required targets when the Ticket is unassigned.

`permissions` exists for UI rendering only; the server re-checks every operation.

## 4. Authentication

### 4.1 POST `/api/auth/login`

**Auth:** none.

**Request:**

```json
{ "email": " Requester-A@Example.com", "password": "Dev-Pass-2026!" }
```

**Success:** `200 OK`, with a `Set-Cookie: toktickit_session=…; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800` header.

```json
{ "data": { "user": { "id": 1, "name": "Requester A", "email": "requester-a@example.com", "role": "Requester", "mustChangePassword": false } } }
```

**Side effects:**

- Creates a `Session` and sets `lastLoginAt`.
- Resets the throttle counter.
- Revokes any valid session presented in the request cookie.

**Failures:**

| Status | Code | When | Message |
| --- | --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Missing or non-string `email` or `password` | Field messages. Not counted as a failed attempt. |
| `401` | `INVALID_CREDENTIALS` | Unknown email; wrong password (active or inactive); no password hash | "Invalid email or password. Please try again." |
| `403` | `ACCOUNT_INACTIVE` | Correct password, inactive | "This account cannot sign in. Contact your administrator." |
| `429` | `TOO_MANY_ATTEMPTS` | 5 failures for the email within 15 minutes; locked 15 minutes | "Too many sign-in attempts. Try again later." + `Retry-After` header |
| `500` | `INTERNAL_ERROR` | Unexpected | "Could not sign in. Please try again." |

**Rules:**

- Unknown emails still run a bcrypt comparison against a fixed dummy hash, so timing matches.
- The throttle is checked before credentials.
- A throttled request is not counted again.
- `401`, `403`, and `429` set no cookie.

### 4.2 POST `/api/auth/logout`

**Auth:** optional. **Request:** no body.

**Success:** `204 No Content` with `Set-Cookie: toktickit_session=; …; Max-Age=0`.

- Revokes the presented session if it is live.
- Always `204`, even without a cookie.

**Failure:** `500 INTERNAL_ERROR` (the cookie is still cleared).

### 4.3 GET `/api/auth/me`

**Auth:** required; exempt from the password-change gate.

**Success:** `200 OK` `{ "data": <CurrentUser> }`.

**Failures:** `401 UNAUTHENTICATED`; `500`.

Query or body user ids are ignored.

### 4.4 POST `/api/auth/change-password`

**Auth:** required; exempt from the password-change gate. Used for both mandatory and voluntary changes.

**Request:**

```json
{ "currentPassword": "Dev-Pass-2026!", "newPassword": "My-New-Pass-7?" }
```

Confirmation is checked by the client only.

**Validation** (all shape errors returned together; then current password; then difference):

| Field | Rule | Message |
| --- | --- | --- |
| `currentPassword` | Required string | "Current password is required." |
| `newPassword` | Required string | "New password is required." |
| `newPassword` | 8–72 characters and ≤72 UTF-8 bytes | "Password must be 8–72 characters." |
| `newPassword` | Has uppercase, lowercase, digit, and special character | "Password must include upper and lower case letters, a number, and a special character." |
| `newPassword` | Not the email (case-insensitive) | "Password must not be your email address." |
| `currentPassword` | Matches the stored hash | "Current password is incorrect." |
| `newPassword` | Differs from the current password | "New password must be different from your current password." |

**Success:** `200 OK` `{ "data": { "user": <CurrentUser> } }` with `mustChangePassword: false`.

**Side effects:**

- New hash stored, `mustChangePassword` set to false, `passwordChangedAt` set.
- All other sessions of the user revoked; the current session stays valid.

**Failures:** `400 VALIDATION_ERROR` (including a wrong current password, never `401`); `401 UNAUTHENTICATED`; `500` "Could not change the password. Please try again."

## 5. Reference Data

| Method | Path | Roles | Success |
| --- | --- | --- | --- |
| `GET` | `/api/categories` | Any authenticated | `200`; bare array `[{ "id": 1, "name": "Account and Access" }]` (Lab 1 shape kept) |
| `GET` | `/api/related-systems` | Any authenticated | `200` `{ "data": [{ "id": 1, "name": "Campus Wi-Fi" }] }` |

**Failures:** `401`, `403 PASSWORD_CHANGE_REQUIRED`, `500`.

## 6. Requester Tickets

### 6.1 POST `/api/tickets`

**Roles:** Requester.

**Request:** the Lab 2 body without `requesterId`:

```json
{ "categoryId": 2, "relatedSystemId": 4, "summary": "Laptop battery drains quickly", "requestedPriority": "MEDIUM", "description": "The laptop battery reaches zero within approximately one hour." }
```

- A `requesterId` in the body is **ignored**; it never errors and never changes ownership.
- `requesterId` is set to the caller.
- `itPriority` is set to `requestedPriority`.
- `ticketOwnerId` is `null`; `currentStatus` is `New`.

**Success:** `201 Created`, with the Lab 2 response shape.

**Failures:**

| Status | Code | When |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Lab 2 field and reference rules |
| `401` / `403` | `UNAUTHENTICATED` / `PASSWORD_CHANGE_REQUIRED` | — |
| `403` | `FORBIDDEN` | Caller is IT Staff or Administrator |
| `409` | `DUPLICATE_SUBMISSION` | Lab 2 duplicate window, keyed on the caller; includes `ticketNumber` |
| `500` | `INTERNAL_ERROR` | — |

### 6.2 GET `/api/tickets/mine`

**Roles:** Requester. Returns only the caller's Tickets.

**Query:** Lab 2 parameters and defaults (`search`, `categoryId`, `requestedPriority`, `currentStatus` using the eight statuses, `sortBy`, `sortOrder`, `page`, `pageSize`). A `requesterId` parameter is ignored.

**Success:** `200 OK`

```json
{
  "data": [
    {
      "id": 101, "ticketNumber": "TT-20260905-0001", "summary": "Laptop battery drains quickly",
      "category": "Hardware", "requestedPriority": "MEDIUM", "currentStatus": "InProgress",
      "ticketOwner": { "name": "Somchai Staff" }, "problemAppearsResolvedAt": null,
      "updatedAt": "2026-09-20T08:15:00.000Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 10, "totalItems": 1, "totalPages": 1 }
}
```

`ticketOwner` and `problemAppearsResolvedAt` are new; the other fields are unchanged from Lab 2.

**Failures:** `400` (invalid query, Lab 2 rules), `401`, `403 PASSWORD_CHANGE_REQUIRED`, `403 FORBIDDEN` (non-Requester), `500`.

## 7. Ticket Queue

### 7.1 GET `/api/tickets/queue`

**Roles:** IT Staff, Administrator.

**Query parameters:**

| Parameter | Values | Default |
| --- | --- | --- |
| `search` | ≤200 characters, trimmed; case-insensitive contains on Ticket Number, Summary, Requester name, Requester email | none |
| `statusGroup` | `active` (all except `Closed`, `Cancelled`) or `closed` (`Closed`, `Cancelled`) | none |
| `currentStatus` | One status value | none |
| `ownership` | `mine` or `unassigned` | none |
| `itPriority` | Priority value | none |
| `requestedPriority` | Priority value | none |
| `categoryId` | Positive integer | none |
| `sortBy` | `ticketDate`, `updatedAt`, `ticketNumber`, `itPriority`, `requestedPriority` | `ticketDate` |
| `sortOrder` | `asc`, `desc` | `asc` |
| `page` | Integer ≥1 | `1` |
| `pageSize` | `10`, `20`, `50` | `20` |

**Rules:**

- Filters combine with AND.
- Sending `statusGroup` together with `currentStatus` → `400` (`fieldErrors.currentStatus`: "Use either a status group or a single status, not both.").
- Any unsupported value, repeated key, or non-integer → `400` with field errors.
- Priority order: `LOW` < `MEDIUM` < `HIGH` < `URGENT`.
- Secondary sort: `ticketNumber asc` (except when sorting by `ticketNumber`).
- A page beyond `totalPages` returns an empty `data` array with accurate `meta`.

**Success:** `200 OK`

```json
{
  "data": [
    {
      "id": 101,
      "ticketNumber": "TT-20260905-0001",
      "ticketDate": "2026-09-05T12:30:00.000Z",
      "summary": "Laptop battery drains quickly",
      "category": { "id": 2, "name": "Hardware" },
      "requester": { "id": 1, "name": "Requester A", "email": "requester-a@example.com" },
      "requestedPriority": "MEDIUM",
      "itPriority": "MEDIUM",
      "currentStatus": "New",
      "ticketOwner": null,
      "problemAppearsResolvedAt": null,
      "updatedAt": "2026-09-05T12:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1, "pageSize": 20, "totalItems": 1, "totalPages": 1,
    "counts": { "active": 14, "unassigned": 5, "assignedToMe": 3 }
  }
}
```

- `ticketOwner`, when set: `{ "id": 7, "name": "Somchai Staff", "role": "ITStaff" }`.
- `meta.counts` ignores search and filters. It counts the `active` group, active Tickets without an owner, and active Tickets owned by the caller.

**Failures:** `400`, `401`, `403 PASSWORD_CHANGE_REQUIRED`, `403 FORBIDDEN` (Requester), `500` "Could not load the queue. Please try again."

### 7.2 GET `/api/users/assignable`

**Roles:** IT Staff, Administrator.

**Success:** `200 OK`. Active IT Staff and Administrators, sorted by name, then id:

```json
{ "data": [ { "id": 3, "name": "Admin One", "role": "Administrator" }, { "id": 7, "name": "Somchai Staff", "role": "ITStaff" } ] }
```

**Failures:** `401`, `403 PASSWORD_CHANGE_REQUIRED`, `403 FORBIDDEN` (Requester), `500`.

## 8. Ticket Detail

### 8.1 GET `/api/tickets/:ticketId`

**Roles:** all. The response depends on the caller:

| Caller | Condition | Result |
| --- | --- | --- |
| Requester | Own Ticket | `200` `{ "data": <RequesterTicketDetail> }` |
| Requester | Another Requester's Ticket, or nonexistent | `404 NOT_FOUND` "Ticket not found." (identical) |
| IT Staff / Administrator | Exists | `200` `{ "data": <StaffTicketDetail> }` |
| IT Staff / Administrator | Nonexistent | `404 NOT_FOUND` |

**Other failures:** `400` invalid id, `401`, `403 PASSWORD_CHANGE_REQUIRED`, `500` "Could not load the ticket. Please try again."

Threads are fetched from §10 and §11.

## 9. Ticket Operations

Common to §9.1–§9.4:

- **Roles:** IT Staff, Administrator. A Requester gets `403 FORBIDDEN` before any lookup.
- **Body** may include `expectedUpdatedAt` (ISO string). A mismatch → `409 STALE_TICKET`, with no change.
- **Success:** `200 OK` `{ "data": <StaffTicketDetail> }` reflecting the new state.
- **Atomicity:** each operation is one transaction with a conditional update, so concurrent requests cannot both succeed.
- **Order after the role check:**
  1. `400` shape
  2. `404` Ticket
  3. `403` authority
  4. `400` reference
  5. `409 STALE_TICKET`
  6. `409 TICKET_CLOSED`
  7. Operation-specific `409`

### 9.1 POST `/api/tickets/:ticketId/claim`

Sets the caller as owner of an unassigned Ticket.

**Request** (optional): `{ "expectedUpdatedAt": "2026-09-05T12:30:00.000Z" }`

**Authority:** any IT Staff or Administrator.

**Failures:**

| Status | Code | When |
| --- | --- | --- |
| `404` | `NOT_FOUND` | Ticket does not exist |
| `409` | `STALE_TICKET` | Timestamp mismatch |
| `409` | `TICKET_CLOSED` | Closed or Cancelled |
| `409` | `TICKET_ALREADY_CLAIMED` | Ticket already has an owner, including a lost race. Message: "This ticket has already been claimed." |

### 9.2 PATCH `/api/tickets/:ticketId/owner`

Assigns an unassigned Ticket, or reassigns an owned one.

**Request:**

```json
{ "ticketOwnerId": 9, "expectedUpdatedAt": "2026-09-20T08:15:00.000Z" }
```

**Authority:**

| Current owner | Who may call |
| --- | --- |
| None (assign) | Any IT Staff or Administrator |
| Someone (reassign) | The current owner or an Administrator |

**Failures:**

| Status | Code | When |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | `ticketOwnerId` missing, `null`, or not a positive integer: "Select a new owner." |
| `404` | `NOT_FOUND` | Ticket does not exist |
| `403` | `FORBIDDEN` | Owned Ticket and caller is IT Staff but not the owner |
| `400` | `VALIDATION_ERROR` | Target missing, inactive, or a Requester: "Select an active IT Staff member or administrator." Target is the current owner: "Choose a different owner." |
| `409` | `STALE_TICKET` | Timestamp mismatch, or the owner changed between read and update (e.g. a concurrent claim) |
| `409` | `TICKET_CLOSED` | Closed or Cancelled |

There is no way to set `ticketOwnerId` to `null` through the API.

### 9.3 PATCH `/api/tickets/:ticketId/it-priority`

**Request:**

```json
{ "itPriority": "HIGH", "expectedUpdatedAt": "2026-09-20T08:15:00.000Z" }
```

**Authority:** the current owner or an Administrator. `requestedPriority` is never read or written here.

**Failures:**

| Status | Code | When |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Missing, `null`, or not a priority value |
| `404` | `NOT_FOUND` | — |
| `403` | `FORBIDDEN` | IT Staff who is not the owner (including an unassigned Ticket) |
| `409` | `STALE_TICKET` / `TICKET_CLOSED` | — |

Sending the stored value again returns `200` without changing `updatedAt`.

### 9.4 PATCH `/api/tickets/:ticketId/status`

**Request:**

```json
{ "currentStatus": "Resolved", "expectedUpdatedAt": "2026-09-20T08:15:00.000Z" }
```

**Authority:** the current owner or an Administrator.

**Transition matrix:**

| From | Permitted `currentStatus` | Owner required for target |
| --- | --- | --- |
| `New` | `Open`, `Cancelled` | `Open` |
| `Open` | `InProgress`, `WaitingForRequester`, `Cancelled` | `InProgress`, `WaitingForRequester` |
| `InProgress` | `WaitingForRequester`, `Resolved`, `Cancelled` | `WaitingForRequester`, `Resolved` |
| `WaitingForRequester` | `InProgress`, `Resolved`, `Cancelled` | `InProgress`, `Resolved` |
| `Resolved` | `Closed`, `Reopened` | — |
| `Reopened` | `InProgress`, `WaitingForRequester`, `Cancelled` | `InProgress`, `WaitingForRequester` |
| `Closed` | none | — |
| `Cancelled` | none | — |

UI confirmation dialogs for `Resolved`, `Closed`, `Reopened`, and `Cancelled` happen before the request; the API needs no confirmation field.

**Side effect:** moving to `Reopened` clears `problemAppearsResolvedAt`.

**Failures:**

| Status | Code | When |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Missing or unknown status |
| `404` | `NOT_FOUND` | — |
| `403` | `FORBIDDEN` | IT Staff who is not the owner |
| `409` | `STALE_TICKET` | — |
| `409` | `TICKET_CLOSED` | Current status is `Closed` or `Cancelled`: "This ticket is closed and cannot change status." |
| `409` | `INVALID_STATUS_TRANSITION` | Not permitted, including the same status: "A ticket cannot move from New to Closed." |
| `409` | `OWNER_REQUIRED` | Owner-required target on an unassigned Ticket: "Assign an owner before moving this ticket to Open." |

## 10. Public Comments

### 10.1 GET `/api/tickets/:ticketId/public-comments`

**Roles:** Requester (own), IT Staff, Administrator.

**Success:** `200 OK` `{ "data": [<ThreadEntry>, …] }`, sorted by `createdAt` ascending, then `id`. Not paginated.

**Failures:** `400`, `401`, `403 PASSWORD_CHANGE_REQUIRED`, `404` (missing, or another Requester's Ticket), `500`.

### 10.2 POST `/api/tickets/:ticketId/public-comments`

**Roles:** Requester (own), IT Staff, Administrator.

**Request:** `{ "body": "The battery still drains after the update." }`

**Content processing** (shared with Internal Notes):

1. CRLF → LF.
2. Remove control characters except `\n` and `\t`.
3. Trim.
4. Require 1–2000 characters.

Author and time fields in the body are ignored.

**Success:** `201 Created`

```json
{
  "data": { "id": 43, "body": "The battery still drains after the update.", "author": { "id": 1, "name": "Requester A", "role": "Requester" }, "createdAt": "2026-09-20T09:00:00.000Z" },
  "meta": { "ticketUpdatedAt": "2026-09-20T09:00:00.000Z" }
}
```

**Side effect:** Ticket `updatedAt` is set to the comment time.

**Failures:**

| Status | Code | When |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Empty or whitespace-only: "Comment is required." Over 2000: "Comment must be 2000 characters or fewer." |
| `401` / `403` | — | Session or password gate |
| `404` | `NOT_FOUND` | Missing, or another Requester's Ticket |
| `409` | `TICKET_CLOSED` | Closed or Cancelled |
| `500` | `INTERNAL_ERROR` | "Could not post the comment. Please try again." |

## 11. Internal Notes

### 11.1 GET `/api/tickets/:ticketId/internal-notes`

**Roles:** IT Staff, Administrator.

**Success:** `200 OK` `{ "data": [<ThreadEntry>, …] }`, with the same ordering as comments.

**Failures:**

| Status | Code | When |
| --- | --- | --- |
| `401` | `UNAUTHENTICATED` | — |
| `403` | `PASSWORD_CHANGE_REQUIRED` | — |
| `403` | `FORBIDDEN` | Caller is a Requester, for **any** `ticketId` (valid, invalid, existing, or not). Body contains only the generic message. |
| `400` | `VALIDATION_ERROR` | Invalid id (staff only) |
| `404` | `NOT_FOUND` | Missing Ticket (staff only) |
| `500` | `INTERNAL_ERROR` | — |

### 11.2 POST `/api/tickets/:ticketId/internal-notes`

**Roles:** IT Staff, Administrator.

**Request:** `{ "body": "Battery model is under vendor recall; check the portal." }` (processed as §10.2).

**Success:** `201 Created` `{ "data": <ThreadEntry> }`.

**Rules:**

- Allowed on every status, including `Closed` and `Cancelled`.
- Does **not** change Ticket `updatedAt`, so no `meta.ticketUpdatedAt` is returned.

**Failures:** as §11.1, plus `400` "Note is required." or "Note must be 2000 characters or fewer." A Requester always receives `403`, and nothing is stored.

## 12. Problem Appears Resolved

### 12.1 POST `/api/tickets/:ticketId/problem-resolved`

**Roles:** Requester (own). IT Staff and Administrators receive `403 FORBIDDEN`.

**Request** (optional): `{ "note": "Works fine since this morning's restart." }`. `note` is processed as §10.2 but may be empty; maximum 2000 characters.

**Success:** `200 OK`

```json
{
  "data": {
    "problemAppearsResolvedAt": "2026-09-21T01:30:00.000Z",
    "currentStatus": "InProgress",
    "publicComment": {
      "id": 44,
      "body": "Problem appears resolved.\n\nWorks fine since this morning's restart.",
      "author": { "id": 1, "name": "Requester A", "role": "Requester" },
      "createdAt": "2026-09-21T01:30:00.000Z"
    }
  },
  "meta": { "ticketUpdatedAt": "2026-09-21T01:30:00.000Z" }
}
```

**Rules:**

- `currentStatus` is unchanged and never written by this endpoint.
- The flag and the comment are written in one transaction.

**Failures:**

| Status | Code | When |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | `note` is not a string or is over 2000 characters |
| `401` / `403` | — | Session, password gate, or non-Requester role |
| `404` | `NOT_FOUND` | Missing, or another Requester's Ticket |
| `409` | `TICKET_CLOSED` | Closed or Cancelled |
| `409` | `ACTION_NOT_ALLOWED_FOR_STATUS` | `Resolved`: "This ticket is already resolved." |
| `409` | `ALREADY_REPORTED_RESOLVED` | Flag already set |
| `500` | `INTERNAL_ERROR` | — |

## 13. Attachments

Lab 2 behavior, limits, and shapes are unchanged (`docs/lab-02/api-spec.md` §9–12). Paths and authorization change:

| Method | Path | Roles |
| --- | --- | --- |
| `POST` | `/api/tickets/:ticketId/attachments` | Requester (own) |
| `GET` | `/api/tickets/:ticketId/attachments` | Requester (own), IT Staff, Administrator |
| `GET` | `/api/tickets/:ticketId/attachments/:attachmentId` | Requester (own), IT Staff, Administrator |
| `DELETE` | `/api/tickets/:ticketId/attachments/:attachmentId` | Requester (own) |

**Failures added to Lab 2's:**

- `401` and `403 PASSWORD_CHANGE_REQUIRED` on all four.
- `403 FORBIDDEN` when IT Staff or Administrators call `POST` or `DELETE` (role check, before lookup).
- `404 NOT_FOUND` for a Requester on another Requester's Ticket (replaces Lab 2's `403`).

The Lab 2 codes are kept: `400 BAD_UPLOAD`, `404`, `409 ATTACHMENT_LIMIT_REACHED`, `409 ALREADY_REMOVED`, `410 ATTACHMENT_REMOVED`, `413`, `415`, `500`.

## 14. Administrator User Management

All endpoints here:

- **Role:** Administrator. Others receive `403 FORBIDDEN` before any lookup.
- **Responses** never include `passwordHash`, sessions, or `department`.
- **No `DELETE` endpoint exists:** users are deactivated, never deleted.

### 14.1 GET `/api/admin/users`

| Parameter | Values | Default |
| --- | --- | --- |
| `search` | ≤200 characters, trimmed; case-insensitive contains on name or email | none |
| `role` | `Requester`, `ITStaff`, `Administrator` | none |

- Other parameters (`page`, `sortBy`, …) are ignored.
- An invalid or repeated `role` → `400`.

**Success:** `200 OK` `{ "data": [<AdminUser>, …], "meta": { "totalItems": 12 } }`, sorted by name, then id. Not paginated.

**Failures:** `400`, `401`, `403`, `500`.

### 14.2 POST `/api/admin/users`

**Request:**

```json
{ "name": "New Staff", "email": "New.Staff@Example.com", "role": "ITStaff", "isActive": true, "initialPassword": "Temp-Pass-9!" }
```

**Validation:**

| Field | Rule | Message |
| --- | --- | --- |
| `name` | Required; 2–100 characters trimmed | "Name must be 2–100 characters." |
| `email` | Required; trimmed and lower-cased; ≤254 characters; `local@domain.tld` | "Enter a valid email address." |
| `role` | Required; exactly one of the three values; arrays, `null`, and unknown values rejected | "Select a role." |
| `isActive` | Optional boolean; default `true` | "Active must be true or false." |
| `initialPassword` | Required; §4.4 rules except "different from current"; not the email | Same messages as §4.4 |
| any other field | Rejected (e.g. `passwordHash`, `mustChangePassword`, `id`) | "This field cannot be set." |

**Success:** `201 Created` `{ "data": <AdminUser> }` with `mustChangePassword: true`.

**Failures:** `400`; `409 EMAIL_ALREADY_IN_USE` (`fieldErrors.email`: "This email is already used by another account.", enforced by a unique index, so races fail safely); `401`/`403`; `500` "Could not create the user. Please try again."

### 14.3 GET `/api/admin/users/:userId`

**Success:** `200 OK` `{ "data": <AdminUser> }`.

**Failures:** `400`, `404` "User not found.", `401`, `403`, `500`.

### 14.4 PATCH `/api/admin/users/:userId`

**Request:** a non-empty subset of `name`, `email`, `role`, `isActive`, e.g.:

```json
{ "role": "Requester", "isActive": false }
```

**Validation:**

- Field rules as §14.2.
- An empty body → `400` "Provide at least one field to update."
- Any other field, including `initialPassword` or `password` → `400`.

**Success:** `200 OK`

```json
{
  "data": { "id": 7, "name": "Somchai Staff", "email": "staff1@toktickit.local", "role": "Requester", "isActive": false, "mustChangePassword": false, "createdAt": "2026-09-18T02:00:00.000Z", "updatedAt": "2026-09-21T03:00:00.000Z" },
  "meta": { "unassignedTicketCount": 2, "sessionsRevoked": true }
}
```

**Side effects** (one transaction):

| Change | Effect |
| --- | --- |
| `isActive` true → false | Revoke all of the user's sessions; unassign their Tickets not `Closed` or `Cancelled` |
| `role` from `ITStaff`/`Administrator` to `Requester` | Unassign their Tickets not `Closed` or `Cancelled` |
| Any role change | Effective on the user's next request (no revocation) |
| Unassigned Tickets | Their `updatedAt` is updated |

**Failures** (409 checks inside the transaction, in this order):

| Status | Code | When |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Field rules |
| `404` | `NOT_FOUND` | User does not exist |
| `409` | `SELF_DEACTIVATION_BLOCKED` | Target is the caller and `isActive` is `false`: "You cannot deactivate your own account." |
| `409` | `LAST_ACTIVE_ADMINISTRATOR` | Target is currently an active Administrator, the change deactivates them or changes their role, and no other active Administrator exists: "At least one active administrator is required." |
| `409` | `EMAIL_ALREADY_IN_USE` | Email belongs to another user |
| `401` / `403` / `500` | — | — |

Repeating the stored values returns `200` with `unassignedTicketCount: 0` and `sessionsRevoked: false`.

### 14.5 POST `/api/admin/users/:userId/initial-password`

The local-lab way to issue or reset an initial password. No email is sent.

**Request:** `{ "initialPassword": "Temp-Pass-10!" }`

**Validation:** the §14.2 `initialPassword` rules against the target user's email.

**Success:** `200 OK` `{ "data": <AdminUser>, "meta": { "sessionsRevoked": true } }` with `mustChangePassword: true`.

**Side effects:**

- New hash stored, `mustChangePassword` set to true, all of the target's sessions revoked.
- Allowed for inactive users; they still cannot log in until reactivated.
- If the target is the caller, their own current session is revoked too, and the next request returns `401`.

**Failures:** `400`, `404`, `401`, `403`, `500` "Could not set the password. Please try again."

## 15. Removed Lab 2 Endpoints

| Removed (now `404`) | Replacement |
| --- | --- |
| `GET /api/development-requesters` | `POST /api/auth/login`, `GET /api/auth/me` |
| `GET /api/tickets?requesterId=` | `GET /api/tickets/mine` |
| `GET /api/requesters/:requesterId/tickets` | `GET /api/tickets/mine` |
| `GET /api/requesters/:requesterId/tickets/:ticketId` | `GET /api/tickets/:ticketId` |
| `POST`, `GET /api/requesters/:requesterId/tickets/:ticketId/attachments` | `/api/tickets/:ticketId/attachments` |
| `GET`, `DELETE /api/requesters/:requesterId/tickets/:ticketId/attachments/:attachmentId` | `/api/tickets/:ticketId/attachments/:attachmentId` |

`GET /api/health` is unchanged and public.

## 16. Endpoint Summary

| Method | Path | Auth | Roles |
| --- | --- | --- | --- |
| `GET` | `/api/health` | No | — |
| `POST` | `/api/auth/login` | No | — |
| `POST` | `/api/auth/logout` | Optional | Any |
| `GET` | `/api/auth/me` | Yes (gate-exempt) | Any |
| `POST` | `/api/auth/change-password` | Yes (gate-exempt) | Any |
| `GET` | `/api/categories` | Yes | Any |
| `GET` | `/api/related-systems` | Yes | Any |
| `POST` | `/api/tickets` | Yes | Requester |
| `GET` | `/api/tickets/mine` | Yes | Requester |
| `GET` | `/api/tickets/queue` | Yes | IT Staff, Administrator |
| `GET` | `/api/users/assignable` | Yes | IT Staff, Administrator |
| `GET` | `/api/tickets/:ticketId` | Yes | Requester (own), IT Staff, Administrator |
| `POST` | `/api/tickets/:ticketId/claim` | Yes | IT Staff, Administrator |
| `PATCH` | `/api/tickets/:ticketId/owner` | Yes | IT Staff (unassigned), Owner, Administrator |
| `PATCH` | `/api/tickets/:ticketId/it-priority` | Yes | Owner, Administrator |
| `PATCH` | `/api/tickets/:ticketId/status` | Yes | Owner, Administrator |
| `GET` / `POST` | `/api/tickets/:ticketId/public-comments` | Yes | Requester (own), IT Staff, Administrator |
| `GET` / `POST` | `/api/tickets/:ticketId/internal-notes` | Yes | IT Staff, Administrator |
| `POST` | `/api/tickets/:ticketId/problem-resolved` | Yes | Requester (own) |
| `POST` | `/api/tickets/:ticketId/attachments` | Yes | Requester (own) |
| `GET` | `/api/tickets/:ticketId/attachments` | Yes | Requester (own), IT Staff, Administrator |
| `GET` | `/api/tickets/:ticketId/attachments/:attachmentId` | Yes | Requester (own), IT Staff, Administrator |
| `DELETE` | `/api/tickets/:ticketId/attachments/:attachmentId` | Yes | Requester (own) |
| `GET` / `POST` | `/api/admin/users` | Yes | Administrator |
| `GET` / `PATCH` | `/api/admin/users/:userId` | Yes | Administrator |
| `POST` | `/api/admin/users/:userId/initial-password` | Yes | Administrator |

## 17. HTTP Status Summary

| Status | Usage |
| --- | --- |
| `200` | Retrieval or update succeeded |
| `201` | Ticket, Attachment, comment, note, or user created |
| `204` | Logout |
| `400` | Invalid path, query, body, or reference; wrong current password |
| `401` | No valid session; invalid login credentials |
| `403` | Inactive account at login; password change required; role or owner authority denied |
| `404` | Missing resource; another Requester's Ticket; removed or unknown route |
| `409` | Business-rule or concurrency conflict (§2.2) |
| `410` | Removed Attachment download |
| `413` / `415` | Attachment too large / unsupported type |
| `429` | Login throttled |
| `500` | Unexpected error, safe message only |
