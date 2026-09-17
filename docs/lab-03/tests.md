# TokTickIT Lab 3 — Test Plan

## 1. Test Strategy

This plan is written from the approved Sprint 3 contract (`specification.md`, `api-spec.md`, `ui-spec.md`) **before** implementation. Every Acceptance Criterion (AC-01–AC-61) maps to at least one planned test (§10). Tests are grouped by the Sprint 3 GitHub Issues, so each Pull Request adds and passes the tests for its own Issue.

Coverage priorities, in order:

1. **Authorization first.** Each rule in the authorization matrix is exercised by direct API calls that bypass the UI. A hidden button is never accepted as evidence.
2. **Boundaries.** Password length 7/8/72/73 characters, comment length 0/1/2000/2001 characters, page sizes, and every pair in the status transition matrix.
3. **Regression.** Every Lab 2 Requester function is re-run under authenticated identity.
4. **Concurrency.** Claim races, stale updates, and duplicate emails.
5. **Presentation.** Zen Green consistency, responsive layouts at 1280/820/390px, and keyboard accessibility.

### 1.1 Test Types and Tools

| Type | ID prefix | Tool | Location |
| --- | --- | --- | --- |
| Unit | `UNIT` | Vitest | `server/tests/lab-03/*.test.ts` |
| API / Integration | `API` | Vitest + Supertest, real PostgreSQL | `server/tests/lab-03/*.api.test.ts` |
| Security / Authorization | `SEC` | Vitest + Supertest direct calls | `server/tests/lab-03/authorization.api.test.ts`, `auth.api.test.ts` |
| Migration / Regression | `MIG`, `REG` | Vitest + `prisma migrate deploy` on a temporary schema; migrated Lab 1–2 suites | `server/tests/lab-03/migration.test.ts`, `seed.test.ts`, `server/tests/lab-01/`, `server/tests/lab-02/`, `client/tests/lab-02/`, `e2e/lab-02/` |
| UI Component | `UI` | Vitest + Testing Library (mocked `fetch`) | `client/tests/lab-03/*.test.tsx` |
| UI Style | `STYLE` | Vitest + Testing Library + `theme.css` token checks | `client/tests/lab-03/lab3-style.test.tsx` |
| Responsive / Visual | `RESP`, `VIS` | Playwright at 1280, 820, 390px | `e2e/lab-03/responsive-visual.spec.ts` |
| Accessibility | `A11Y` | Playwright keyboard flows + `@axe-core/playwright` | `e2e/lab-03/accessibility.spec.ts` |
| End-to-End | `E2E` | Playwright, real API and database | `e2e/lab-03/*.spec.ts` |

The file names follow the minimum Lab 3 repository structure (handout §12). Extra files are added where a concern deserves its own suite, such as the migration, the transition matrix, or accessibility. The handout's example rows keep their IDs:

- **API-01:** valid login.
- **API-08:** Requester requests Internal Notes. Placed in `comments-notes.api.test.ts`.
- **E2E-02:** initial-password login and change. Placed in `authentication.spec.ts`.

### 1.2 Test Data and Environment

| Concern | Approach |
| --- | --- |
| Accounts | API and E2E tests sign in with the seeded development accounts (`specification.md` §7.8). Tests that create users use unique emails `test-<uuid>@toktickit.test` and remove them in `afterAll`. |
| Sessions in API tests | `request.agent(app)` keeps the session cookie. The helper `loginAs(role)` returns an authenticated agent. The helper `rawCookie(agent)` supports replay tests after logout. |
| Deterministic state | `globalSetup` for the API and E2E suites re-runs the seed, which resets seeded account passwords and flags (BR-59), and cleans Tickets left by earlier runs. |
| Time | Session expiry is tested by moving `Session.expiresAt` into the past. Login throttling uses an injectable clock and a test-only `resetLoginThrottle()` exported only when `NODE_ENV=test`. |
| Failure injection | UI tests mock `fetch` responses (`400`, `401`, `403`, `404`, `409`, `429`, `500`, network error). API safe-error tests replace `getPrisma()` with a throwing stub. |
| Concurrency | Two requests fired together with `Promise.all`. E2E uses two browser contexts. |
| Migration | A temporary PostgreSQL schema `lab3_migration_test` receives the Lab 1–2 migrations and Lab 2 fixture rows, then the Lab 3 migration. The schema is dropped afterwards. |
| Serial execution | Server Vitest keeps `fileParallelism: false`. Playwright keeps `workers: 1` (one shared database). |

### 1.3 Final Status Values

`Planned` means the test is specified and not yet implemented. `Pass` or `Fail` records the result of the final run on `main`. Tests are never skipped, disabled, or marked `.only`.

## 2. Issue: Authentication Foundation

Covers user migration, password hashing, the login, logout, current-user, and change-password APIs, and the Login and Change Password screens.

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UNIT-01 | Unit | BR-13, AC-09 | Password rules and boundaries | 7 characters rejected, 8 accepted, 72 accepted, 73 rejected, and >72 UTF-8 bytes rejected. Missing upper, lower, digit, or special character each rejected. Password equal to email (any case) rejected. | `server/tests/lab-03/credentials.test.ts` | Planned |
| UNIT-02 | Unit | BR-12, AC-15 | Password hashing | Hash has bcrypt `$2` prefix with cost 12. The same password hashes differently each time. Verify is true only for the right password. `BCRYPT_COST` < 10 fails at startup. | `server/tests/lab-03/credentials.test.ts` | Planned |
| UNIT-03 | Unit | BR-11, AC-48 | Email normalization and format | Input is trimmed and lower-cased. More than 254 characters or a missing `@` / domain is rejected. | `server/tests/lab-03/credentials.test.ts` | Planned |
| UNIT-04 | Unit | BR-17, BR-18, AC-14 | Session token and expiry | Token is 32 random bytes in base64url. The stored SHA-256 hash is not the token. `expiresAt` is created time + 8 h. Expired and revoked sessions are treated as invalid. | `server/tests/lab-03/session.test.ts` | Planned |
| UNIT-05 | Unit | BR-16, AC-07 | Login throttle | The 5th failure within 15 min locks the email; the lock ends after 15 min. Success resets the counter. Unknown and known emails are treated identically. | `server/tests/lab-03/login-throttle.test.ts` | Planned |
| API-01 | API | AC-01, BR-01 | Valid login | `200`. `Set-Cookie` has `HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`. The body holds only `id`, `name`, `email`, `role`, `mustChangePassword`. A `Session` row is created and `lastLoginAt` is set. | `server/tests/lab-03/auth.api.test.ts` | Planned |
| API-02 | API | AC-05, AC-08, BR-14 | Invalid credentials and login input | Wrong password, unknown email, and a user with no password hash return byte-identical `401 INVALID_CREDENTIALS` with no cookie. A missing or non-string field returns `400` and does not count as a failed attempt. | `server/tests/lab-03/auth.api.test.ts` | Planned |
| API-03 | API | AC-06, BR-15 | Inactive account login | The correct password returns `403 ACCOUNT_INACTIVE` with no account fields and no `Session` row. A wrong password returns the generic `401`. | `server/tests/lab-03/auth.api.test.ts` | Planned |
| API-04 | API | AC-07, BR-16 | Login throttling | After 5 failures the 6th attempt returns `429` with `Retry-After`, even with the correct password. An unknown email behaves the same. | `server/tests/lab-03/auth.api.test.ts` | Planned |
| API-05 | API | AC-02, AC-10, BR-02, BR-21 | Mandatory password change and completion | Login returns `mustChangePassword: true`. A valid change returns `200` with the flag false. The user's second session returns `401` while the current session keeps working. | `server/tests/lab-03/auth.api.test.ts` | Planned |
| API-06 | API | AC-09, AC-11, BR-13, BR-21 | Change-password validation and voluntary change | Each rule returns `400` with the matching `fieldErrors`. A wrong current password returns `400`, not `401`, and the session survives. After a voluntary change the old password fails and the new one works. | `server/tests/lab-03/auth.api.test.ts` | Planned |
| API-07 | API | AC-12, AC-13, AC-14, BR-19, BR-20 | Current user, logout, and expiry | `/auth/me` returns the five fields, ignores `?userId=`, and works while a change is required. Logout returns `204` and clears the cookie; a replayed cookie gets `401`. Logout without a cookie returns `204`. A session with past `expiresAt` gets `401`. | `server/tests/lab-03/auth.api.test.ts` | Planned |
| SEC-01 | Security | AC-15, BR-12, BR-17 | Secrets never exposed | No auth or admin response body or header (except `Set-Cookie`) contains a password, `passwordHash`, or token. The database stores only token hashes. Captured server logs contain no password or token. | `server/tests/lab-03/auth.api.test.ts` | Planned |
| SEC-02 | Security | BR-14 | Account-existence timing | Login for an unknown email still performs one bcrypt comparison (spied), matching the known-email path. | `server/tests/lab-03/auth.api.test.ts` | Planned |
| MIG-01 | Migration | AC-56, BR-57, FR-50 | Lab 3 migration on Lab 2 data | Row counts and ids for Tickets, Attachments, Categories, and Related Systems are unchanged. Development Requesters become `User` rows with role `Requester`. Every `Ticket.requesterId` resolves. `itPriority` equals `requestedPriority`. `OnHold` rows become `WaitingForRequester`. Emails are lower-cased. | `server/tests/lab-03/migration.test.ts` | Planned |
| MIG-02 | Migration | AC-57, BR-58 | Initial passwords for migrated Requesters | A migrated Requester with no hash gets the generic `401`. After an Administrator sets an initial password, login succeeds with `mustChangePassword: true`. | `server/tests/lab-03/migration.test.ts` | Planned |
| MIG-03 | Migration | AC-58, BR-59 | Seed idempotency | Running the seed twice creates no duplicates. The §7.8 counts and states are met: ≥4 active + 1 inactive Requesters, ≥3 active + 1 inactive IT Staff, ≥1 active Administrator, Requesters D–E needing a change, and all eight statuses. Documented credentials work. A non-seed user is untouched. | `server/tests/lab-03/seed.test.ts` | Planned |
| MIG-04 | Migration | AC-56 | Database verification script | Every check in `verify-lab3.sql` reports pass after migrate + seed: constraints, indexes, enums, and the preserved-data checks. | `server/tests/lab-03/seed.test.ts` (executes `server/prisma/verify-lab3.sql`) | Planned |
| UI-01 | UI | AC-08, AC-61 | Login validation and controls | Empty or malformed fields show field messages and `fetch` is not called. Focus starts on Email. The show-password toggle switches the input type and `aria-pressed`. | `client/tests/lab-03/Login.test.tsx` | Planned |
| UI-02 | UI | AC-08 | Login busy state | While the request is pending, Sign In is disabled with "Signing in…". A second submit sends no second request. | `client/tests/lab-03/Login.test.tsx` | Planned |
| UI-03 | UI | AC-05, AC-06, AC-07, AC-59 | Login failure feedback | `401` shows "Invalid email or password…", clears Password, and keeps Email. `403 ACCOUNT_INACTIVE`, `429`, and network errors show their documented banners with `role="alert"`. | `client/tests/lab-03/Login.test.tsx` | Planned |
| UI-04 | UI | AC-01, AC-02 | Login success routing | Each role lands on its home screen. `mustChangePassword` routes to `/change-password`. A permitted `returnTo` is honored; an unpermitted or external one is ignored. | `client/tests/lab-03/Login.test.tsx` | Planned |
| UI-05 | UI | AC-09 | Password checklist | Each checklist item announces met or not met live. Boundary inputs of 7/8/72/73 characters and each missing character class update the correct item. | `client/tests/lab-03/ChangePassword.test.tsx` | Planned |
| UI-06 | UI | AC-09, AC-59 | Change-password errors | A confirmation mismatch or unmet rule blocks the request. A `400` with `fieldErrors.currentPassword` or `newPassword` shows beside that field. A failure banner keeps all values. | `client/tests/lab-03/ChangePassword.test.tsx` | Planned |
| UI-07 | UI | AC-02, AC-10 | Mandatory mode | Minimal header with Log Out only: no navigation and no Cancel. The warning banner is shown. Success routes to the role home. | `client/tests/lab-03/ChangePassword.test.tsx` | Planned |
| UI-08 | UI | AC-11 | Voluntary mode | Full shell and a Cancel button that returns to the previous screen. Success returns there with "Your password has been changed." | `client/tests/lab-03/ChangePassword.test.tsx` | Planned |

## 3. Issue: Authorization Middleware

Covers role and ownership guards on every protected route, the application shell, and client route guards.

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UNIT-06 | Unit | BR-08, AC-16, AC-17 | Guard check order | With mocked requests, the guard chain fails at the first broken step, in this order: session `401`, password gate `403`, role `403`, shape `400`, existence/ownership `404`, owner authority `403`. | `server/tests/lab-03/auth-middleware.test.ts` | Planned |
| API-08 | API | AC-04, BR-04, BR-09 | Requester requests Internal Notes | `GET` and `POST /internal-notes` as a Requester, on their own Ticket, another Requester's Ticket, a nonexistent id, and a non-numeric id, all return an identical `403` with no note data. No note is created. | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| SEC-03 | Security | AC-16, FR-17 | Unauthenticated access matrix | Every protected endpoint in `api-spec.md` §16 is called without a cookie. Each returns `401 UNAUTHENTICATED` with no data and a cookie-clearing header. | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| SEC-04 | Security | AC-02, BR-02 | Password-change gate matrix | A user with `mustChangePassword` calls every protected endpoint. All return `403 PASSWORD_CHANGE_REQUIRED` except `/auth/me`, `/auth/logout`, and `/auth/change-password`. | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| SEC-05 | Security | AC-17, BR-05, BR-07 | Requester denied staff and admin operations | A Requester calling queue, assignable users, claim, owner, IT Priority, status (including setting their own Ticket to Resolved or Closed), and every `/api/admin/...` endpoint gets `403`. The database is unchanged. | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| SEC-06 | Security | AC-17, AC-55, BR-49 | IT Staff denied admin endpoints | IT Staff calling each `/api/admin/users...` endpoint gets `403` before lookup, identical for existing and nonexistent user ids. | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| SEC-07 | Security | AC-20, AC-45, BR-23, BR-25 | Role-restricted writes | IT Staff and Administrators get `403` on `POST /api/tickets`, attachment `POST`, and attachment `DELETE`. No Ticket or Attachment change occurs. | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| SEC-08 | Security | AC-21, BR-09 | Cross-Requester access without leaks | Requester B calls detail, attachment list, download, upload, delete, public comments `GET`/`POST`, and problem-resolved on A's Ticket. Each returns a `404` whose status and body are identical to a nonexistent id. | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| SEC-09 | Security | BR-08 | Check-order leaks | Unauthenticated + invalid id → `401`. Gate + wrong role → `403 PASSWORD_CHANGE_REQUIRED`. Requester + invalid id on a staff route → `403`, not `400`. | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| SEC-10 | Security | AC-03, BR-03 | Client-supplied `requesterId` ignored | A create body with another user's `requesterId` saves the caller as Requester. `GET /tickets/mine?requesterId=<other>` returns only the caller's Tickets. | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| SEC-11 | Security | AC-19, FR-19 | Removed Lab 2 routes | `GET /api/development-requesters`, `/api/requesters/:id/tickets[...]` (all methods), and `GET /api/tickets?requesterId=` return `404 NOT_FOUND`, even when authenticated. | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| SEC-12 | Security | BR-22, AC-50 | Role read per request | After an Administrator changes IT Staff to Requester, that user's existing session gets `403` on the queue and `200` on `/tickets/mine` on its next requests. | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| SEC-13 | Security | AC-25, BR-26 | Requester responses exclude internal data | A recursive key scan of the Requester's detail, `/tickets/mine`, and public comments responses finds no `itPriority`, `allowedStatusTransitions`, Internal Note text, owner `id`, or staff email. | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| SEC-14 | Security | AC-59, BR-60 | Safe errors | With a throwing Prisma stub, representative endpoints return `500 INTERNAL_ERROR` with a generic message and no stack, SQL, path, or Prisma text. A malformed JSON body returns `400`. | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| SEC-15 | Security | BR-17 | CORS and cookie CSRF posture | The allowed origin receives the exact `Access-Control-Allow-Origin` with credentials `true`. A foreign origin receives no allow-origin header. `*` is never returned. The session cookie has `SameSite=Lax` and `HttpOnly`. | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| UI-09 | UI | AC-18, FR-13 | Shell identity and profile menu | The header shows the user name and role badge. The profile menu shows name, email, role, Change Password, and Log Out. It opens with `aria-expanded` and closes on Escape. | `client/tests/lab-03/AppShell.test.tsx` | Planned |
| UI-10 | UI | AC-18, FR-14 | Role navigation | Requester sees exactly My Tickets and Create Ticket. IT Staff sees exactly Ticket Queue. Administrator sees exactly User Management and Ticket Queue. No other destinations are rendered. | `client/tests/lab-03/AppShell.test.tsx` | Planned |
| UI-11 | UI | AC-13 | Logout | Log Out shows "Signing out…". Even when the API fails, the client clears user and cached data and shows Login with "You have signed out." | `client/tests/lab-03/AppShell.test.tsx` | Planned |
| UI-12 | UI | AC-13, AC-16, FR-15 | Unauthenticated guard | The Session Check state renders while `/auth/me` is pending. A `401` from `/auth/me` redirects to `/login?returnTo=<path>`, and no protected screen content renders. | `client/tests/lab-03/AuthGuard.test.tsx` | Planned |
| UI-13 | UI | AC-02 | Password-change guard | With `mustChangePassword`, navigating to `/my-tickets`, `/queue`, or `/admin/users` lands on `/change-password`. An API `403 PASSWORD_CHANGE_REQUIRED` also redirects there. | `client/tests/lab-03/AuthGuard.test.tsx` | Planned |
| UI-14 | UI | AC-18, AC-55, FR-16 | Forbidden and Not Found | A Requester on `/queue` or `/admin/users` and IT Staff on `/admin/users` see the Forbidden panel with their role and a home button, and the URL is kept. Unknown paths show Not Found. | `client/tests/lab-03/AuthGuard.test.tsx` | Planned |
| UI-15 | UI | AC-14 | Session ended mid-use | An API `401` on any screen clears cached data and routes to `/login?reason=expired`, showing "Your session has ended…". | `client/tests/lab-03/AuthGuard.test.tsx` | Planned |
| UI-16 | UI | AC-19, FR-19 | Selector and client state removed | No Requester selector, "Testing as" chip, or Change Requester control renders for any role. `toktickit.lab2.selectedRequesterId` is removed from `localStorage` at startup. Identity is never written to `localStorage` or `sessionStorage`. | `client/tests/lab-03/AuthGuard.test.tsx` | Planned |

## 4. Issue: Requester Regression

Covers removal of the Development Requester selector, authenticated identity, Public Comments, and "Problem Appears Resolved".

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-09 | API | AC-22, BR-23, BR-37 | Authenticated Ticket creation | `201`. `requester` is the caller, `currentStatus` is `New`, `ticketOwnerId` is null, `itPriority` equals `requestedPriority`. Lab 2 validation and the duplicate window still apply. | `server/tests/lab-03/requester-regression.api.test.ts` | Planned |
| API-10 | API | AC-22, BR-24 | My Tickets under identity | Lab 2 search, filters (all eight statuses), sorts, and pagination work, scoped to the caller. Rows add `ticketOwner` (`{name}` or null) and `problemAppearsResolvedAt`. | `server/tests/lab-03/requester-regression.api.test.ts` | Planned |
| API-11 | API | AC-22, BR-25 | Attachment lifecycle at new paths | The owning Requester can upload, list, download, and soft-remove with a reason. Removed download returns `410`. Type, size, and count limits are unchanged. | `server/tests/lab-03/requester-regression.api.test.ts` | Planned |
| API-12 | API | AC-23, BR-43, BR-47 | Requester Public Comment | `POST` on own Ticket returns `201`. The author is taken from the session (a spoofed `authorId` or `createdAt` is ignored), `meta.ticketUpdatedAt` equals the new `updatedAt`, and IT Staff `GET` sees the comment last. | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| API-13 | API | AC-24, BR-05, BR-48 | Problem Appears Resolved | `200` with `currentStatus` unchanged, the flag set, and the comment "Problem appears resolved." (plus the note when given). Otherwise: repeat → `409 ALREADY_REPORTED_RESOLVED`, Resolved → `409 ACTION_NOT_ALLOWED_FOR_STATUS`, Closed → `409 TICKET_CLOSED`, IT Staff → `403`. The flag clears when the Ticket moves to Reopened. | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| MIG-05 | Regression | AC-22, BR-24 | Lab 1–2 server suites migrated | The existing `server/tests/lab-01` and `lab-02` suites use authenticated agents and the new paths. The ownership assertions expect `404`. All pass. `requester.api.test.ts` is replaced by SEC-11. | `server/tests/lab-01/*.test.ts`, `server/tests/lab-02/*.api.test.ts` | Planned |
| MIG-06 | Regression | AC-22 | Lab 2 client suites migrated | `CreateTicket`, `MyTickets`, `RequesterTicketDetail`, `AttachmentSection`, and `lab2-style` tests run with a mocked authenticated user and pass. `RequesterSelection.test.tsx` is removed together with the component. | `client/tests/lab-02/*.test.tsx` | Planned |
| UI-17 | UI | AC-22, FR-20 | Create Ticket identity | The Requester field shows the signed-in name read-only. The request body contains no `requesterId`. Success offers View Ticket, Create another ticket, and Done. | `client/tests/lab-03/RequesterRegression.test.tsx` | Planned |
| UI-18 | UI | AC-22, FR-21 | My Tickets changes | The Assigned To column shows owner or "Unassigned". The resolution badge shows when set. The Status filter lists the eight statuses. No Requester chip appears. | `client/tests/lab-03/RequesterRegression.test.tsx` | Planned |
| UI-19 | UI | AC-23, AC-26, FR-24 | Requester Public Comments | The thread renders. Empty, whitespace, or 2001-character input shows inline errors with no request. Posting sets the busy state. Success appends the entry and clears and refocuses the textarea. A Closed Ticket replaces the composer with a note. A failure keeps the text. | `client/tests/lab-03/RequesterTicketDetail.test.tsx` | Planned |
| UI-20 | UI | AC-24, FR-25 | Problem Appears Resolved dialog | The action shows only for New, Open, In Progress, Waiting for Requester, and Reopened when not yet reported. Cancel sends nothing. Confirm sends the optional note and shows the success banner; the Status badge is unchanged. A `409` shows a warning with Reload. | `client/tests/lab-03/RequesterTicketDetail.test.tsx` | Planned |
| UI-21 | UI | AC-21, AC-25 | Requester detail protection | A `404` shows "This ticket is not available." with no Retry. The Internal Notes section, IT Priority, and operation controls are not in the DOM (`queryBy…` returns null). | `client/tests/lab-03/RequesterTicketDetail.test.tsx` | Planned |
| UI-22 | UI | AC-27, BR-45 | Safe rendering | A body `<b>bold</b><script>x</script>` with newlines renders as literal text. No `b` or `script` element is created, and line breaks are preserved (`pre-wrap`). | `client/tests/lab-03/CommentThreads.test.tsx` | Planned |
| UI-23 | UI | AC-26, BR-46 | Thread display | Entries are oldest first with author name, "(you)", role badge, and `<time>`. The composer shows an "N / 2000" counter. No edit or delete control exists on any entry. | `client/tests/lab-03/CommentThreads.test.tsx` | Planned |

## 5. Issue: IT Staff Ticket Queue

Covers the queue API, responsive UI, search, filters, sorting, and pagination.

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UNIT-07 | Unit | BR-28–BR-31, AC-31, AC-32 | Queue query parsing | Defaults are `ticketDate asc`, page 1, size 20. Every allowed value is accepted. The following are rejected with field errors: `statusGroup` with `currentStatus`, repeated keys, size 15, page 0, search over 200 characters, and unknown sort or status. | `server/tests/lab-03/queue-query.test.ts` | Planned |
| API-14 | API | AC-28, FR-26, BR-27 | Queue content | IT Staff and Administrators receive Tickets from all Requesters with the documented row shape: category and requester objects, both priorities, and owner with role or null. | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| API-15 | API | AC-29, BR-28 | Queue search | Case-insensitive partial matches on Ticket Number, Summary, Requester name, and Requester email each return only matching Tickets. | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| API-16 | API | AC-30, BR-29 | Queue filters | `statusGroup` `active` and `closed`, each single status, `ownership` `mine` and `unassigned`, `itPriority`, `requestedPriority`, and `categoryId` each filter correctly. Combined filters use AND. | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| API-17 | API | AC-30, BR-32 | Queue counts | `meta.counts` (`active`, `unassigned`, `assignedToMe`) equal the totals of those views. They are unchanged by search or other filters, and `assignedToMe` differs per caller. | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| API-18 | API | AC-31, BR-30 | Queue sorting | The default is oldest Created Date first. Each sortable field works in both directions. Priority descending is Urgent → Low. Ties break on Ticket Number ascending. | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| API-19 | API | AC-32, BR-31 | Queue pagination and invalid queries | `page`, `pageSize`, `totalItems`, and `totalPages` are accurate for sizes 10, 20, and 50. A page beyond the last returns empty `data` with correct `meta`. Invalid values return `400` with field errors. | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| UI-24 | UI | AC-28 | Queue table content | Seven columns render in order. Created Date sits under the Ticket link, and Requester · Category under Summary. Badges show "IT:" for IT Priority, the owner as "You", a name, or "Unassigned", and the resolution indicator. The Ticket link opens `/tickets/:id`. | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Planned |
| UI-25 | UI | AC-29–AC-32 | Queue controls | Quick views send the documented parameters, expose `aria-pressed`, and show counts. Search runs on submit only. Filters, sort, and size reset to page 1. A manual Status or Ownership change un-presses a quick view. Clear filters restores the Active defaults. Pagination is disabled at the ends. | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Planned |
| UI-26 | UI | AC-33, AC-59 | Queue feedback states | Loading shows the skeleton (`aria-busy`) with "–" counts. The empty state appears only in the All view. No-results shows Clear filters, with Unassigned-specific wording. A `400` resets with a warning. A `500` shows failure with Retry. A `403` shows the Forbidden panel. | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Planned |

## 6. Issue: IT Staff Ticket Operations

Covers ownership, IT Priority, the status workflow, Public Comments, Internal Notes, and Attachment continuity.

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UNIT-08 | Unit | BR-39, AC-39, AC-40 | Transition matrix | All 64 from→to pairs across the eight statuses are checked. Exactly the pairs in the BR-39 table are permitted. Same-status and terminal-origin transitions are rejected. | `server/tests/lab-03/status-transitions.test.ts` | Planned |
| UNIT-09 | Unit | BR-38, BR-40, AC-41 | Owner-required targets and caller permissions | `allowedStatusTransitions` omits Open, In Progress, Waiting for Requester, and Resolved when unassigned. It is empty for non-owner IT Staff, Requesters, and terminal Tickets. The `permissions` object is computed correctly for owner, Administrator, non-owner IT Staff, and unassigned cases. | `server/tests/lab-03/status-transitions.test.ts` | Planned |
| UNIT-10 | Unit | BR-45, AC-26 | Thread content normalization | CRLF → LF, control characters except `\n` and `\t` removed, and trimming applied. Length 0 and whitespace-only are rejected, 1 and 2000 accepted, 2001 rejected. | `server/tests/lab-03/thread-content.test.ts` | Planned |
| API-20 | API | FR-33, FR-42, AC-24 | Staff Ticket Detail | IT Staff and Administrators receive `StaffTicketDetail` for any Ticket: `itPriority`, owner with role, `permissions`, `allowedStatusTransitions`, and `problemAppearsResolvedAt`. A nonexistent id returns `404`. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-21 | API | AC-36, BR-33 | Assignable users | Returns only active IT Staff and Administrators, sorted by name then id. No Requesters or inactive users. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-22 | API | AC-34, BR-34 | Claim | Claiming an unassigned Ticket returns `200`. The owner is the caller and `updatedAt` changes. The queue row shows the owner. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-23 | API | AC-35, BR-34 | Claim conflicts | Two simultaneous claims give exactly one `200` and one `409 TICKET_ALREADY_CLAIMED`, and the owner equals the winner. Claiming an owned Ticket returns `409`. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-24 | API | AC-36, BR-35 | Assign an unassigned Ticket | Any IT Staff member can assign to another active IT Staff member or Administrator (`200`). A Requester, inactive, nonexistent, or null target returns `400`. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-25 | API | AC-37, BR-35 | Reassign an owned Ticket | The owner or an Administrator can reassign (`200`). Non-owner IT Staff gets `403`. The same owner returns `400`. An owner changed concurrently returns `409 STALE_TICKET`. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-26 | API | AC-38, BR-37, BR-38 | IT Priority | A new Ticket copies Requested Priority. The owner and Administrators can change it (`200`) and `requestedPriority` is unchanged. Non-owner IT Staff and unassigned-Ticket staff get `403`. Resending the same value leaves `updatedAt` unchanged. An invalid or null value returns `400`. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-27 | API | AC-39, BR-39 | Permitted status walk | The owner walks New→Open→In Progress→Waiting for Requester→In Progress→Resolved→Reopened→In Progress→Resolved→Closed, each step `200`. Each response carries the updated transitions. Reopened clears `problemAppearsResolvedAt`. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-28 | API | AC-40, BR-39 | Forbidden status changes | New→Closed, Open→Resolved, and same-status changes return `409 INVALID_STATUS_TRANSITION` with the status unchanged. An unknown status returns `400`. Non-owner IT Staff gets `403`. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-29 | API | AC-41, BR-40 | Owner required | An Administrator on an unassigned New Ticket: → Open returns `409 OWNER_REQUIRED`; → Cancelled returns `200`. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-30 | API | AC-42, BR-41 | Terminal Tickets | On Closed and on Cancelled Tickets, claim, owner, IT Priority, status, public comment, and problem-resolved each return `409 TICKET_CLOSED`. An Internal Note returns `201`. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-31 | API | AC-44, BR-42 | Stale updates | Claim, owner, IT Priority, and status requests with an old `expectedUpdatedAt` return `409 STALE_TICKET`, and the database is unchanged. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-32 | API | FR-39, AC-23, BR-43 | Staff Public Comments | IT Staff and Administrators can post on any active Ticket (`201`). The author role is correct, `updatedAt` changes, and the owning Requester sees the comment. | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| API-33 | API | AC-43, BR-44, BR-47 | Internal Notes for staff | IT Staff `POST` returns `201` with the session author. `GET` is oldest first. Administrators see the notes. The Ticket `updatedAt` is unchanged. Notes on Closed Tickets are allowed. | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| API-34 | API | AC-26, BR-45 | Comment and note validation | For both endpoints: empty, whitespace-only, and 2001 characters return `400` with field messages. 2000 characters returns `201`. A non-string body returns `400`. Control characters are stripped in the stored body. | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| API-35 | API | AC-45, BR-25 | Attachment continuity for staff | IT Staff list metadata including removed items, download active files (`200`, correct MIME type), and get `410` for removed files. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| UI-27 | UI | AC-34–AC-37 | Ownership controls | Unassigned shows Claim plus Assign-to. An owner or Administrator sees Reassign-to excluding the current owner. Non-owner IT Staff sees read-only text with an explanation. Buttons show busy states. Success refreshes the Owner badge. | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-28 | UI | AC-38 | IT Priority control | The select plus Save stays disabled until the value changes. The helper shows the Requested Priority. Non-owners see a read-only badge and explanation. Success text reads "IT Priority updated to …". | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-29 | UI | AC-39, AC-40, AC-42 | Status control and confirmations | Only `allowedStatusTransitions` are listed. Resolved, Closed, Reopened, and Cancelled open their confirmation dialogs: "Keep Current Status" sends nothing, Confirm sends the request. Open, In Progress, and Waiting for Requester send directly. Terminal Tickets show the no-further-changes message. | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-30 | UI | AC-35, AC-41, AC-44, AC-59 | Operation conflicts and failures | `TICKET_ALREADY_CLAIMED`, `OWNER_REQUIRED`, `INVALID_STATUS_TRANSITION`, and `TICKET_CLOSED` show a warning and trigger a reload. `STALE_TICKET` shows the card banner with Reload. A `403` shows a permission message. A `500` keeps the selection. The latest `updatedAt` is sent as `expectedUpdatedAt`. | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-31 | UI | AC-43, FR-40 | Internal Notes separation | The Internal Notes section shows "Internal — never visible to the requester" with the "Post Internal Note" button, while Public Comments shows "Public — visible to the requester" with "Post Public Comment". Drafts are independent. Posting a note does not change the displayed Last Updated. The composer is present on Closed Tickets. | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-32 | UI | AC-24, AC-45, FR-41, FR-42 | Read-only information and Attachments | Ticket fields use read-only styling. Attachments show Download for active items and removed metadata for removed items. No Upload or Remove controls exist. The resolution strip shows when set. | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-33 | UI | AC-59, FR-16 | Staff detail page states | Loading spinner. `404` shows "This ticket does not exist." with Back to Queue. `403` shows the Forbidden panel. A failure offers Retry. A failing section (Attachments, comments, or notes) has its own Retry while the others render. | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Planned |

## 7. Issue: Administrator User Management

Covers the list, search, role filter, create, edit, one-role assignment, activation, new initial password, and safety rules.

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UNIT-11 | Unit | BR-50, BR-51, AC-49 | User field validation | Name of 1 character rejected, 2 and 100 accepted, 101 rejected. Role: each of the three accepted; `SuperUser`, arrays, null, and missing rejected. `isActive` must be boolean. Unknown fields and an empty patch are rejected. | `server/tests/lab-03/user-validation.test.ts` | Planned |
| UNIT-12 | Unit | BR-53, BR-54 | Administrator safety decision | Self-deactivation is always blocked. Demoting or deactivating an active Administrator is blocked only when no other *active* Administrator exists, and inactive Administrators do not count. | `server/tests/lab-03/user-validation.test.ts` | Planned |
| API-36 | API | AC-46, BR-56 | User list, search, role filter | Search by partial name or email is case-insensitive, and the role filter works. Results are sorted by name then id with `meta.totalItems`. `page` and `sortBy` are ignored. An invalid or repeated role returns `400`. No `passwordHash` appears. | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-37 | API | AC-47, BR-50 | Create user | `201` with `mustChangePassword: true` and a stored bcrypt hash. The new user can log in and is gated until they change the password. | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-38 | API | AC-48, BR-11 | Duplicate email | Creating or editing with ` A@Example.com` when `a@example.com` exists returns `409 EMAIL_ALREADY_IN_USE` with `fieldErrors.email`. Of two simultaneous creates with one email, exactly one succeeds. | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-39 | API | AC-49, BR-50 | Invalid input and role | Invalid role, multiple roles, missing role, short name, bad email, weak initial password, and unknown fields each return `400`. No user is created or changed. | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-40 | API | AC-50, BR-51 | Edit user | Name, email, role, and `isActive` update. The role applies on the user's next request. Resending the same values returns `unassignedTicketCount: 0` and `sessionsRevoked: false`. | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-41 | API | AC-51, BR-55 | Set new initial password | `200` with `mustChangePassword: true`. The target's live sessions return `401`. Login with the new password is gated. Rule failures return `400`. Works for inactive users. For self, the caller's own session is revoked. | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-42 | API | AC-52, BR-53 | No self-deactivation | An Administrator patching self with `isActive: false` gets `409 SELF_DEACTIVATION_BLOCKED` and stays active. | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-43 | API | AC-53, BR-54 | Last active Administrator | The sole active Administrator changing their own role returns `409 LAST_ACTIVE_ADMINISTRATOR`. An inactive Administrator does not count. With a second active Administrator, the same change succeeds. | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-44 | API | AC-54, BR-36, BR-52 | Deactivation and demotion effects | Deactivating IT Staff revokes sessions (next request `401`), makes login return `403 ACCOUNT_INACTIVE`, and unassigns active Tickets (Closed ones are kept), with the count reported. Demoting to Requester also unassigns. The user remains listed. `DELETE /api/admin/users/:id` returns `404`. | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| UI-34 | UI | AC-46 | User list and search | Columns: Name ("(you)"), Email, Role badge, Status badge with "Must change password", and Edit. Search runs on submit, role on change, and Clear resets. No pagination or sort controls exist. | `client/tests/lab-03/UserManagement.test.tsx` | Planned |
| UI-35 | UI | AC-47, AC-49 | Create User panel | Fields: role select required, Active switch on by default, password checklist, and confirm field. Invalid input focuses the first invalid field and sends no request. Save shows busy. Success closes the panel and shows a banner, and the list reloads. | `client/tests/lab-03/UserManagement.test.tsx` | Planned |
| UI-36 | UI | AC-48 | Duplicate email feedback | A `409 EMAIL_ALREADY_IN_USE` shows "This email is already used by another account." below Email, and all entered values remain. | `client/tests/lab-03/UserManagement.test.tsx` | Planned |
| UI-37 | UI | AC-50, AC-54 | Edit User panel | Fields are prefilled. Save Changes stays disabled until a change. Role-away and deactivate warnings appear. Success shows "Saved changes to …" plus the unassigned-ticket count. | `client/tests/lab-03/UserManagement.test.tsx` | Planned |
| UI-38 | UI | AC-51 | Set New Initial Password | Confirmation is required ("Sign <name> out…"). Success shows the signed-out text. For self, a warning shows and success routes to Login. | `client/tests/lab-03/UserManagement.test.tsx` | Planned |
| UI-39 | UI | AC-52, AC-53 | Administrator safety feedback | When editing self, the Active switch is disabled with the helper text. A `409 SELF_DEACTIVATION_BLOCKED` or `LAST_ACTIVE_ADMINISTRATOR` shows the documented banner. After a successful change of one's own role away from Administrator, the session reloads and User Management becomes Forbidden. | `client/tests/lab-03/UserManagement.test.tsx` | Planned |
| UI-40 | UI | AC-55, AC-59 | User Management states | Loading. No-results with Clear. List failure with Retry. A `403` shows the Forbidden panel. A `404` shows "This user no longer exists." Closing with unsaved changes asks to Discard or Keep Editing. | `client/tests/lab-03/UserManagement.test.tsx` | Planned |

## 8. Issue: E2E and Visual Inspection

Covers Playwright journeys, keyboard and axe accessibility checks, responsive layout checks, desktop/tablet/mobile screenshots, and cross-screen UI style tests.

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| E2E-01 | E2E | AC-01, AC-18 | Login per role | Requester A, IT Staff, and Administrator each land on their home screen with name, role badge, and the correct navigation. | `e2e/lab-03/authentication.spec.ts` | Planned |
| E2E-02 | E2E | AC-02, AC-10 | Initial password login and change | Requester D signs in and is held on Change Password. Typing `/my-tickets` stays blocked. After a valid change, the normal app opens and the old password no longer works. | `e2e/lab-03/authentication.spec.ts` | Planned |
| E2E-03 | E2E | AC-05, AC-06, AC-08 | Login failures | A wrong password shows the generic banner. The inactive account shows the inactive banner. Empty fields show validation. Sign In shows the busy state while pending. | `e2e/lab-03/authentication.spec.ts` | Planned |
| E2E-04 | E2E | AC-13 | Access blocked after logout | After Log Out, the browser Back button and a typed `/my-tickets` both show Login. Replaying the old cookie with Playwright `request` returns `401`. | `e2e/lab-03/authentication.spec.ts` | Planned |
| E2E-05 | E2E | AC-11 | Voluntary password change | From the profile menu the user changes their password, signs out, and signs in with the new password. | `e2e/lab-03/authentication.spec.ts` | Planned |
| E2E-06 | E2E | AC-18, AC-55 | Forbidden destinations | A Requester typing `/queue` or `/admin/users`, and IT Staff typing `/admin/users`, see the Forbidden panel. Navigation never lists those destinations. | `e2e/lab-03/authentication.spec.ts` | Planned |
| E2E-07 | E2E | AC-19, AC-22 | Requester Lab 2 journey | A signed-in Requester creates a Ticket with an attachment, finds it in My Tickets with search and filter, opens detail, downloads, and soft-removes the file with a reason. No selector appears anywhere. | `e2e/lab-03/requester-regression.spec.ts` | Planned |
| E2E-08 | E2E | AC-23, AC-24 | Public Comment and resolution signal | A Requester posts a comment and confirms Problem Appears Resolved. The indicator shows, and the status is unchanged after reload. | `e2e/lab-03/requester-regression.spec.ts` | Planned |
| E2E-09 | E2E | AC-21 | Cross-Requester direct access | Requester B opens A's Ticket URL and sees "not available". B's direct API calls to A's detail and attachments return `404`. | `e2e/lab-03/requester-regression.spec.ts` | Planned |
| E2E-10 | E2E | AC-28–AC-31 | Queue work-finding | IT Staff use the quick views with counts, search by Requester name, filter by IT Priority, sort by IT Priority descending, page through, and open a Ticket. | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| E2E-11 | E2E | AC-34, AC-38, AC-39 | Claim and progress a Ticket | IT Staff claim a New Ticket, set IT Priority, and move it Open → In Progress → Resolved, confirming the Resolved dialog. The queue reflects each change, and the Requester sees Resolved. | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| E2E-12 | E2E | AC-36, AC-37 | Assign and reassign | IT Staff 1 assigns an unassigned Ticket to IT Staff 2. IT Staff 2 reassigns it to IT Staff 3. IT Staff 1 now sees read-only ownership. | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| E2E-13 | E2E | AC-04, AC-27, AC-43 | Public vs Internal separation, with direct-API evidence | IT Staff post an Internal Note and a Public Comment. The Requester signs in and sees only the Public Comment, rendered as literal text. The Requester's direct `GET /internal-notes` returns `403` with no note text. | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| E2E-14 | E2E | AC-44 | Stale update across two sessions | Two staff contexts open one Ticket. One changes status. The other's change shows "This ticket changed since you opened it." and Reload shows the new state. | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| E2E-15 | E2E | AC-46, AC-47 | Create user and first login | The Administrator searches and filters by role, creates an IT Staff user, and that user signs in and is forced to change the password. | `e2e/lab-03/user-administration.spec.ts` | Planned |
| E2E-16 | E2E | AC-48, AC-49 | Admin validation | A duplicate email (different case) shows the field error. Missing role and weak password block saving. | `e2e/lab-03/user-administration.spec.ts` | Planned |
| E2E-17 | E2E | AC-50, AC-51, AC-54 | Edit, reset, deactivate | The Administrator edits a name and role, sets a new initial password (the user's next login requires a change), then deactivates the user, whose login shows the inactive banner and whose Tickets show Unassigned in the queue. | `e2e/lab-03/user-administration.spec.ts` | Planned |
| E2E-18 | E2E | AC-52, AC-53 | Administrator safety rules | The Administrator cannot switch off their own Active state (the control is disabled). A direct API attempt returns `409`. The sole active Administrator changing their own role sees the last-administrator banner. | `e2e/lab-03/user-administration.spec.ts` | Planned |
| A11Y-01 | Accessibility | AC-61 | Keyboard: authentication | Login, the profile menu (Enter, Arrow keys, Escape), and Change Password all work by keyboard only with a visible focus ring on every stop. | `e2e/lab-03/accessibility.spec.ts` | Planned |
| A11Y-02 | Accessibility | AC-61 | Keyboard: staff Ticket Detail | Operations and threads are reachable by Tab. Confirmation dialogs trap focus, close on Escape, and return focus to the trigger. The mobile tablist works with arrow keys. | `e2e/lab-03/accessibility.spec.ts` | Planned |
| A11Y-03 | Accessibility | AC-61 | Keyboard: User Management | The panel and offcanvas trap focus and close on Escape. The Active control is operable as `role="switch"`. Validation is announced. | `e2e/lab-03/accessibility.spec.ts` | Planned |
| A11Y-04 | Accessibility | AC-61 | Automated axe scan | Login, Change Password, My Tickets, both Ticket Detail views, the Queue, and User Management report no serious or critical axe violations at 1280px and 390px. | `e2e/lab-03/accessibility.spec.ts` | Planned |
| RESP-01 | Responsive | AC-60 | Login and Change Password layout | No horizontal scroll at 1280, 820, or 390px. The card is centered on desktop and tablet, and full-width with a full-width button on mobile. | `e2e/lab-03/responsive-visual.spec.ts` | Planned |
| RESP-02 | Responsive | AC-60 | Shell layout | Desktop fits on one row, tablet uses two rows, and mobile uses a Menu toggle. All items are reachable and touch targets are ≥44px. | `e2e/lab-03/responsive-visual.spec.ts` | Planned |
| RESP-03 | Responsive | AC-60 | Queue layout | Desktop shows the 7-column table. Tablet stacks the priorities and hides Last Updated. Mobile shows cards. Quick views scroll within their own container. No page overflow at any size. | `e2e/lab-03/responsive-visual.spec.ts` | Planned |
| RESP-04 | Responsive | AC-60 | Staff Ticket Detail layout | Desktop uses two columns with the public and internal composers in different columns. Tablet is a single column in the documented order. Mobile uses the tablist and full-screen dialogs. | `e2e/lab-03/responsive-visual.spec.ts` | Planned |
| RESP-05 | Responsive | AC-60 | Requester detail and My Tickets | Requester screens keep the Lab 2 layouts plus the new sections. The resolution dialog is full-screen on mobile. No clipping of comments or long emails. | `e2e/lab-03/responsive-visual.spec.ts` | Planned |
| RESP-06 | Responsive | AC-60 | User Management layout | Desktop shows the list with a side panel (7/12 + 5/12). Tablet uses an offcanvas. Mobile shows cards with a full-screen panel and sticky buttons. | `e2e/lab-03/responsive-visual.spec.ts` | Planned |
| VIS-01 | Responsive | AC-60, AC-61 | `authentication/` evidence | Screenshots of the `ui-spec.md` §16 states at desktop, tablet, and mobile. Automated checks find no clipped text, overlapping controls, or horizontal overflow. | `e2e/lab-03/responsive-visual.spec.ts` | Planned |
| VIS-02 | Responsive | AC-27, AC-60 | `requester-tickets/` evidence | Screenshots of My Tickets, Requester detail with comments (including the seeded `<b>` comment shown literally), the resolution dialog, and the reported state, plus the same automated checks. | `e2e/lab-03/responsive-visual.spec.ts` | Planned |
| VIS-03 | Responsive | AC-33, AC-60 | `staff-queue/` evidence | Screenshots of the Active view with counts, expanded filters, IT Priority sort, no-results, empty, failure, and loading, plus the automated checks. | `e2e/lab-03/responsive-visual.spec.ts` | Planned |
| VIS-04 | Responsive | AC-60 | `staff-ticket-detail/` evidence | Screenshots of the unassigned, owned, confirmation-dialog, comment-posted, note-posted, non-owner read-only, and stale-conflict states, plus the automated checks. | `e2e/lab-03/responsive-visual.spec.ts` | Planned |
| VIS-05 | Responsive | AC-60 | `user-management/` evidence | Screenshots of the list, search + filter, create panel, duplicate email, edit panel, initial password set, self-deactivation, last-admin, and Forbidden states, plus the automated checks. | `e2e/lab-03/responsive-visual.spec.ts` | Planned |
| STYLE-01 | UI Style | AC-61 | Badge consistency | Status, Requested Priority, IT Priority ("IT:" label), role, owner, and account-status badges all use `zen-badge` with visible text. Priority badges use the Lab 2 `zen-priority-*` classes. | `client/tests/lab-03/lab3-style.test.tsx` | Planned |
| STYLE-02 | UI Style | AC-61 | Editable vs read-only | Staff operations and admin forms use `zen-select`, `zen-input`, and `zen-btn-primary`. Ticket information uses `zen-readonly-value`. Disabled controls use the distinct disabled style. | `client/tests/lab-03/lab3-style.test.tsx` | Planned |
| STYLE-03 | UI Style | AC-61 | Validation placement | On Login, Change Password, the user panel, and both composers, error text is the next sibling of its control, linked by `aria-describedby`, with the `zen-invalid` border. | `client/tests/lab-03/lab3-style.test.tsx` | Planned |
| STYLE-04 | UI Style | AC-43, AC-61 | Public vs Internal distinction | The Internal Notes section uses `zen-warning-banner` and an amber left border. Public Comments uses the pale green strip. The two sections have different headings and button labels. | `client/tests/lab-03/lab3-style.test.tsx` | Planned |
| STYLE-05 | UI Style | AC-61 | Design system unchanged | The `theme.css` token values equal the Lab 2 values. Every new interactive control has a `:focus-visible` outline rule. No new color literals are introduced outside the existing tokens. | `client/tests/lab-03/lab3-style.test.tsx` | Planned |

## 9. Issue: Release Integration

Covers merging `lab3-staging` into `main`, tagging, and the final regression run.

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| MIG-07 | Regression | AC-22, AC-60 | Lab 2 E2E suites migrated | `e2e/lab-02` specs sign in through the shared login helper instead of the selector and pass. Lab 2 screenshots still generate. | `e2e/lab-02/*.spec.ts` | Planned |
| REG-01 | Regression | Definition of Done | Full suite on `main` | After merging `lab3-staging` → `main`, a clean migrate + seed run passes all three commands with 0 failures and 0 skipped. | `npm test --prefix server`, `npm test --prefix client`, `npx playwright test` | Planned |
| REG-02 | Regression | Definition of Done | No disabled tests | A search of all test directories finds no `.skip`, `.only`, `.todo`, `xit`, or `test.fixme`. | `server/tests/lab-03/suite-integrity.test.ts` | Planned |

## 10. Acceptance-Criteria Traceability

Every AC has at least one planned test. Four tests are not listed against any AC. SEC-02 (BR-14 timing) and SEC-15 (BR-17 CORS and cookie posture) trace to Business Rules. REG-01 (full suite on `main`) and REG-02 (no disabled tests) trace to the Definition of Done.

| AC | Planned Tests |
| --- | --- |
| AC-01 | API-01, UI-04, E2E-01 |
| AC-02 | API-05, SEC-04, UI-04, UI-07, UI-13, E2E-02 |
| AC-03 | SEC-10 |
| AC-04 | API-08, E2E-13 |
| AC-05 | API-02, UI-03, E2E-03 |
| AC-06 | API-03, UI-03, E2E-03 |
| AC-07 | UNIT-05, API-04, UI-03 |
| AC-08 | API-02, UI-01, UI-02, E2E-03 |
| AC-09 | UNIT-01, API-06, UI-05, UI-06 |
| AC-10 | API-05, UI-07, E2E-02 |
| AC-11 | API-06, UI-08, E2E-05 |
| AC-12 | API-07 |
| AC-13 | API-07, UI-11, UI-12, E2E-04 |
| AC-14 | UNIT-04, API-07, UI-15 |
| AC-15 | UNIT-02, SEC-01 |
| AC-16 | UNIT-06, SEC-03, SEC-09, UI-12 |
| AC-17 | UNIT-06, SEC-05, SEC-06 |
| AC-18 | UI-09, UI-10, UI-14, E2E-01, E2E-06 |
| AC-19 | SEC-11, UI-16, E2E-07 |
| AC-20 | SEC-07 |
| AC-21 | SEC-08, UI-21, E2E-09 |
| AC-22 | API-09, API-10, API-11, MIG-05, MIG-06, MIG-07, UI-17, UI-18, E2E-07 |
| AC-23 | API-12, API-32, UI-19, E2E-08 |
| AC-24 | API-13, API-20, UI-20, UI-32, E2E-08 |
| AC-25 | SEC-13, UI-21 |
| AC-26 | UNIT-10, API-34, UI-19, UI-23 |
| AC-27 | UI-22, E2E-13, VIS-02 |
| AC-28 | API-14, UI-24, E2E-10 |
| AC-29 | API-15, UI-25, E2E-10 |
| AC-30 | API-16, API-17, UI-25, E2E-10 |
| AC-31 | UNIT-07, API-18, UI-25, E2E-10 |
| AC-32 | UNIT-07, API-19, UI-25 |
| AC-33 | UI-26, VIS-03 |
| AC-34 | API-22, UI-27, E2E-11 |
| AC-35 | API-23, UI-27, UI-30 |
| AC-36 | API-21, API-24, UI-27, E2E-12 |
| AC-37 | API-25, UI-27, E2E-12 |
| AC-38 | API-26, UI-28, E2E-11 |
| AC-39 | UNIT-08, API-27, UI-29, E2E-11 |
| AC-40 | UNIT-08, API-28, UI-29 |
| AC-41 | UNIT-09, API-29, UI-30 |
| AC-42 | API-30, UI-29 |
| AC-43 | API-33, UI-31, STYLE-04, E2E-13 |
| AC-44 | API-31, UI-30, E2E-14 |
| AC-45 | SEC-07, API-35, UI-32 |
| AC-46 | API-36, UI-34, E2E-15 |
| AC-47 | API-37, UI-35, E2E-15 |
| AC-48 | UNIT-03, API-38, UI-36, E2E-16 |
| AC-49 | UNIT-11, API-39, UI-35, E2E-16 |
| AC-50 | SEC-12, API-40, UI-37, E2E-17 |
| AC-51 | API-41, UI-38, E2E-17 |
| AC-52 | UNIT-12, API-42, UI-39, E2E-18 |
| AC-53 | UNIT-12, API-43, UI-39, E2E-18 |
| AC-54 | API-44, UI-37, E2E-17 |
| AC-55 | SEC-06, UI-14, UI-40, E2E-06 |
| AC-56 | MIG-01, MIG-04 |
| AC-57 | MIG-02 |
| AC-58 | MIG-03 |
| AC-59 | SEC-14, UI-03, UI-06, UI-26, UI-30, UI-33, UI-40 |
| AC-60 | RESP-01–RESP-06, VIS-01–VIS-05, MIG-07 |
| AC-61 | UI-01, STYLE-01–STYLE-05, A11Y-01–A11Y-04, VIS-01 |

## 11. Coverage Summary

| Type | Tests | IDs |
| --- | --- | --- |
| Unit | 12 | UNIT-01–UNIT-12 |
| API / Integration | 44 | API-01–API-44 |
| Security / Authorization | 15 | SEC-01–SEC-15 |
| Migration / Regression | 9 | MIG-01–MIG-07, REG-01–REG-02 |
| UI Component | 40 | UI-01–UI-40 |
| UI Style | 5 | STYLE-01–STYLE-05 |
| Responsive / Visual | 11 | RESP-01–RESP-06, VIS-01–VIS-05 |
| Accessibility | 4 | A11Y-01–A11Y-04 |
| End-to-End | 18 | E2E-01–E2E-18 |
| **Total** | **158** | |

## 12. Final Test Status

Recorded after the final run on `main`. Commands run from the repository root after a clean migrate and seed:

```
cd server && npx prisma migrate deploy && npm run prisma:seed && cd ..
npm test --prefix server
npm test --prefix client
npx playwright test
```

| Suite | Command | Result |
| --- | --- | --- |
| Server unit + API + security + migration | `npm test --prefix server` | Not yet run |
| Client unit + UI + style | `npm test --prefix client` | Not yet run |
| E2E + responsive + visual + accessibility | `npx playwright test` | Not yet run |
| **Total** | | **Not yet run** |

## 13. Visual Evidence

`e2e/lab-03/responsive-visual.spec.ts` writes screenshots at desktop (1280px), tablet (820px), and mobile (390px) on every run:

```
artifacts/lab-03/screenshots/
  authentication/        {state}-{desktop,tablet,mobile}.png
  requester-tickets/     {state}-{desktop,tablet,mobile}.png
  staff-queue/           {state}-{desktop,tablet,mobile}.png
  staff-ticket-detail/   {state}-{desktop,tablet,mobile}.png
  user-management/       {state}-{desktop,tablet,mobile}.png
```

The states per folder are those listed in `ui-spec.md` §16. Each capture is preceded by automated checks for the visual checklist:

- No horizontal page scroll.
- No clipped labels, buttons, badges, or validation messages.
- No overlapping interactive elements.
- Touch targets of at least 44px on mobile.
- A visible focus ring on a focused control.

Design consistency and role-navigation correctness are confirmed by reviewing the screenshots against the checklist in `ui-spec.md` §16.
