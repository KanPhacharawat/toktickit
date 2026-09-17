# TokTickIT Users, Roles, IT Staff Ticketing, and Admin — Lab 3 Specification

## 1. Sprint Goal

Replace the Lab 2 Development Requester selector with secure email-and-password sign-in and three server-enforced roles: Requester, IT Staff, and Administrator. Requesters keep every Lab 2 ticketing function under their authenticated identity, and gain Public Comments and a "Problem Appears Resolved" signal. IT Staff work Tickets through a shared queue with ownership, IT Priority, a controlled status workflow, Public Comments, and private Internal Notes. Administrators maintain user accounts on one minimal screen.

## 2. Stakeholder Request

TokTickIT is moving from a development identity to real accounts, with these commitments:

| Stakeholder statement | Engineering interpretation |
| --- | --- |
| Replace the selector with secure login | Email + bcrypt-hashed password. A server-side session is stored in PostgreSQL and referenced by an HttpOnly cookie. The selector, its client state, and its API are deleted. |
| A user with an initial password must choose a new one before entering | `mustChangePassword` is enforced by the API on every protected route, not only by the UI. |
| Requesters keep using Lab 2 functions under their authenticated account | All Lab 2 Ticket and Attachment behavior is kept. Ownership comes from the session; a client-supplied `requesterId` is ignored. |
| IT Staff need a professional queue and ticket workflow | Queue with search, filters, sort, pagination, and simple counts. Claim, assign, and reassign; IT Priority; a fixed transition matrix with confirmations. |
| Communicate publicly, record privately | Public Comments and Internal Notes are separate, append-only models. Internal Notes can never reach a Requester, even by direct API call. |
| Requesters may say it appears resolved; IT Staff formally resolve | "Problem Appears Resolved" records a signal and a Public Comment. It never changes status. |
| A simple User Management screen | One screen: list, search, one role filter, create, edit, activate or deactivate, set a new initial password. No deletion. |
| Hiding a button is not authorization | Every rule here is enforced by the backend. The UI only mirrors server decisions. |

## 3. Scope

### 3.1 Included

- Login, logout, current-user retrieval, session expiry, and login throttling.
- Mandatory password change for initial passwords, plus voluntary password change from the profile menu.
- Password hashing and password rules.
- Server-side authentication, role, and ownership checks on every protected route.
- Role-aware application shell: user name, role badge, profile menu, and role navigation.
- Migration of Development Requester records into `User`, preserving all Lab 2 data.
- Removal of the Development Requester selector, the Change Requester action, their client state, and the requester-id API routes.
- Requester regression: Create Ticket, My Tickets, Ticket Detail, and Attachments under the authenticated identity.
- Public Comments and the "Problem Appears Resolved" action for Requesters.
- IT Staff Ticket Queue with search, filters, sort, pagination, and queue counts.
- IT Staff Ticket Detail operations:
  - claim, assign, and reassign
  - IT Priority
  - permitted status changes
  - Public Comments and Internal Notes
  - Attachment viewing
- Minimalist Administrator user management.
- Idempotent seed data for all roles.
- Loading, saving, success, validation, empty, no-results, forbidden, not-found, conflict, and safe-failure feedback.
- Responsive desktop, tablet, and mobile UI using the unchanged Zen Green design system.
- Unit, API/integration, UI component, UI style, responsive, accessibility, security/authorization, migration/regression, and E2E tests.

### 3.2 Explicitly Excluded

- **Identity features:** email invitations, password-reset email, "forgot password", MFA, social login, SSO, self-registration, account unlocking, approval workflows, and advanced identity management.
- **User administration extras:** user deletion, bulk operations, import/export, account or role history, multiple roles per user, departments, organizations, profile photos, and self-service profile editing.
- **User list extras:** pagination, multi-column sorting, and more than one simultaneous filter.
- **Ticket workflow extras:** Actions Taken (Lab 4), SLA calculation, escalation, notifications, automatic status changes, Requester-initiated status changes, and manual unassignment.
- **Threads:** editing or deleting Public Comments or Internal Notes, and rich text (HTML or Markdown) in them.
- **Attachments:** upload or removal by IT Staff or Administrators.
- **Reporting and platform:** dashboards and KPIs beyond queue counts, multi-tenancy, and production deployment or cloud changes.
- **Design:** changes to the Zen Green design system.

## 4. Functional Requirements

### Authentication and Session

**FR-01** The system shall provide a Login screen with Email and Password.

**FR-02** The backend shall authenticate an active user by normalized email and a password verified against the stored hash, and shall return the user's identity and role.

**FR-03** Successful login shall create a server-side session and return it as an HttpOnly session cookie.

**FR-04** Failed login shall show one generic message that does not reveal whether the email exists.

**FR-05** Inactive accounts shall be rejected with a clear message that exposes no other account information.

**FR-06** The backend shall throttle repeated failed login attempts per email.

**FR-07** The system shall provide a current-user endpoint used by the client at startup to restore the session.

**FR-08** Logout shall invalidate the session on the server, clear the cookie and client state, and return to Login.

**FR-09** Sessions shall expire after a fixed lifetime.

**FR-10** A user whose `mustChangePassword` flag is true shall be limited to a mandatory Change Password screen until a valid new password is saved.

**FR-11** An authenticated user shall be able to change their own password from the profile menu.

**FR-12** Change Password shall require the current password, apply the password rules, require confirmation, clear `mustChangePassword`, and continue into the application.

### Shell, Navigation, and Authorization

**FR-13** The application shell shall show the authenticated user's name and role, a profile menu with Change Password, and Logout.

**FR-14** Navigation shall show only destinations permitted for the current role.

**FR-15** Unauthenticated navigation to a protected screen shall redirect to Login. After sign-in, the user shall return to that screen when permitted.

**FR-16** Navigation to a screen the role cannot use shall show a Forbidden state. An unknown route or missing resource shall show a Not Found state.

**FR-17** Every protected API route shall enforce authentication, the password-change gate, role, and ownership on the server.

**FR-18** Requester identity shall come only from the session. Client-supplied `requesterId` values shall be ignored.

**FR-19** The Development Requester selector, the Change Requester action, their client-side state (including stored selection), `GET /api/development-requesters`, and all `/api/requesters/:requesterId/...` routes shall be removed.

### Requester

**FR-20** A Requester shall create Tickets using the Lab 2 form. The Requester field shall show the authenticated user read-only.

**FR-21** My Tickets shall list only the authenticated Requester's Tickets with the Lab 2 search, filters, sorting, pagination, and states.

**FR-22** Requester Ticket Detail shall show the Lab 2 read-only information plus the Ticket Owner's name, or "Unassigned".

**FR-23** The Lab 2 Attachment lifecycle shall continue for the Requester's own Tickets.

**FR-24** A Requester shall read and add Public Comments on their own Tickets.

**FR-25** A Requester shall be able to report "Problem Appears Resolved" on their own Ticket without changing its status.

### IT Staff Ticket Queue

**FR-26** IT Staff and Administrators shall have a Ticket Queue listing Tickets from all Requesters.

**FR-27** The queue shall support search by Ticket Number, Summary, Requester name, or Requester email.

**FR-28** The queue shall support filters for status group or single status, ownership, IT Priority, Requested Priority, and Category.

**FR-29** The queue shall support sorting by Created Date, Last Updated, Ticket Number, IT Priority, and Requested Priority.

**FR-30** The queue shall support pagination with metadata.

**FR-31** The queue shall show counts for Active, Unassigned, and Assigned to Me.

**FR-32** The queue shall provide loading, empty, no-results, forbidden, and failure feedback, and an action to open Ticket Detail.

### IT Staff Ticket Operations

**FR-33** IT Staff and Administrators shall open Ticket Detail for any Ticket.

**FR-34** IT Staff and Administrators shall claim an unassigned Ticket for themselves.

**FR-35** IT Staff and Administrators shall assign an unassigned Ticket to an assignable user.

**FR-36** The Ticket Owner or an Administrator shall reassign an owned Ticket.

**FR-37** The Ticket Owner or an Administrator shall change IT Priority.

**FR-38** The Ticket Owner or an Administrator shall change status. Only permitted transitions shall be offered or accepted, with confirmation where required.

**FR-39** IT Staff and Administrators shall read and add Public Comments on any Ticket.

**FR-40** IT Staff and Administrators shall read and add Internal Notes, displayed visually distinct from Public Comments.

**FR-41** IT Staff and Administrators shall view Attachment metadata and download active Attachments on any Ticket.

**FR-42** Ticket Detail shall show the Requester's "Problem Appears Resolved" indication to IT Staff.

### Administrator User Management

**FR-43** Administrators shall see a user list with Name, Email, Role, Status, and Edit.

**FR-44** The list shall support search by name or email and one optional role filter.

**FR-45** Administrators shall create a user with name, email, one role, activation state, and initial password.

**FR-46** Administrators shall edit a user's name, email, role, and activation state.

**FR-47** Administrators shall set a new initial password that must be changed at the user's next login.

**FR-48** The system shall reject duplicate emails and invalid roles.

**FR-49** The system shall prevent self-deactivation and any change leaving no active Administrator.

### Data

**FR-50** The migration shall convert Development Requesters into `User` records and preserve all Lab 2 data and Ticket ownership.

**FR-51** The seed script shall idempotently create documented development accounts for all roles, realistic Tickets, Public Comments, and Internal Notes.

## 5. Business Rules

### 5.1 Authorization Matrix

"Own" means the Ticket's `requesterId` is the caller. "Owner" means the Ticket's `ticketOwnerId` is the caller.

| Operation | Unauthenticated | Requester | IT Staff | Administrator |
| --- | --- | --- | --- | --- |
| Health check, login | Yes | Yes | Yes | Yes |
| Current user, logout, change own password | No | Yes | Yes | Yes |
| Categories, Related Systems | No | Yes | Yes | Yes |
| Create Ticket | No | Yes | No | No |
| My Tickets | No | Yes | No | No |
| Ticket Queue, queue counts, assignable users | No | No | Yes | Yes |
| Ticket Detail | No | Own | All | All |
| Attachment metadata, download | No | Own | All | All |
| Attachment upload, soft removal | No | Own | No | No |
| Public Comments: read, add | No | Own | All | All |
| Problem Appears Resolved | No | Own | No | No |
| Internal Notes: read, add | No | **Never** | All | All |
| View IT Priority | No | No | Yes | Yes |
| Claim unassigned Ticket | No | No | Yes | Yes |
| Assign unassigned Ticket to another user | No | No | Yes | Yes |
| Reassign owned Ticket | No | No | Owner | Yes |
| Change IT Priority | No | No | Owner | Yes |
| Change status | No | No | Owner | Yes |
| User Management | No | No | No | Yes |

While `mustChangePassword` is true, only current user, logout, and change password are permitted.

### 5.2 Core Rules

**BR-01 — Authentication**
Only an active user with valid credentials may authenticate.

**BR-02 — Mandatory Password Change**
A user marked as requiring a password change cannot enter the normal application until a new valid password is saved. The API returns `403 PASSWORD_CHANGE_REQUIRED` for every protected route except current user, logout, and change password.

**BR-03 — Authenticated Ownership**
The authenticated user identity, not a `requesterId` supplied by the client, determines ownership of Requester operations. Any client `requesterId` in a body or query is ignored.

**BR-04 — Comment and Note Visibility**
Public Comments are visible to the Ticket's Requester, IT Staff, and Administrators. Internal Notes are visible only to IT Staff and Administrators. No endpoint returns Internal Note content, counts, or existence to a Requester.

**BR-05 — Requester Resolution Signal**
A Requester may indicate that the problem appears resolved, but cannot formally set the Ticket to Resolved or Closed, or to any other status.

### 5.3 Roles and Authorization

**BR-06 — One Role**
Every user has exactly one role: `Requester`, `ITStaff`, or `Administrator`.

**BR-07 — Backend Enforcement**
Every operation in §5.1 is enforced by the backend. Hidden or disabled controls are feedback only.

**BR-08 — Check Order**
Protected routes check in this order, stopping at the first failure:

1. Session (`401`).
2. Password-change gate (`403`).
3. Role (`403`).
4. Input shape (`400`).
5. Resource existence and Requester ownership (`404`).
6. IT Staff owner authority (`403`).
7. Database-backed references (`400`).
8. Business rules and concurrency (`409`).

**BR-09 — No Existence Leaks**
A Requester requesting another Requester's Ticket, or its Attachments, Public Comments, or resolution action, receives the same `404 NOT_FOUND` as for a Ticket that does not exist. A role that may never use an endpoint (for example, a Requester calling Internal Notes) receives `403` before any lookup, identical for every id.

**BR-10 — Administrator Ticket Access**
The Administrator's primary responsibility is user management. This matrix explicitly permits Administrators all IT Staff Ticket operations, without needing ownership. This is consistent with Administrators being eligible Ticket Owners, reading Internal Notes, and changing IT Priority, and lets them recover Tickets left by deactivated staff.

### 5.4 Login, Passwords, and Sessions

**BR-11 — Email and Duplicates**
Emails are trimmed and lower-cased before validation, storage, and lookup. They must be at most 254 characters and in `local@domain.tld` form. Email is unique across all users, active or inactive.

**BR-12 — Password Handling**
Passwords are stored only as bcrypt hashes (cost 12). Plaintext passwords are never stored, logged, or returned. Password hashes and session tokens never appear in any API response.

**BR-13 — Password Rules**
A new or initial password must meet all of the following:

- 8–72 characters, and at most 72 bytes in UTF-8.
- At least one uppercase letter, one lowercase letter, one digit, and one special (non-alphanumeric) character.
- Not equal to the account email (case-insensitive).

A changed password must also differ from the current password. Passwords are never trimmed, and confirmation must match in the UI.

**BR-14 — Invalid Credentials**
An unknown email, a wrong password, and an account with no password all return the same `401` response: "Invalid email or password. Please try again." The server performs a bcrypt comparison for unknown emails too, so timing does not reveal existence.

**BR-15 — Inactive Users**
An inactive user with a wrong password receives the BR-14 response. With the correct password they receive `403` "This account cannot sign in. Contact your administrator." with no account data and no session. An existing session belonging to a user who becomes inactive fails with `401` on its next request.

**BR-16 — Login Attempts**
After 5 failed attempts for one normalized email within 15 minutes, further attempts for that email return `429` for 15 minutes, whether the email exists or not. The lock expires automatically (there is no unlock function). A successful login resets the counter.

**BR-17 — Session Token and CSRF**
The session token is 32 random bytes in an HttpOnly, `SameSite=Lax`, `Path=/` cookie named `toktickit_session`, marked `Secure` in production. Only its SHA-256 hash is stored. Tokens never appear in bodies, URLs, logs, or client-readable storage. CORS allows only the configured client origin with credentials. There are no signing secrets to commit.

**BR-18 — Session Expiry**
A session expires 8 hours after creation. Expiry does not slide. An expired session returns `401`.

**BR-19 — Logout**
Logout revokes the current session and clears the cookie. A revoked token returns `401` if replayed. Logout is idempotent (`204`).

**BR-20 — Current User**
The current-user endpoint returns only the caller's `id`, `name`, `email`, `role`, and `mustChangePassword`. It never accepts a user id from the client, returns `401` without a valid session, and remains available while a password change is required.

**BR-21 — Password Change Effects**
A successful change stores the new hash, clears `mustChangePassword`, and revokes all of the user's other sessions. The current session is kept. A wrong current password is a `400` field error, not `401`.

**BR-22 — Account Change Effects**
Deactivation and setting a new initial password revoke all of the target user's sessions. A role change applies from the user's next request, because role is read from the database on every request.

### 5.5 Requester Tickets and Regression

**BR-23 — Ticket Creation**
Only Requesters create Tickets. The Ticket's `requesterId` is the caller, and its IT Priority is initialized from Requested Priority (BR-37).

**BR-24 — Lab 2 Regression**
Lab 2 rules BR-01–BR-03, BR-11–BR-15, and BR-17–BR-39 remain in force, reading "selected Development Requester" as "authenticated Requester". Lab 2 BR-04–BR-07, BR-16, and BR-40 are superseded. Lab 2 BR-09 now responds `404` instead of `403` (BR-09 above).

**BR-25 — Attachment Authorization**
Upload and soft removal are allowed only for the owning Requester. Metadata and active download are allowed for the owning Requester, IT Staff, and Administrators. Lab 2 type, size, count, filename, and soft-removal rules are unchanged.

**BR-26 — Requester View**
Requester responses include the Ticket Owner's display name (or `null`) and the resolution signal. They never include IT Priority, Internal Notes, allowed transitions, or other users' email addresses.

### 5.6 Ticket Queue

**BR-27 — Queue Access**
Only IT Staff and Administrators may use the queue. It includes all Requesters' Tickets.

**BR-28 — Queue Search**
Search is trimmed, at most 200 characters, and case-insensitive. It matches Ticket Number, Summary, Requester name, or Requester email.

**BR-29 — Queue Filters**
Filters are optional and combine with AND:

- One of the following, but not both:
  - Status group `active` (all except Closed and Cancelled) or `closed` (Closed, Cancelled).
  - A single status.
- Ownership: `mine` or `unassigned`.
- IT Priority.
- Requested Priority.
- Category.

**BR-30 — Queue Sorting and Defaults**
Sortable fields are Created Date (`ticketDate`), Last Updated, Ticket Number, IT Priority, and Requested Priority. Priority order is Low < Medium < High < Urgent. The secondary sort is Ticket Number ascending. The API default is all statuses, Created Date ascending (oldest first). The UI opens with the `active` status group.

**BR-31 — Queue Pagination and Invalid Queries**
Pages start at 1. Page sizes are 10, 20, and 50, default 20. The response includes `page`, `pageSize`, `totalItems`, and `totalPages`. Invalid values or combinations return `400` with field errors. A page beyond the last returns an empty list with accurate metadata.

**BR-32 — Queue Counts**
Counts ignore search and filters:

- **Active:** Tickets in the `active` group.
- **Unassigned:** active Tickets with no owner.
- **Assigned to Me:** active Tickets owned by the caller.

No other metrics are provided.

### 5.7 Ownership, IT Priority, and Status

**BR-33 — Ticket Owner**
A Ticket has zero or one Ticket Owner, who must be an active IT Staff or Administrator user. New Tickets are unassigned.

**BR-34 — Claim**
Any IT Staff or Administrator may claim an unassigned Ticket for themselves. The update is conditional on the Ticket still being unassigned; the loser of a race receives `409 TICKET_ALREADY_CLAIMED`.

**BR-35 — Assign and Reassign**
Any IT Staff or Administrator may assign an unassigned Ticket to an assignable user. Only the current owner or an Administrator may reassign an owned Ticket, and the new owner must differ from the current one. The update is conditional on the owner not having changed since it was read (`409 STALE_TICKET`). There is no manual unassignment.

**BR-36 — Automatic Unassignment**
When a user is deactivated, or their role changes to Requester, every Ticket they own that is not Closed or Cancelled becomes unassigned in the same transaction.

**BR-37 — IT Priority**
IT Priority is Low, Medium, High, or Urgent. It is set to the Requested Priority when the Ticket is created, and existing Tickets receive the same copy in the migration. After that it may be changed only by the Ticket Owner or an Administrator. Requested Priority never changes after creation, and the two values never change each other.

**BR-38 — Operational Authority**
Only the Ticket Owner or an Administrator may change IT Priority or status. IT Staff who do not own a Ticket must claim it first (or be assigned).

**BR-39 — Status Transition Matrix**
Permitted for the Ticket Owner or an Administrator only. Requesters have no transitions (BR-05).

| From | Permitted to | Confirmation required |
| --- | --- | --- |
| New | Open, Cancelled | Cancelled |
| Open | In Progress, Waiting for Requester, Cancelled | Cancelled |
| In Progress | Waiting for Requester, Resolved, Cancelled | Resolved, Cancelled |
| Waiting for Requester | In Progress, Resolved, Cancelled | Resolved, Cancelled |
| Resolved | Closed, Reopened | Closed, Reopened |
| Reopened | In Progress, Waiting for Requester, Cancelled | Cancelled |
| Closed | none (terminal) | — |
| Cancelled | none (terminal) | — |

Any other transition, including to the same status, returns `409 INVALID_STATUS_TRANSITION`. Confirmation is a UI dialog before the request is sent. The API needs no extra field.

**BR-40 — Owner Required**
Moving to Open, In Progress, Waiting for Requester, or Resolved requires a Ticket Owner (`409 OWNER_REQUIRED`). Cancelled, Closed, and Reopened do not.

**BR-41 — Terminal Tickets**
On Closed or Cancelled Tickets, the following return `409 TICKET_CLOSED`:

- Claim, assign, and reassign.
- IT Priority changes.
- Status changes.
- Public Comments.
- "Problem Appears Resolved".

Internal Notes remain allowed. Lab 2 Attachment rules are unchanged.

**BR-42 — Stale Updates**
Ownership, IT Priority, and status requests may include `expectedUpdatedAt`. A mismatch returns `409 STALE_TICKET` and nothing changes. The UI always sends it.

### 5.8 Public Comments, Internal Notes, and Resolution Signal

**BR-43 — Public Comments**
Public Comments may be added by the Ticket's Requester, IT Staff, or Administrators on non-terminal Tickets. Author and creation time are set by the backend; client author or time fields are ignored.

**BR-44 — Internal Notes**
Internal Notes may be read and added only by IT Staff and Administrators, on any Ticket status. Author and creation time are set by the backend.

**BR-45 — Content Validation and Safe Rendering**
Comment and note bodies go through these steps and rules:

1. CRLF is normalized to LF.
2. Control characters other than newline and tab are removed.
3. The text is trimmed.
4. The trimmed body must be 1–2000 characters. Empty or whitespace-only content returns `400`.

The 2000-character limit fits a detailed troubleshooting message (about 300 words) while keeping threads readable and payloads small.

Content is stored and returned as plain text. Clients render it as escaped text only, preserving line breaks. It is never interpreted as HTML or Markdown.

**BR-46 — Append-Only**
Comments and notes cannot be edited or deleted. Threads show oldest first with author name, author role, and timestamp.

**BR-47 — Activity Timestamp**
Public Comments, ownership, IT Priority, status, and resolution-signal changes update the Ticket's `updatedAt`. Internal Notes do not, so internal activity is not visible to Requesters through "Last Updated".

**BR-48 — Problem Appears Resolved**
The Ticket's Requester may report "Problem Appears Resolved" when status is New, Open, In Progress, Waiting for Requester, or Reopened. Reporting sets `problemAppearsResolvedAt` and adds the Public Comment "Problem appears resolved." with an optional note of up to 2000 characters. The rule also covers these cases:

- A repeat report while the flag is set returns `409`.
- A Resolved Ticket returns `409`.
- A terminal Ticket returns `409 TICKET_CLOSED`.
- The flag clears when the Ticket moves to Reopened.
- Status never changes (BR-05).

### 5.9 Administrator User Management

**BR-49 — Admin Access**
Only Administrators may use user-management screens and endpoints.

**BR-50 — Create with One Role**
A new user requires:

- A name (2–100 characters after trimming).
- A unique email.
- Exactly one valid role; missing, unknown, or multiple roles return `400`.
- An activation state, which defaults to active.
- An initial password following BR-13.

New users always have `mustChangePassword = true`.

**BR-51 — Editable Account Fields**
Administrators may update only name, email, role, and activation state, using the same validation as creation. Duplicate emails return `409`.

**BR-52 — Deactivation Instead of Deletion**
Users are never deleted. Deactivation blocks login, revokes sessions, and unassigns open Tickets (BR-15, BR-22, BR-36). Their Tickets, comments, and notes keep their author and requester links.

**BR-53 — No Self-Deactivation**
An Administrator cannot deactivate their own account (`409`).

**BR-54 — Last Active Administrator**
No change may leave zero active Administrators, whether by deactivation or by changing the role of the last active Administrator. The check runs inside the update transaction (`409`).

**BR-55 — New Initial Password**
Setting a new initial password stores the hash, sets `mustChangePassword = true`, and revokes the user's sessions. The user must change it at their next login.

**BR-56 — User List**
The user list is sorted by name, then id. It has one search term (name or email) and one optional role filter, with no pagination or column sorting.

### 5.10 Data, Migration, and Failures

**BR-57 — Migration Preserves Lab 2 Data**
The migration renames `DevelopmentRequester` to `User` in place, so ids and Ticket foreign keys stay valid. No table holding Lab 2 data is dropped or recreated. Migrated users keep their activation state and become Requesters with `mustChangePassword = true` and no password hash.

**BR-58 — Initial Passwords for Migrated Requesters**
A user with no password hash cannot log in (BR-14). Existing Requesters receive initial passwords in one of two ways:

- **Seeded development Requesters:** the seed script sets their documented development password.
- **Any other migrated Requester:** an Administrator uses "Set New Initial Password".

Either way, the user must change the password at first login unless the seed documents otherwise.

**BR-59 — Seed Behavior**
The seed script is idempotent. Documented development accounts are upserted by email and reset to their documented password, role, activation, and password-change state on every run. Seeded Tickets are upserted by fixed Ticket Number. Their seeded comments and notes are created only when absent. Users not listed in the seed are never modified. Credentials are for local development only.

**BR-60 — Safe Failures**
Errors use the Lab 2 error envelope. Unexpected errors return a generic message with no stack trace, SQL, path, hash, token, or unauthorized data. On any failed save, the UI keeps the user's entered values.

## 6. UI Specification Summary

The Zen Green design system from Lab 2 is reused unchanged: tokens, cards, inputs, buttons, badges, banners, read-only styling, validation placement, and focus rings. Detailed structure, modes, controls, feedback, and responsive layouts are in `docs/lab-03/ui-spec.md`.

### 6.1 Screens

| Screen | Route | Roles | Modes | Key controls | Key feedback |
| --- | --- | --- | --- | --- | --- |
| Login | `/login` | Unauthenticated | Create (session) | Email, Password, show password, Sign In | Validation, busy, invalid credentials, inactive, throttled, failure |
| Change Password | `/change-password` | Any | Edit (mandatory or voluntary) | Current, New, Confirm, live rules checklist, Save | Rule validation, wrong current password, success, failure |
| My Tickets | `/my-tickets` | Requester | View | Lab 2 search, filters, sort, pagination | Lab 2 loading, empty, no-results, failure |
| Create Ticket | `/tickets/new` | Requester | Create | Lab 2 form (Requester read-only from session) | Lab 2 validation, busy, success, failure |
| Ticket Detail (Requester) | `/tickets/:id` | Requester (own) | View; Create (comment); Confirm (resolution) | Public Comment composer, Problem Appears Resolved, Attachments | Not found, section failures, conflict |
| Ticket Queue | `/queue` | IT Staff, Admin | View | Quick views with counts, search, filters, sort, pagination | Loading skeleton, empty, no-results, forbidden, invalid query, failure |
| Ticket Detail (Staff) | `/tickets/:id` | IT Staff, Admin | View; Edit (operations); Create (comment, note) | Claim, Assign/Reassign, IT Priority, Status with confirmations, two distinct thread composers | Saving, success, validation, forbidden, conflict (claimed/stale/rule), not found, failure |
| User Management | `/admin/users` | Admin | View; Create; Edit | Search, role filter, user panel form, Set New Initial Password | Validation, duplicate email, self-deactivation, last admin, success, forbidden, failure |
| Forbidden / Not Found | any | Authenticated | View | Go home | — |

### 6.2 Role Behavior

The shell replaces the Requester chip with the user's name, a role badge, and a profile menu (Change Password, Log Out).

| Role | Navigation | Home |
| --- | --- | --- |
| Requester | My Tickets, Create Ticket | My Tickets |
| IT Staff | Ticket Queue | Ticket Queue |
| Administrator | User Management, Ticket Queue | User Management |

Unpermitted destinations are never rendered.

### 6.3 Responsive Rules

| Viewport | Behavior |
| --- | --- |
| Desktop ≥992px | Multi-column layouts. The queue is a 7-column table. User Management shows the list with a side panel. |
| Tablet 768–991px | Two columns where practical. Compact tables without horizontal page scroll. |
| Mobile <768px | Stacked layouts. Queue and user list become cards. Panels and dialogs are full-screen. Touch targets ≥44px. |

## 7. Data Changes

### 7.1 Enums

| Enum | Values | Change |
| --- | --- | --- |
| `UserRole` | `Requester`, `ITStaff`, `Administrator` | New |
| `ItPriority` | `LOW`, `MEDIUM`, `HIGH`, `URGENT` | New; separate from `RequestedPriority` |
| `TicketStatus` | `New`, `Open`, `InProgress`, `WaitingForRequester`, `Resolved`, `Closed`, `Reopened`, `Cancelled` | `OnHold` renamed to `WaitingForRequester`; `Open` and `Reopened` added |
| `RequestedPriority` | unchanged | — |

### 7.2 `User` (renamed from `DevelopmentRequester`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | Int PK | Preserved |
| `name` | String | 2–100 characters |
| `email` | String, unique | Lower-cased |
| `role` | `UserRole` | Default `Requester` |
| `passwordHash` | String? | bcrypt; `null` only for migrated users without an issued password |
| `mustChangePassword` | Boolean | Default `true` |
| `isActive` | Boolean | Preserved; default `true` |
| `passwordChangedAt` | DateTime? | Set on password change |
| `lastLoginAt` | DateTime? | Set on login |
| `createdAt`, `updatedAt` | DateTime | Preserved |
| `department`, `deletedAt` | — | Lab 2 columns retained so no data is dropped; unused and never exposed in Lab 3 |

Indexes: unique `email`; `[role, isActive]`; `isActive`.

### 7.3 `Session` (new)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | Int PK | — |
| `tokenHash` | String, unique | SHA-256 of the token |
| `userId` | Int FK → `User` | Cascade on delete (users are never deleted) |
| `createdAt` | DateTime | — |
| `expiresAt` | DateTime | `createdAt` + 8 hours |
| `revokedAt` | DateTime? | Logout or revocation |

Indexes: unique `tokenHash`; `userId`; `expiresAt`.

### 7.4 `Ticket` (extended)

| Field | Type | Notes |
| --- | --- | --- |
| `requesterId` | Int FK → `User` | Column and values unchanged |
| `ticketOwnerId` | Int? FK → `User` | New; `null` means Unassigned; restrict on delete |
| `itPriority` | `ItPriority` | New, NOT NULL; copied from `requestedPriority` |
| `problemAppearsResolvedAt` | DateTime? | New |

New indexes: `ticketOwnerId`; `itPriority`; `[currentStatus, ticketDate]`; `[ticketOwnerId, currentStatus]`.

### 7.5 `PublicComment` and `InternalNote` (new, separate tables)

Two tables with identical shape. Keeping them separate means a filtering mistake cannot expose a note in a public thread.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | Int PK | — |
| `ticketId` | Int FK → `Ticket` | Cascade on delete |
| `authorId` | Int FK → `User` | Restrict on delete |
| `body` | Text | 1–2000 characters, plain text |
| `createdAt` | DateTime | Backend time |

Index: `[ticketId, createdAt]`.

### 7.6 Relationships

- One User has one role.
- One Requester User → many submitted Tickets.
- One Ticket → zero or one Ticket Owner (IT Staff or Administrator User).
- One Ticket → many Public Comments and many Internal Notes.
- Each Comment or Note → one author User.
- One User → many Sessions.
- Categories, Related Systems, Tickets, and Attachments keep their Lab 2 relationships.

### 7.7 Migration Strategy

1. Create the migration with `prisma migrate dev --create-only` and hand-edit its SQL. Prisma's automatic diff would drop and recreate the renamed table and lose Lab 2 data.
2. Rename `DevelopmentRequester` to `User`, along with its primary key, unique index, indexes, and the `Ticket_requesterId_fkey` constraint.
3. Create `UserRole`. Add `role` (default `Requester`), `passwordHash` (null), `mustChangePassword` (default true), `passwordChangedAt`, and `lastLoginAt`. Lower-case and trim existing emails.
4. Update `TicketStatus`:
   - Rename `OnHold` to `WaitingForRequester`.
   - Add `Open` after `New`.
   - Add `Reopened` after `Closed`.
5. Create `ItPriority`. Add `Ticket.itPriority` as nullable, copy it with `requestedPriority::text::"ItPriority"`, then set it NOT NULL. Add `ticketOwnerId` and `problemAppearsResolvedAt`.
6. Create `Session`, `PublicComment`, and `InternalNote` with their foreign keys and indexes.
7. Verify with `server/prisma/verify-lab3.sql`:
   - Lab 2 row counts are unchanged.
   - Every Ticket's `requesterId` resolves to a `Requester`.
   - Every Ticket's `itPriority` equals its `requestedPriority`.
   - Every Attachment still references its Ticket.

**Client-side selector removal:**

- Delete `RequesterSelection.tsx`, `RequesterContext.tsx`, `fetchActiveRequesters`, and all `requesterId` URL and body parameters in `api.ts`.
- Replace the Lab 2 requester gate with an authentication gate.
- On startup the client deletes the obsolete `localStorage` key `toktickit.lab2.selectedRequesterId`.
- Identity is held only in memory from `GET /api/auth/me`; nothing identity-related is written to browser storage.

### 7.8 Seed Decisions

| Account group | Accounts | State after every seed run |
| --- | --- | --- |
| Requesters | Requester A–E (migrated Lab 2 rows), Inactive Requester | A–C: active, `mustChangePassword = false`. D–E: active, `mustChangePassword = true` (demonstrates migrated Requesters receiving an initial password). Inactive Requester: inactive. |
| IT Staff | 3 active, 1 inactive | `mustChangePassword = false` |
| Administrators | 1 active, 1 inactive | `mustChangePassword = false`. The inactive one does not count toward BR-54. |
| Tickets | About 24, keyed by fixed Ticket Numbers | Spread across Requesters A–C, all eight statuses, all priorities, differing IT Priority, owned and unassigned, several with `problemAppearsResolvedAt` |
| Threads | Public Comments and Internal Notes on about half of the Tickets | Created if absent. Non-sensitive text, including one comment containing `<b>` markup to demonstrate safe rendering. |

All seeded accounts share one documented development password that satisfies BR-13, listed in the README. E2E and API test setup re-run the seed to restore these states.

## 8. API Contract

The full contract is in `docs/lab-03/api-spec.md`.

### 8.1 Authentication Mechanism

- **Session:** opaque server-side session stored in PostgreSQL, sent as the HttpOnly `toktickit_session` cookie (`SameSite=Lax`, 8-hour absolute expiry).
- **Revocation:** the session is revoked on logout, deactivation, and initial-password reset. A password change revokes the user's other sessions.
- **CSRF and CORS:** `SameSite=Lax` plus a single allowed CORS origin with credentials.
- **Requests:** the client sends `credentials: "include"` on every request.

### 8.2 Endpoints

| Method | Path | Roles | Success |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | Public | `200` user identity + cookie |
| `POST` | `/api/auth/logout` | Any | `204` |
| `GET` | `/api/auth/me` | Any authenticated | `200` |
| `POST` | `/api/auth/change-password` | Any authenticated | `200` |
| `GET` | `/api/categories`, `/api/related-systems` | Any authenticated | `200` |
| `POST` | `/api/tickets` | Requester | `201` |
| `GET` | `/api/tickets/mine` | Requester | `200` paginated |
| `GET` | `/api/tickets/queue` | IT Staff, Admin | `200` paginated + counts |
| `GET` | `/api/users/assignable` | IT Staff, Admin | `200` |
| `GET` | `/api/tickets/:ticketId` | Requester (own), IT Staff, Admin | `200` role-shaped |
| `POST` | `/api/tickets/:ticketId/claim` | IT Staff, Admin | `200` |
| `PATCH` | `/api/tickets/:ticketId/owner` | IT Staff (unassigned), Owner, Admin | `200` |
| `PATCH` | `/api/tickets/:ticketId/it-priority` | Owner, Admin | `200` |
| `PATCH` | `/api/tickets/:ticketId/status` | Owner, Admin | `200` |
| `GET`, `POST` | `/api/tickets/:ticketId/public-comments` | Requester (own), IT Staff, Admin | `200`, `201` |
| `GET`, `POST` | `/api/tickets/:ticketId/internal-notes` | IT Staff, Admin | `200`, `201` |
| `POST` | `/api/tickets/:ticketId/problem-resolved` | Requester (own) | `200` |
| `GET`, `POST` | `/api/tickets/:ticketId/attachments` | GET: Requester (own), IT Staff, Admin; POST: Requester (own) | `200`, `201` |
| `GET`, `DELETE` | `/api/tickets/:ticketId/attachments/:attachmentId` | GET: Requester (own), IT Staff, Admin; DELETE: Requester (own) | `200` |
| `GET`, `POST` | `/api/admin/users` | Admin | `200`, `201` |
| `GET`, `PATCH` | `/api/admin/users/:userId` | Admin | `200` |
| `POST` | `/api/admin/users/:userId/initial-password` | Admin | `200` |

**Removed:** `GET /api/development-requesters`, `GET /api/tickets?requesterId=`, and all `/api/requesters/:requesterId/...` routes. These now return `404`.

### 8.3 Status Codes and Safe Errors

| Status | Meaning |
| --- | --- |
| `400` | Invalid input, query, or reference; wrong current password |
| `401` | No valid session; invalid credentials |
| `403` | Password change required; role or owner authority denied; inactive account at login |
| `404` | Missing resource, another Requester's Ticket, or a removed route |
| `409` | Duplicate email, claim race, stale update, invalid transition, owner required, terminal Ticket, Administrator safety rule, or duplicate resolution report |
| `429` | Login throttled |
| `500` | Unexpected error with a generic message |

Errors never reveal whether another user's Ticket, Attachment, or Internal Note exists, and never expose stack traces, SQL, paths, hashes, or tokens.

## 9. Acceptance Criteria

### Authentication and Passwords

**AC-01 — Valid login**
**Given** an active user with valid credentials,
**When** the user logs in,
**Then** the backend establishes authenticated access (session cookie) and returns the permitted identity and role, and the UI opens the role's home screen showing the user's name and role.

**AC-02 — Mandatory password change**
**Given** a user who must change the initial password,
**When** login succeeds,
**Then** normal application screens remain unavailable in the UI, and protected APIs return `403 PASSWORD_CHANGE_REQUIRED`, until a valid new password is saved.

**AC-03 — Client-supplied requesterId ignored**
**Given** an authenticated Requester,
**When** the client supplies another `requesterId` in a create body or list query,
**Then** the backend still applies the authenticated identity and does not create for, or return, another Requester's data.

**AC-04 — Internal Notes denied to Requesters**
**Given** a Requester account,
**When** any Internal Note endpoint is requested directly for any Ticket id,
**Then** the operation is rejected with `403` without exposing note content, count, or Ticket existence, and nothing is created.

**AC-05 — Invalid credentials**
**Given** a wrong password or an unknown email,
**When** login is submitted,
**Then** both return an identical `401` generic message, no cookie is set, and the email field keeps its value.

**AC-06 — Inactive account**
**Given** an inactive user,
**When** they log in with the correct password,
**Then** the API returns `403` with the inactive message and no account data, and no session is created.

**AC-07 — Login throttling**
**Given** 5 failed attempts for one email within 15 minutes,
**When** a 6th attempt is made, even with the correct password or for an unknown email,
**Then** the API returns `429`.

**AC-08 — Login form feedback**
**Given** the Login form,
**When** fields are empty or malformed, a valid submit is in flight, or the server fails,
**Then** field messages appear without an API call, Sign In is disabled and busy, or a safe failure banner appears, respectively.

**AC-09 — Password rules**
**Given** Change Password or an Administrator setting an initial password,
**When** the password has 7 characters, or 73 characters, or lacks an uppercase letter, lowercase letter, digit, or special character, or equals the email, or does not match its confirmation, or (on change) equals the current password or the current password is wrong,
**Then** a field message is shown and nothing is saved. Passwords of exactly 8 and 72 characters that meet the rules are accepted.

**AC-10 — Successful mandatory change**
**Given** a valid mandatory change,
**When** it is saved,
**Then** `mustChangePassword` is false, the user's other sessions return `401`, the current session continues, and the role home screen opens.

**AC-11 — Voluntary change from profile**
**Given** a signed-in user,
**When** they choose Change Password from the profile menu and save a valid new password,
**Then** the old password no longer works, the new one does, and they return to their previous screen with a success message.

**AC-12 — Current user**
**Given** a valid session,
**When** `GET /api/auth/me` is called,
**Then** only id, name, email, role, and `mustChangePassword` are returned. Without a valid session the result is `401`.

**AC-13 — Logout removes access**
**Given** a signed-in user,
**When** they log out, then replay the old cookie against a protected API and type a protected URL,
**Then** the API returns `401` and the browser shows Login with no cached data.

**AC-14 — Session expiry**
**Given** a session older than 8 hours,
**When** any protected request is made,
**Then** the API returns `401` and the UI returns to Login with "Your session has ended. Please sign in again."

**AC-15 — Password storage**
**Given** any seeded, created, changed, or reset user,
**When** the database and API responses are inspected,
**Then** only bcrypt hashes exist and no response contains a password, hash, or session token.

### Authorization and Navigation

**AC-16 — Unauthenticated API**
**Given** no session,
**When** each protected endpoint is called,
**Then** each returns `401 UNAUTHENTICATED` and no data.

**AC-17 — Role enforcement**
**Given** a Requester,
**When** they call queue, assignable users, claim, owner, IT Priority, status, or any admin endpoint,
**Then** each returns `403` and nothing changes. An IT Staff member calling any admin endpoint also receives `403`.

**AC-18 — Shell and role navigation**
**Given** each role signed in,
**When** the shell renders and the user types an unpermitted URL,
**Then** the header shows name, role badge, and a profile menu with Change Password and Log Out; only permitted navigation appears; and the unpermitted URL shows Forbidden.

**AC-19 — Selector removed**
**Given** the Lab 3 build,
**When** the app loads and old endpoints are called,
**Then** no Requester selector or Change Requester action renders, the obsolete `localStorage` key is removed, and `GET /api/development-requesters` and `/api/requesters/:id/...` return `404`.

### Requester

**AC-20 — Only Requesters create Tickets**
**Given** IT Staff or an Administrator,
**When** they call `POST /api/tickets`,
**Then** the API returns `403` and no Ticket is created.

**AC-21 — Cross-Requester protection without leaks**
**Given** Requester B,
**When** B requests Requester A's Ticket detail, Attachments, Attachment download, Public Comments, or resolution action,
**Then** each returns `404`, identical to a nonexistent Ticket id.

**AC-22 — Lab 2 regression**
**Given** a signed-in Requester,
**When** they create a Ticket with Attachments, search, filter, sort, and paginate My Tickets, open detail, download, and soft-remove an Attachment,
**Then** all Lab 2 behavior and validation still pass under the authenticated identity.

**AC-23 — Requester Public Comment**
**Given** a Requester on their own active Ticket,
**When** they post a valid comment,
**Then** it appears last with their name, role, and backend timestamp, and IT Staff see it.

**AC-24 — Problem Appears Resolved**
**Given** a Requester's own Ticket In Progress,
**When** they confirm "Problem Appears Resolved",
**Then** a "Problem appears resolved." Public Comment is added, the indicator appears for the Requester and in IT Staff queue and detail, and status remains In Progress.

**AC-25 — Requester data exclusion**
**Given** a Ticket with IT Priority and Internal Notes,
**When** its Requester retrieves detail, My Tickets, or Public Comments,
**Then** no response includes IT Priority, note content, allowed transitions, or staff email addresses.

### Comments and Notes

**AC-26 — Content validation**
**Given** a comment or note that is empty, whitespace-only, or 2001 characters,
**When** it is submitted,
**Then** inline validation is shown and the API returns `400`. A 2000-character body is accepted.

**AC-27 — Safe rendering**
**Given** a comment body `<b>bold</b><script>x</script>` with line breaks,
**When** the thread renders,
**Then** the characters are shown literally, no HTML is interpreted, and line breaks are preserved.

### Ticket Queue

**AC-28 — Queue content**
**Given** Tickets from several Requesters,
**When** IT Staff open the queue,
**Then** Tickets from all Requesters appear with Ticket No., Created Date, Summary, Requester, Category, Requested Priority, IT Priority, Status, Owner, and Last Updated as badges or text per `ui-spec.md`.

**AC-29 — Queue search**
**Given** the queue,
**When** a term matching Ticket Number, Summary, Requester name, or Requester email is searched,
**Then** only matching Tickets are returned.

**AC-30 — Filters, quick views, counts**
**Given** Tickets with varied status, owner, and priorities,
**When** a filter or the Active, Unassigned, or Assigned to Me view is applied,
**Then** only matching Tickets are returned, and each count equals that view's total without other filters.

**AC-31 — Sorting and defaults**
**Given** the queue,
**When** no sort is chosen, or IT Priority descending is chosen,
**Then** Tickets are ordered by oldest Created Date, or Urgent to Low, with Ticket Number ascending as the tie-breaker.

**AC-32 — Pagination and invalid queries**
**Given** more Tickets than the page size,
**When** pages change or invalid page, size, sort, filter, or status-group plus status values are sent,
**Then** correct pages and metadata are returned, and invalid values return `400`.

**AC-33 — Queue feedback**
**Given** the queue,
**When** loading, no Tickets exist, filters match nothing, or the API fails,
**Then** the skeleton, empty, no-results with Clear filters, or failure with Retry is shown.

### Ticket Operations

**AC-34 — Claim**
**Given** an unassigned New Ticket,
**When** IT Staff click Claim,
**Then** they become owner and the detail and queue show them.

**AC-35 — Claim race**
**Given** an unassigned Ticket,
**When** two IT Staff claim simultaneously, or one claims a Ticket already owned,
**Then** exactly one claim succeeds and the other returns `409 TICKET_ALREADY_CLAIMED`.

**AC-36 — Assign unassigned**
**Given** an unassigned Ticket,
**When** IT Staff assign it to another active IT Staff member,
**Then** that member becomes owner. Assigning to a Requester or an inactive user returns `400`.

**AC-37 — Reassign**
**Given** a Ticket owned by IT Staff A,
**When** A or an Administrator reassigns it to IT Staff C,
**Then** C becomes owner. A non-owner IT Staff member attempting it receives `403`.

**AC-38 — IT Priority**
**Given** a new Ticket with Requested Priority High,
**When** it is created and later its owner sets IT Priority to Urgent,
**Then** IT Priority starts as High, becomes Urgent, Requested Priority stays High, and a non-owner IT Staff member attempting it receives `403`.

**AC-39 — Permitted transition with confirmation**
**Given** an owned Ticket In Progress,
**When** the owner selects Resolved and confirms the dialog,
**Then** status becomes Resolved and the control then offers only Closed and Reopened. Cancelling the dialog sends no request.

**AC-40 — Forbidden transition**
**Given** a New Ticket,
**When** a direct API request sets it to Closed,
**Then** the API returns `409 INVALID_STATUS_TRANSITION` and the status is unchanged.

**AC-41 — Owner required**
**Given** an unassigned New Ticket,
**When** an Administrator sets it to Open,
**Then** the API returns `409 OWNER_REQUIRED`. Setting Cancelled succeeds.

**AC-42 — Terminal Tickets**
**Given** a Closed Ticket,
**When** claim, assign, IT Priority, status, Public Comment, or resolution report is attempted,
**Then** each returns `409 TICKET_CLOSED`, while an Internal Note still succeeds.

**AC-43 — Internal Notes**
**Given** IT Staff on any Ticket,
**When** they post an Internal Note,
**Then** it appears only in the visually distinct Internal Notes section, other staff and Administrators see it, and the Ticket's Last Updated does not change.

**AC-44 — Stale update**
**Given** two staff users viewing one Ticket,
**When** one changes it and the other submits with the old `expectedUpdatedAt`,
**Then** the second request returns `409 STALE_TICKET`, nothing changes, and the UI offers Reload.

**AC-45 — Attachment continuity for staff**
**Given** a Ticket with active and removed Attachments,
**When** IT Staff open detail,
**Then** metadata shows, active files download, removed files cannot be downloaded (`410`), and staff upload or removal requests return `403`.

### Administrator

**AC-46 — List, search, role filter**
**Given** users of every role,
**When** an Administrator searches by part of a name or email and selects a role,
**Then** matching users show Name, Email, Role, Status, and Edit, sorted by name, without pagination.

**AC-47 — Create user**
**Given** valid details with one role and an initial password,
**When** the Administrator saves,
**Then** the user appears, and at first login is forced to change the password.

**AC-48 — Duplicate email**
**Given** an existing `a@example.com`,
**When** creating or editing another user with ` A@Example.com`,
**Then** the API returns `409 EMAIL_ALREADY_IN_USE`, the error shows beside Email, and entered values are kept.

**AC-49 — Invalid input and role**
**Given** a direct request with role `SuperUser`, two roles, no role, a 1-character name, or an invalid email,
**When** it is submitted,
**Then** the API returns `400` and nothing is created or changed.

**AC-50 — Edit user**
**Given** an existing user,
**When** name, email, role, or activation state is changed,
**Then** the change is saved and a role change applies to the user's next request.

**AC-51 — New initial password**
**Given** a user signed in elsewhere,
**When** an Administrator sets a new initial password,
**Then** that session returns `401`, and the next login with the new password requires a password change.

**AC-52 — No self-deactivation**
**Given** an Administrator editing their own account,
**When** deactivation is attempted, including by direct API,
**Then** the API returns `409 SELF_DEACTIVATION_BLOCKED` and the account stays active.

**AC-53 — Last active Administrator**
**Given** exactly one active Administrator,
**When** that Administrator changes their own role to IT Staff,
**Then** the API returns `409 LAST_ACTIVE_ADMINISTRATOR` and nothing changes.

**AC-54 — Deactivation effects**
**Given** IT Staff with an active session who own active Tickets,
**When** an Administrator deactivates them,
**Then** their session stops working, login is refused, their active Tickets become unassigned, and the user still appears in the list as Inactive.

**AC-55 — Admin forbidden to others**
**Given** a Requester or IT Staff member,
**When** they open `/admin/users` or call `/api/admin/...`,
**Then** the UI shows Forbidden and the API returns `403`.

### Migration, Seed, and Quality

**AC-56 — Migration preserves Lab 2**
**Given** a database containing Lab 2 data,
**When** the Lab 3 migration runs,
**Then** all Tickets, Attachments, Categories, Related Systems, and Requesters survive with the same ids, every Ticket resolves to a Requester `User`, IT Priority equals Requested Priority, and Attachments still download.

**AC-57 — Migrated Requester passwords**
**Given** a migrated Requester without a password,
**When** they attempt login,
**Then** they receive the generic `401`. After an initial password is issued by seed or Administrator, they log in and must change it.

**AC-58 — Seed**
**Given** a migrated database,
**When** the seed runs twice,
**Then** the §7.8 accounts, Tickets, comments, and notes exist once each with their documented states, and the documented credentials work.

**AC-59 — Safe failures**
**Given** an unexpected server error or an authorization failure,
**When** the API responds and the UI displays it,
**Then** only safe generic messages appear, with no stack trace, SQL, path, hash, token, or unauthorized data, and entered form values are kept.

**AC-60 — Responsive**
**Given** 1280px, 820px, and 390px viewports,
**When** every Lab 3 screen is used,
**Then** controls stay usable, with no clipping, overlap, or horizontal page scroll.

**AC-61 — Accessibility and visual consistency**
**Given** keyboard-only use,
**When** forms, menus, dialogs, panels, and composers are used,
**Then** focus is visible, controls are labeled, validation sits beside fields, and status, Requested Priority, IT Priority, and role use consistent Zen Green text badges.

## 10. Definition of Done

### Product Completion

- Every FR and AC in this document is implemented. Every AC maps to at least one passing test in `docs/lab-03/tests.md`.
- Every protected endpoint has automated tests for `401` without a session and `403` or `404` for each disallowed role or non-owner.
- Direct-API security tests cover:
  - Internal Notes denied to Requesters.
  - Foreign `requesterId` ignored.
  - Cross-Requester `404` without leaks.
  - Staff upload and removal denied.
  - Owner-only operations.
  - Self-deactivation and last-active-Administrator rules.
  - Duplicate email and inactive login.
- Unit, API/integration, UI component, UI style, responsive, accessibility, security/authorization, migration/regression, and E2E tests pass on `main` with none skipped. Tests live in:
  - `server/tests/lab-03/`
  - `client/tests/lab-03/`
  - `e2e/lab-03/`
- All Lab 2 tests are migrated to authenticated identity and pass.
- The migration runs cleanly on a Lab 2 database and `verify-lab3.sql` passes. The seed is idempotent.
- No plaintext passwords, hashes, or tokens are exposed or logged. No secrets are committed.
- The Development Requester selector, its client state, and its API are fully removed.
- All screens use the unchanged Zen Green system and pass the desktop, tablet, and mobile visual checklist. Screenshots are in `artifacts/lab-03/screenshots/`.
- `specification.md`, `ui-spec.md`, `api-spec.md`, and `tests.md` match the implemented behavior.

### Course Delivery

- Sprint 3 GitHub Issues exist before implementation and end in Done.
- Feature branches merge into `lab3-staging` through reviewed PRs. `lab3-staging` merges into `main`.
- `reviewer.md` and `ai-use.md` are complete.
- README and `.gitignore` document Lab 3 environment variables, migration, seed, and development credentials.
- Evidence is ready for Answer Parts 1–9.

## 11. Assumptions and Decisions

1. **Sessions over JWT.** Server-side sessions let logout, deactivation, and password reset take effect immediately. The cookie also keeps Lab 2 `<a href>` Attachment downloads working without tokens in URLs.
2. **CSRF.** Client (`localhost:5173`) and API (`localhost:3000`) are same-site, so a `SameSite=Lax` cookie plus a single credentialed CORS origin is the CSRF defence. No CSRF token is added.
3. **Session lifetime.** 8 hours, absolute, with no idle timeout.
4. **Hashing.** bcrypt through the pure-JavaScript `bcryptjs` package (no native build on Windows), cost 12. The 72-byte maximum follows bcrypt's input limit.
5. **Password composition.** Upper, lower, digit, and special character, matching the handout's Change Password example.
6. **Throttling.** Per email, in memory, auto-expiring. This suits the single-instance lab and needs no account-unlock function (which is excluded).
7. **Inactive message.** A specific inactive message is shown only when the correct password is supplied, so account state is revealed only to the password holder.
8. **Administrator Ticket permissions.** Explicitly granted in the matrix (BR-10). Administrator home and first navigation item remain User Management, keeping responsibilities conceptually separate.
9. **Ticket creation.** Only Requesters create Tickets. Staff creating Tickets on someone's behalf is out of scope.
10. **Operational authority.** IT Priority and status belong to the Ticket Owner (or an Administrator), giving one accountable person. Any IT Staff member may claim or assign unassigned work so the queue can be dispatched.
11. **No manual unassignment.** Ownership only moves by claim, assign, reassign, or BR-36.
12. **Status meanings.**
    - New: submitted, not reviewed.
    - Open: accepted by an owner, work not started.
    - In Progress: actively worked.
    - Waiting for Requester: blocked on the Requester (replaces Lab 2 `OnHold`).
    - Resolved: fix delivered, awaiting closure.
    - Reopened: resolution did not hold.
    - Closed and Cancelled are terminal. Reopening is only from Resolved.
13. **Confirmations.** Resolved, Closed, Reopened, and Cancelled are confirmed in the UI. The API relies on the transition matrix instead of a confirmation flag.
14. **No automatic status changes.** For example, a Requester comment does not move Waiting for Requester back to In Progress; IT Staff decide.
15. **IT Priority hidden from Requesters.** It is internal triage and avoids confusion with Requested Priority.
16. **Resolution signal.** Stored as `problemAppearsResolvedAt` plus an automatic Public Comment, so it is visible in both the queue and the thread.
17. **Separate tables** for comments and notes, so leaks are structurally harder.
18. **Internal Notes do not update `updatedAt`.**
19. **Thread limits and rendering.** 1–2000 characters, plain text only, and threads are not paginated.
20. **`404` for another Requester's Ticket.** This changes Lab 2's `403` to meet the handout's no-existence-leak rule.
21. **Queue design.**
    - Default view Active, oldest first, 20 per page.
    - Seven desktop columns combine the handout's example fields plus Requester without a mega-grid.
    - The status group is named `active` so it cannot be confused with the Open status.
22. **Reference data requires authentication.** The Lab 1 bare-array shape of `/api/categories` is kept.
23. **Routing.** `react-router-dom` is added for URLs, return-after-login, and Forbidden and Not Found screens.
24. **Migration by in-place rename.** The Lab 2 `department` and `deletedAt` columns are retained, unused, to avoid discarding data.
25. **Seed states.** Seeded development accounts are reset on every run for deterministic tests. Requesters D and E demonstrate the migrated-initial-password path.
26. **Profile.** The profile menu shows the user's own name, email, and role read-only, with Change Password. Editing one's own account fields stays an Administrator function.
27. **Administrator self password.** An Administrator may set their own new initial password. No extra rule is added, keeping Administrator rules within the handout's list. They are then signed out and must change it at next login.
