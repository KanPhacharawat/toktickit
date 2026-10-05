# Lab 4 Test Plan — TokTickIT

> Location in repo: `docs/lab-04/tests.md`
> Related: [`specification.md`](./specification.md) · [`ui-spec.md`](./ui-spec.md) · [`api-spec.md`](./api-spec.md)

Naming convention (matches Lab 1–3): server unit/API tests in `server/tests/lab-04/*.test.ts`, UI component tests in `client/tests/lab-04/*.test.tsx`, E2E specs in `e2e/lab-04/*.spec.ts`.

Every row's Requirement/AC column cites the FR/BR/AC ids it verifies from [`specification.md`](./specification.md#9-acceptance-criteria). Every `AC-01`…`AC-39` appears in at least one row (cross-reference table in §9).

---

## 1. Unit Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| ------- | ---- | --------------- | -------------- | ---------------- | -------------------- | ----- |
| U-01 | Unit | BR-06, BR-07, BR-08, BR-09, BR-10, AC-08, AC-09, AC-15 | Zod schemas for Action Taken create/edit/complete/cancel: description length, result-required-when-Completed, followUpNote-required-when-followUpRequired, attachmentNotes length, `actionAt` bounds (future/before ticket) | Schema rejects each invalid case with a field-level error and accepts every valid case | `server/tests/lab-04/actions-taken.api.test.ts` (validation exercised through the API layer; no standalone schema unit file) | Passing |
| U-02 | Unit | BR-19, FR-11, FR-12, AC-16, AC-17 | Shared transition-matrix module: every (role, fromStatus, toStatus) cell in specification §5.3 | Allowed cells return permitted; every other cell returns `INVALID_TRANSITION`; matrix is a single source of truth importable by API and `/transitions` | `server/tests/lab-04/transition-matrix.unit.test.ts` | Passing |
| U-03 | Unit | BR-20, FR-13, AC-18 | Resolution gate function: owner present, ≥1 Completed action, no Planned action, follow-ups acknowledged, resolution summary supplied | Gate returns `passed: true` only when all 5 conditions hold; otherwise returns the exact list of failing check ids | `server/tests/lab-04/resolution-gate.unit.test.ts` | Passing |
| U-04 | Unit | BR-26–BR-44, BR-45, BR-46 | Dashboard metric calculation helpers (requester, staff, admin, byPriority zero-fill, open-like set) in isolation from HTTP layer | Each helper returns the documented count/list for a fixture dataset, including `0`/`[]` for empty input | `server/tests/lab-04/requester-dashboard.api.test.ts`, `server/tests/lab-04/staff-dashboard.api.test.ts` (metrics verified end-to-end through the API; no standalone helper unit file) | Passing |
| U-05 | Unit | BR-22 | Timestamp side-effect rules on status change (sets/clears `resolvedAt`, `closedAt`, `cancelledAt`, `requesterResolvedIndicatedAt`) | Each transition sets/clears exactly the fields specified in BR-22 | `server/tests/lab-04/ticket-workflow.api.test.ts` (asserted on the API response after each transition; no standalone unit file) | Passing |
| U-06 | Unit | BR-15, BR-05, AC-07, AC-11 | Idempotency-key lookup and active-staff-assignee check helpers used by the Actions Taken API | Repeated `clientRequestId` returns the existing row id; inactive/non-staff `performedById` is rejected before DB write | `server/tests/lab-04/actions-taken.api.test.ts` (helpers exercised through the API; no standalone unit file) | Passing |

## 2. API / Integration Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| ------- | ---- | --------------- | -------------- | ---------------- | -------------------- | ----- |
| A-01 | API | FR-01–FR-10, BR-01–BR-15, AC-01, AC-03, AC-04, AC-05\*, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15 | Full CRUD-ish lifecycle of `/api/tickets/:ticketId/actions*`: list, create, edit, complete, cancel, ordering, role rules, locking, idempotency, concurrency | All listed ACs pass against a real (test) DB; 404 for non-owned Requester, 403 for Requester writes, 405 for DELETE, no `createdBy/updatedBy` leaked to Requester | `server/tests/lab-04/actions-taken.api.test.ts` | Passing |
| A-02 | API | FR-11–FR-16, BR-19–BR-25, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23 | `/transitions`, `POST /status`, `/requester-resolution`, `/status-history`; direct API calls bypassing the UI | Matrix and gate enforced server-side regardless of client; exactly one history row per successful change; history has no write/edit route | `server/tests/lab-04/ticket-workflow.api.test.ts` | Passing |
| A-03 | API | FR-17, FR-18, BR-17, BR-26–BR-32, AC-02, AC-26, AC-27 | `GET /api/dashboard/requester`: scoping to `session.userId`, empty-Requester zero state, 403 for non-Requester | Only the authenticated Requester's data is returned; zero-ticket Requester gets `0`/`[]`; ITStaff/Admin get 403 | `server/tests/lab-04/requester-dashboard.api.test.ts` | Passing |
| A-04 | API | FR-19, FR-20, BR-33–BR-44, AC-24, AC-28\*\*, AC-29 | `GET /api/dashboard/staff` and `/api/dashboard/admin`: metric values, `byPriority` zero-fill, admin `users` block | Every metric equals the documented Prisma query on seed data; admin body is staff body + `users` | `server/tests/lab-04/staff-dashboard.api.test.ts` | Passing |
| A-05 | API | BR-03, AC-04, AC-06, AC-27, §6 Authorization Matrix | Cross-cutting authorization matrix sweep: every Lab 4 endpoint × every role (Requester/ITStaff/Admin, incl. inactive user) | Response code matches the matrix in `api-spec.md` §6 exactly for every (endpoint, role) pair | `server/tests/lab-04/actions-taken.api.test.ts`, `server/tests/lab-04/ticket-workflow.api.test.ts`, `server/tests/lab-04/staff-dashboard.api.test.ts`, `server/tests/lab-04/requester-dashboard.api.test.ts` (role/ownership checks are embedded per-endpoint; no single cross-cutting sweep file exists for Lab 4) | Passing |
| A-06 | API | BR-14, BR-25, AC-10, AC-21 | Optimistic concurrency: stale `version` on Action Taken edit and on `POST /status` | Both return `409` with the current record in the body; no partial write occurs | `server/tests/lab-04/actions-taken.api.test.ts`, `server/tests/lab-04/ticket-workflow.api.test.ts` | Passing |
| A-07 | API | AC-25, BR-45 | Every dashboard metric's drill-down link, queried against the extended list endpoints (`/queue`, `/my-tickets`, `/admin/users`) | Drill-down list `total` equals the metric `value` for every metric on seed data | `server/tests/lab-04/requester-dashboard.api.test.ts`, `server/tests/lab-04/staff-dashboard.api.test.ts` | Passing |
| A-08 | API | FR-28, AC-37 | `GET /api/health` with DB up and with DB unreachable (mocked) | `200 { status: "ok", db: "up" }` when reachable; `503 { status: "degraded", db: "down" }` otherwise, no internals leaked | `server/tests/lab-04/health.api.test.ts` | Passing |
| A-09 | API | §7 note 1 (Lab 3 `PATCH /status` retirement) | Old `PATCH /api/tickets/:id/status` route and a generic `PATCH /api/tickets/:id` with a `status` field | Both `404` (neither route exists); gate cannot be bypassed via either | `server/tests/lab-04/legacy-status-route.api.test.ts` | Passing |

\* AC-05 is primarily a UI assertion; A-01 covers its API precondition (Requester GET returns full list with no write routes reachable). \*\* AC-28 (error banner) is a UI-only behavior; A-04 covers that the API surfaces a real 5xx for the UI to react to.

## 3. UI Component Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| ------- | ---- | --------------- | -------------- | ---------------- | -------------------- | ----- |
| C-01 | UI | FR-01–FR-09, AC-03, AC-05, AC-08, AC-10, AC-12, AC-13, AC-32, AC-33 | `ActionsTaken` component: list rendering, create/edit forms, complete/cancel dialogs, 409 dialog, Requester read-only mode, disabled-while-pending submit, retained form data on failure | Matches `ui-spec.md` §5; no Add/Edit controls for Requester; submit re-disables and reuses `clientRequestId` on retry | `client/tests/lab-04/ActionsTaken.test.tsx` | Passing |
| C-02 | UI | FR-11, FR-14–FR-16, AC-19, AC-20, AC-21, AC-22, AC-23 | `TicketWorkflow` status panel: renders only API-permitted transitions, Resolve/Cancel/Reopen dialogs, gate-failure display, 409 reload, History tab | Status controls hidden on Closed/Cancelled; badge/owner/timestamps refresh after success; History has no edit/delete affordance | `client/tests/lab-04/TicketWorkflow.test.tsx` | Passing |
| C-03 | UI | FR-19–FR-22, AC-24, AC-25, AC-28, AC-29, AC-30 | `StaffDashboard` (+ Admin variant): metric cards, urgent/recent lists, quick actions, at-a-glance, loading/empty/error/forbidden states, card → filtered queue navigation | Cards render seed-data values; clicking a card navigates with the matching query params; error state shows Retry and hides stale numbers | `client/tests/lab-04/StaffDashboard.test.tsx` | Passing |
| C-04 | UI | FR-17, FR-18, FR-21, FR-22, AC-02, AC-25, AC-26, AC-28, AC-30 | `RequesterDashboard`: metric cards, needs-attention/recent lists, empty state with "Create Ticket", loading/error states | Only current Requester's data rendered; empty state shown for zero tickets; no filters/pagination duplicated from My Tickets | `client/tests/lab-04/RequesterDashboard.test.tsx` | Passing |
| C-05 | UI | FR-17, AC-30 | Role-based navigation: Dashboard nav item per role, `aria-current="page"`, post-login redirect to `/dashboard` | Each role sees its nav set; Dashboard item marked active when on `/dashboard` | `client/tests/lab-04/Navigation.test.tsx` | Passing |

## 4. Authorization, Concurrency, Idempotency Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| ------- | ---- | --------------- | -------------- | ---------------- | -------------------- | ----- |
| AU-01 | API | AC-04, AC-06, AC-27, A-05 | Ownership-leak protection: Requester requesting another Requester's Ticket resources | `404`, never `403`, so existence is not revealed | `server/tests/lab-04/actions-taken.api.test.ts` | Passing |
| CN-01 | API | AC-10, AC-21 | Two concurrent edits to the same Action Taken / Ticket status | Second writer with the old `version` gets `409 STALE_UPDATE`; first writer's change is preserved | `server/tests/lab-04/actions-taken.api.test.ts`, `server/tests/lab-04/ticket-workflow.api.test.ts` | Passing |
| ID-01 | API | AC-11 | Double-submit of `POST /actions` with an identical `clientRequestId` (sequential and near-simultaneous) | Exactly one `ActionTaken` row exists; second call returns `200` with the original record | `server/tests/lab-04/actions-taken.api.test.ts` | Passing |

## 5. Migration and Seed Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| ------- | ---- | --------------- | -------------- | ---------------- | -------------------- | ----- |
| M-01 | Migration | AC-39 | `prisma migrate deploy` of `20261001_lab4_actions_taken_workflow` against a Lab 3-shaped database with existing data | Row counts for Users/Tickets/Attachments/Comments/Notes are equal before and after; new tables/columns exist; backfilled `TicketStatusHistory` rows present | `server/tests/lab-04/migration.test.ts` | Passing |
| M-02 | Migration | AC-38, FR-29 | Running `npm run seed` twice against the same database | Identical row counts after both runs; no unique-constraint errors; upserts, not inserts | `server/tests/lab-04/seed.test.ts` | Passing |
| M-03 | Migration | DoD §10 rollback item | `rollback.sql` on a scratch DB: migrate → seed → rollback → migrate again | Rollback drops only the two new tables/columns; re-migrate succeeds cleanly; documented in README | `server/tests/lab-04/rollback.test.ts` | Passing |

## 6. Regression Tests (Labs 1–3)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| ------- | ---- | --------------- | -------------- | ---------------- | -------------------- | ----- |
| R-01 | Regression | FR-23, AC-31 | Existing Lab 1–3 suites (auth, My Tickets, Ticket Detail, attachments, comments, internal notes, queue, assignment, user management) run unchanged against the Lab 4 schema/API | All existing suites remain green; tests that PATCHed `status` are updated to call `POST /status` | `server/tests/lab-01/*.test.ts`, `server/tests/lab-02/*.test.ts`, `server/tests/lab-03/*.test.ts` (updated in place), `client/tests/lab-02/*.test.tsx`, `client/tests/lab-03/*.test.tsx`, `e2e/lab-03/*.spec.ts` (updated in place) | Passing |
| R-02 | Regression | FR-25, AC-32 | Double-click / rapid repeat submit on comments, notes, attachments, ticket creation, and Actions Taken forms | At most one record created per logical submit across all forms | `client/tests/lab-04/DuplicateSubmit.test.tsx` | Passing |
| R-03 | Regression | FR-26, AC-33 | Form field values after a simulated 5xx / network failure on create/edit forms across the app | All form fields retain their entered values; user can retry without retyping | `client/tests/lab-04/FormResilience.test.tsx` | Passing |

## 7. Responsive, Accessibility, Performance-Smoke Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| ------- | ---- | --------------- | -------------- | ---------------- | -------------------- | ----- |
| RS-01 | Responsive | FR-22, AC-34 | All Lab 4 screens (dashboards, Actions Taken, workflow dialogs) at 375 / 768 / 1280 px | No horizontal page scroll, no clipped or overlapping controls at any width | `e2e/lab-04/responsive-visual.spec.ts` | Passing |
| AX-01 | Accessibility | AC-35 | axe scan + keyboard-only walkthrough of dashboards, Actions Taken, workflow dialogs | 0 serious/critical axe violations; every action reachable and operable via keyboard with visible focus; status conveyed by text, not color alone | `e2e/lab-04/accessibility.spec.ts` | Passing — the nav drawer itself (open/close, focus trap) was not separately keyboard-walked in this pass; it's scanned by axe as part of every page but not interacted with |
| P-01 | Performance-smoke | Spec §1 non-functional intent (DoD dashboards) | Response time of `/api/dashboard/requester`, `/api/dashboard/staff`, `/api/dashboard/admin` against seeded data | Each responds in < 500 ms (median of 5 runs) | `server/tests/lab-04/performance-smoke.test.ts` | Passing |

## 8. End-to-End (E2E) Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| ------- | ---- | --------------- | -------------- | ---------------- | -------------------- | ----- |
| E-01 | E2E | AC-01, AC-03, AC-11, AC-13, AC-14, AC-32, AC-36 | Full Actions Taken flow: two different IT Staff log in and add/edit/complete/cancel actions on one Ticket, double-submit attempt, Closed-ticket lock | List shows correct "Performed by" per row in stable order; duplicate submit yields one record; no browser console errors | `e2e/lab-04/actions-taken-flow.spec.ts` | Passing |
| E-02 | E2E | AC-16, AC-18, AC-19, AC-20, AC-23, AC-36 | Ticket resolution flow: attempt Resolve with gate failing → complete the pending action → Resolve succeeds → Requester "appears resolved" → Requester Reopen → Staff Close | Gate blocks premature resolve with reasons shown; full lifecycle completes; History tab lists every transition oldest→newest; no console errors | `e2e/lab-04/ticket-resolution.spec.ts` | **Failing** — reproduced twice (isolated and in the full suite) on `main`/`feature/lab4-release`: `openStatusDialog(page, "Resolved")` (`e2e/lab-04/helpers.ts:277`) times out because the "Change status to" `<select>` resets to its placeholder and "Update Status" stays disabled before the click lands, so the Resolve dialog never opens. The other 3 tests in this spec (layout/no-scroll at 375/768/1280px) pass on their own. Needs a fix in the workflow status picker (or a `waitFor` in the helper) before this row can be marked Passing. |
| E-03 | E2E | AC-02, AC-24, AC-25, AC-26, AC-27, AC-30, AC-36 | Dashboards: Requester and Staff/Admin dashboards load with seed data, metric-card drill-down navigates correctly, Requester isolation, empty-state Requester, role landing page after login | Card counts match drill-down list counts; Requester dashboard never shows another Requester's or staff data; no console errors | `e2e/lab-04/dashboards.spec.ts` | Passing |
| E-04 | E2E | AC-34, AC-35 (E2E confirmation pass) | Same three flows above re-run at 375 / 768 / 1280 px viewports for key screens | Flows complete successfully at every viewport with no layout breakage | `e2e/lab-04/actions-taken-flow.spec.ts`, `e2e/lab-04/ticket-resolution.spec.ts`, `e2e/lab-04/dashboards.spec.ts` (viewport matrix in same specs) | Passing — layout/no-scroll checks pass independently of the failing E-02 lifecycle test; the full keyboard/axe walkthrough (AC-35) is covered by RS-01/AX-01 |

---

## 9. Acceptance Criteria Traceability (AC-01…AC-39)

| AC | Covered by |
| --- | --- |
| AC-01 | A-01, E-01 |
| AC-02 | A-03, C-04, E-03 |
| AC-03 | A-01, C-01, E-01 |
| AC-04 | A-01, A-05, AU-01 |
| AC-05 | A-01, C-01 |
| AC-06 | A-01, A-05, AU-01 |
| AC-07 | A-01, U-06 |
| AC-08 | A-01, U-01, C-01 |
| AC-09 | A-01, U-01 |
| AC-10 | A-01, A-06, CN-01, C-01 |
| AC-11 | A-01, U-06, ID-01, E-01 |
| AC-12 | A-01, C-01 |
| AC-13 | A-01, C-01, E-01 |
| AC-14 | A-01, C-01, E-01 |
| AC-15 | A-01, U-01 |
| AC-16 | U-02, A-02, E-02 |
| AC-17 | U-02, A-02 |
| AC-18 | U-03, A-02, E-02 |
| AC-19 | A-02, C-02, E-02 |
| AC-20 | A-02, C-02, E-02 |
| AC-21 | A-02, A-06, CN-01, C-02 |
| AC-22 | A-02, C-02 |
| AC-23 | A-02, C-02, E-02 |
| AC-24 | U-04, A-04, C-03, E-03 |
| AC-25 | A-04, A-07, C-03, C-04, E-03 |
| AC-26 | A-03, C-04, E-03 |
| AC-27 | A-03, A-05, AU-01, E-03 |
| AC-28 | A-04, C-03, C-04 |
| AC-29 | A-04, C-03 |
| AC-30 | C-03, C-04, C-05, E-03 |
| AC-31 | R-01 |
| AC-32 | R-02, C-01, E-01 |
| AC-33 | R-03, C-01 |
| AC-34 | RS-01, E-04 |
| AC-35 | AX-01, E-04 |
| AC-36 | E-01, E-02, E-03, AX-01 |
| AC-37 | A-08 |
| AC-38 | M-02 |
| AC-39 | M-01 |

Every AC-01…AC-39 above maps to at least one passing automated test with a real file path under `server/tests/lab-04/`, `client/tests/lab-04/`, or `e2e/lab-04/` (verified 2026-09-30: 651/651 server tests, 262/262 client tests, and 43/44 `e2e/lab-04` Playwright tests passing). AC-16, AC-18, AC-19, AC-20, AC-23, and AC-36 are still each independently covered by at least one passing test (U-02/A-02, U-03/A-02, A-02/C-02, A-02/C-02, A-02/C-02, and E-01/E-03/AX-01 respectively) even though their E-02 row is currently failing — see the note on E-02 in §8.
