# TokTickIT

TokTickIT is an IT Service Desk application for CPE334 Software Engineering course.
The project uses a React frontend, an Express backend, PostgreSQL, and Prisma.

As of Lab 3 it has real authentication and three roles — **Requester**,
**IT Staff**, and **Administrator** — so people sign in with an email and
password and see only what their role allows.

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Bootstrap
- Vitest

### Backend

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- Supertest
- Vitest

## Project Structure

```text
toktickit/
├── client/                        React frontend
│   ├── src/                       Screens, API client, Zen Green theme
│   ├── tests/lab-01/              Lab 1 component tests
│   ├── tests/lab-02/              Lab 2 unit, UI and style tests
│   ├── tests/lab-03/              Lab 3 role navigation, login, queue, ticket detail,
│   │                              user management tests
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
│
├── server/                        Express + Prisma backend
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   ├── seed.ts
│   │   └── verify-lab2.sql        Manual database verification script
│   ├── scripts/
│   │   └── clean-e2e-data.ts      Removes data left by E2E runs
│   ├── src/                       Routes, validation, attachment storage
│   ├── tests/lab-01/              Lab 1 API tests
│   ├── tests/lab-02/              Lab 2 unit and API tests
│   ├── tests/lab-03/              Lab 3 auth, authorization, queue, ticket operation,
│   │                              user admin, seed and migration tests
│   ├── uploads/                   Attachment files (gitignored)
│   ├── .env.example
│   ├── package.json
│   └── vitest.config.ts
│
├── e2e/lab-02/                    Playwright E2E, responsive and visual tests (Requester)
├── e2e/lab-03/                    Playwright E2E, accessibility, responsive and visual
│                                  tests for every role
│
├── docs/
│   ├── lab-01/
│   ├── lab-02/                    Specification, API spec, UI spec, test plan,
│   │                              peer review record, AI use record
│   └── lab-03/                    Same set of documents for Lab 3
│
├── artifacts/lab-02/screenshots/  Desktop/tablet/mobile visual evidence (Lab 2)
├── artifacts/lab-03/screenshots/  Desktop/tablet/mobile visual evidence (Lab 3)
│
├── .gitignore
├── playwright.config.ts
└── README.md
```

## Prerequisites

Before running the project, make sure the following are installed:

- Node.js
- npm
- PostgreSQL

You can check the installed versions with:

```bash
node --version
npm --version
psql --version
```

## Installation

Clone the repository and enter the project directory.

### 1. Install frontend dependencies

```bash
cd client
npm install
```

### 2. Install backend dependencies

```bash
cd ../server
npm install
```

## Environment Variables

The project uses environment variables for configuration.

### Server

Go to the `server` directory and copy `.env.example` to `.env`.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Then open `server/.env` and configure the PostgreSQL connection.

Example:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/toktickit"
```

Replace `YOUR_PASSWORD` with the password of your local PostgreSQL `postgres` user.

Do not commit the `.env` file.

Lab 3 adds these server variables (all have safe defaults except the
migration-test database):

| Variable | Default | Purpose |
| --- | --- | --- |
| `MIGRATION_TEST_DATABASE_URL` | — | A separate, disposable database the migration test wipes on every run. Never point it at real data. |
| `CLIENT_ORIGIN` | `http://localhost:5173` | The only browser origin allowed to send the session cookie |
| `SESSION_TTL_HOURS` | `8` | Session lifetime (absolute) |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |
| `BCRYPT_COST` | `12` | bcrypt cost factor; below 10 is refused at startup |

**Using `npx prisma dev` (local Prisma Postgres):** run it from `server/` and
use the printed `DATABASE_URL`, adding `&connection_limit=1&pgbouncer=true` to
the end. The embedded server shares one session between connections, so
Prisma's prepared-statement cache must be switched off. Use the printed
`SHADOW_DATABASE_URL`, with the same suffix, as `MIGRATION_TEST_DATABASE_URL`.

### Client

If the client requires environment variables, copy the example file:

```powershell
cd ../client
Copy-Item .env.example .env
```

Do not put real secrets in `.env.example`.

## Database Setup

Make sure PostgreSQL is running before using Prisma.

Create a PostgreSQL database named:

```text
toktickit
```

Then go to the server directory:

```bash
cd server
```

Validate the Prisma schema:

```bash
npx prisma validate
```

Generate the Prisma Client:

```bash
npx prisma generate
```

Check the database migration status:

```bash
npx prisma migrate status
```

If migrations are provided by the project, apply them with:

```bash
npx prisma migrate dev
```

Do not run database commands against a database containing important data without checking the migration changes first.

Then seed the reference data and development accounts:

```bash
npm run prisma:seed
```

The seed is idempotent. Every run resets the accounts below to the documented
password and flags; accounts created in the app are never touched.

### Development accounts (local development only)

All seeded accounts share the password **`TokTickIT-Dev1!`**. It is a
development fixture, not a secret — never use it anywhere real.

| Email | Role | State |
| --- | --- | --- |
| `requester-a@example.com` | Requester | Active |
| `requester-b@example.com` | Requester | Active |
| `requester-c@example.com` | Requester | Active |
| `requester-d@example.com` | Requester | Active, must change password at first login |
| `requester-e@example.com` | Requester | Active, must change password at first login |
| `inactive-requester@example.com` | Requester | Inactive |
| `itstaff-1@example.com` … `itstaff-3@example.com` | IT Staff | Active |
| `inactive-itstaff@example.com` | IT Staff | Inactive |
| `admin@example.com` | Administrator | Active |
| `inactive-admin@example.com` | Administrator | Inactive |

Requester A–E and Inactive Requester are the Lab 2 Development Requesters,
migrated into the `User` model with their ids and tickets intact.

Passwords are stored only as bcrypt hashes. Five failed sign-ins for one email
lock it for 15 minutes; the lock expires on its own (or restart the server).

## Running the Application

The frontend and backend should be run in separate terminals.

### Start the Backend

```bash
cd server
npm run dev
```

The backend will start using the configuration defined by the project.

### Start the Frontend

Open another terminal:

```bash
cd client
npm run dev
```

Vite will display the local development URL in the terminal, normally:

```text
http://localhost:5173/
```

Open the displayed URL in a browser.

## Testing

The suite has three parts. The backend and E2E tests run against a **real
PostgreSQL database**, so migrate and seed it before running them:

```bash
cd server
npx prisma migrate dev
npm run prisma:seed
```

### The three documented test commands

Run all three from the **repository root** to verify the project end to end:

```bash
npm test --prefix server    # unit + API tests           (Vitest + Supertest)
npm test --prefix client    # unit + UI + style tests    (Vitest + Testing Library)
npx playwright test         # E2E + responsive + visual  (Playwright)
```

Every test is expected to pass; none are skipped or disabled.

### Backend tests

From the `server` directory:

```bash
npm test
```

Unit tests cover ticket-number generation, field validation, and the attachment
rules. API tests use Supertest against the Express app and a live database, and
cover ticket creation, validation failures, duplicate submission, ownership,
search/filter/sort/pagination, and the attachment lifecycle.

Lab 3 adds unit tests (credentials, login throttle, sessions, status
transitions, queue query, user validation) and API tests for authentication,
the authorization matrix, the staff queue and ticket operations, comments and
notes, and user administration. `migration.test.ts` migrates Lab 2 data to the
Lab 3 schema and needs `MIGRATION_TEST_DATABASE_URL` (see above).

Because these share one database, the suite runs one file at a time
(`fileParallelism: false` in `vitest.config.ts`).

### Frontend tests

From the `client` directory:

```bash
npm test
```

Component tests cover Create Ticket, My Tickets, Ticket Detail, and the
attachment section, plus a UI style suite that checks the Zen Green tokens,
required-field markers, validation presentation, and read-only field styling.
Lab 3 adds tests for the app shell and role navigation, Login, Change Password,
the IT Staff queue and ticket detail, and User Management.

### E2E, responsive and visual tests

From the **repository root**:

```bash
npx playwright test
```

First-time setup:

```bash
npm install
npx playwright install chromium
```

Playwright starts the API and the Vite dev server automatically. The suite walks
the whole requester journey in a real browser, verifies the layout at desktop
(1280px), tablet (820px), and mobile (390px), and writes the screenshots to
`artifacts/lab-02/screenshots/`.

Useful variations:

```bash
npx playwright test --headed          # watch it run
npx playwright test --ui              # interactive runner
npx playwright show-report            # open the last HTML report
```

The Lab 3 suites (`e2e/lab-03/`) sign in as the seeded accounts and cover every
role:

| File | Covers |
| --- | --- |
| `authentication.spec.ts` | E2E-01 to E2E-06: login per role, initial-password change, failures, logout, forbidden destinations |
| `requester-regression.spec.ts` | E2E-07 to E2E-09: the Requester journey, Public Comment and Problem Appears Resolved, cross-Requester access |
| `staff-ticket-flow.spec.ts` | E2E-10 to E2E-14: queue, claim and progress, assign and reassign, Public vs Internal, stale updates |
| `user-administration.spec.ts` | E2E-15 to E2E-18: create, validate, edit, reset, deactivate, administrator safety rules |
| `accessibility.spec.ts` | A11Y-01 to A11Y-04: keyboard flows and an `@axe-core/playwright` scan at 1280px and 390px |
| `responsive-visual.spec.ts` | RESP-01 to RESP-06 layout checks, VIS-01 to VIS-05 screenshots, and a coverage check that every screen exists at every size |

The client has no URL routes, so "typing `/queue`" cannot open a screen. E2E-06
proves the same rule from both ends: the navigation never offers a destination
the role may not use, and the API answers a direct call with `403`.

Playwright needs the local Prisma dev database running (`cd server && npx prisma
dev start default`) because the global setup re-runs the seed.

The E2E suite creates tickets and users in the database. It clears its own
leftovers at the start of each run (tickets whose summary starts with `E2E `,
and users on the `@toktickit.test` domain); to remove them by hand:

```bash
cd server && npx tsx scripts/clean-e2e-data.ts
```

### Verifying the database directly

```bash
cd server
psql -h localhost -U toktickit -d toktickit -f prisma/verify-lab2.sql
```

This checks models, primary keys, foreign keys, unique constraints, indexes,
enums, timestamps, soft-removal columns, and seed counts. Its behavioural
checks run inside a transaction that is rolled back, so it is safe to re-run.

## Prisma Commands

Useful Prisma commands:

```bash
npx prisma validate
```

Validate the Prisma schema.

```bash
npx prisma generate
```

Generate the Prisma Client.

```bash
npx prisma migrate status
```

Check the current migration status.

```bash
npx prisma studio
```

Open Prisma Studio to inspect the database.

## Development Workflow

This project uses GitHub Issues and GitHub Projects to manage development work.

The main workflow is:

```text
Backlog
   ↓
Specified
   ↓
Started
   ↓
PR Review
   ↓
Fixing
   ↓
PR Review
   ↓
Done
```

Development work is completed on feature branches, never directly on `main` or
a staging branch. Each lab has its own staging branch that feature branches
merge into; the staging branch is then released to `main` by a single pull
request once integration testing passes.

```text
feature/<lab>-<topic>  →  lab<N>-staging  →  main
```

Branch a new feature off the **current staging branch**, not `main` — `main`
only receives a lab's work at release time, so a branch cut from it will be
missing everything merged into staging so far.

Lab 3 followed this flow: feature branches (`feature/lab3-specification`,
`-authentication-foundation`, `-authorization-middleware`, `-requester-regression`,
`-ticket-queue`, `-ticket-operation`, `feature/admin-management`, `-lab3-e2e-visual`,
`-lab3-release`) merged into `lab3-staging`, which was released to `main` in one PR.

Lab 2 feature branches:

```text
feature/lab2-spec            feature/lab2-my-tickets
feature/lab2-database        feature/lab2-ticket-detail
feature/lab2-requester       feature/lab2-tests
feature/lab2-create-ticket   feature/lab2-e2e-visual
```

## Security

Do not commit sensitive information to the repository.

The following files/directories should not be committed:

```text
.env                    Database credentials and local configuration
node_modules/
dist/ build/            Build output
server/uploads/         Uploaded attachment files
test-results/           Playwright traces and failure artifacts
playwright-report/
```

Use `.env.example` to document required environment variables without including real passwords, API keys, or other secrets.

Attachment handling follows two rules worth knowing when working on the upload
code:

- Stored filenames are generated by the server. The original filename is
  display metadata only and is never used as a path.
- Removing an attachment is a **soft removal**: the metadata row stays and the
  file becomes undownloadable (HTTP `410`). Nothing is deleted from disk.

## Project Scope

### Lab 1 — foundation

1. Project foundation
2. API health check
3. IT request category database and seed
4. Category list API and UI

### Lab 2 — Requester ticketing MVP

A Requester-facing MVP: a selected Development Requester can raise an IT support
ticket, receive a backend-generated Ticket Number, find and inspect their own
tickets, and manage attachments.

- Development Requester selection (a **testing mechanism, not authentication** —
  real sign-in arrives in Lab 3)
- Create Ticket, with backend-generated Ticket Number and Ticket Date, and a
  starting status of `New`
- My Tickets: search, filter, sort, and pagination, scoped to the selected
  Requester
- Ticket Detail, read-only
- Attachments: upload, download, and soft removal with a required reason
- Requester ownership enforced on every ticket and attachment operation
- Responsive desktop, tablet, and mobile layouts using the Zen Green system

**Out of scope for Lab 2:** real authentication, IT Staff workflow, comments,
internal notes, and post-creation status changes.

### Lab 3 — authentication, roles, and the staff workflow

Lab 3 replaces the Development Requester selector with real sign-in and adds
the IT Staff and Administrator sides of the service desk.

- Email and password sign-in with bcrypt-hashed passwords, server-side
  sessions in an HTTP-only cookie, login throttling, and forced password change
  at first login
- Role-based authorization enforced by the API on every route; the navigation
  only offers what the role may use
- **Requester:** the Lab 2 journey under the signed-in identity, plus Public
  Comments and "Problem Appears Resolved"
- **IT Staff:** a ticket queue, claiming, assigning and reassigning, IT priority,
  status workflow, Public Comments, and Internal Notes (never visible to Requesters)
- **Administrator:** create, edit, reset password for, activate and deactivate
  users, with safety rules protecting the last administrator
- Migration of the Lab 2 Development Requesters into the `User` model with ids and
  tickets intact
- Accessibility (keyboard flows and axe scans) and responsive checks for every role

### API endpoints

All routes except health and login require a signed-in session. The role column
is the minimum the API enforces; the client has no URL routes, so authorization
is proven by direct API calls as well as by the UI.

| Method | Endpoint | Role |
| --- | --- | --- |
| `GET` | `/api/health` | Public |
| `POST` | `/api/auth/login` | Public |
| `POST` | `/api/auth/logout` | Any |
| `GET` | `/api/auth/me` | Any |
| `POST` | `/api/auth/change-password` | Any |
| `GET` | `/api/categories`, `/api/related-systems` | Any |
| `POST` | `/api/tickets` | Requester |
| `GET` | `/api/tickets/mine` | Requester |
| `GET` | `/api/tickets/queue` | IT Staff, Administrator |
| `GET` | `/api/users/assignable` | IT Staff, Administrator |
| `GET` | `/api/tickets/:ticketId` | Requester (own), IT Staff, Administrator |
| `POST` | `/api/tickets/:ticketId/claim` | IT Staff, Administrator |
| `PATCH` | `/api/tickets/:ticketId/owner` | IT Staff (unassigned), Owner, Administrator |
| `PATCH` | `/api/tickets/:ticketId/it-priority` | Owner, Administrator |
| `PATCH` | `/api/tickets/:ticketId/status` | Owner, Administrator |
| `GET`, `POST` | `/api/tickets/:ticketId/public-comments` | Requester (own), IT Staff, Administrator |
| `GET`, `POST` | `/api/tickets/:ticketId/internal-notes` | IT Staff, Administrator |
| `POST` | `/api/tickets/:ticketId/problem-resolved` | Requester (own) |
| `POST`, `DELETE` | `/api/tickets/:ticketId/attachments[/:attachmentId]` | Requester (own) |
| `GET` | `/api/tickets/:ticketId/attachments[/:attachmentId]` | Requester (own), IT Staff, Administrator |
| `GET`, `POST` | `/api/admin/users` | Administrator |
| `GET`, `PATCH` | `/api/admin/users/:userId` | Administrator |
| `POST` | `/api/admin/users/:userId/initial-password` | Administrator |

The full request and response contract, including error shapes, is in
[`docs/lab-03/api-spec.md`](docs/lab-03/api-spec.md). The Lab 2 routes under
`/api/requesters/:requesterId/...` and `/api/development-requesters` were
replaced by the routes above; the mapping is at the end of that document.

## Documentation

| Document                                                     | Contents                                     |
| ------------------------------------------------------------ | -------------------------------------------- |
| [`docs/lab-02/specification.md`](docs/lab-02/specification.md) | Requirements, business rules, acceptance criteria |
| [`docs/lab-02/api-spec.md`](docs/lab-02/api-spec.md)           | Endpoint contracts and status codes          |
| [`docs/lab-02/ui-spec.md`](docs/lab-02/ui-spec.md)             | Zen Green design system, screens, responsive rules |
| [`docs/lab-02/tests.md`](docs/lab-02/tests.md)                 | Test plan and acceptance-criteria traceability |
| [`docs/lab-02/reviewer.md`](docs/lab-02/reviewer.md)           | Peer review record                           |
| [`docs/lab-02/ai-use.md`](docs/lab-02/ai-use.md)               | AI use and reflection                        |
| [`docs/lab-03/specification.md`](docs/lab-03/specification.md) | Lab 3 requirements, roles, business rules, acceptance criteria |
| [`docs/lab-03/api-spec.md`](docs/lab-03/api-spec.md)           | Lab 3 endpoint contracts, authorization matrix |
| [`docs/lab-03/ui-spec.md`](docs/lab-03/ui-spec.md)             | Lab 3 screens per role, responsive rules     |
| [`docs/lab-03/tests.md`](docs/lab-03/tests.md)                 | Lab 3 test plan and traceability             |
| [`docs/lab-03/reviewer.md`](docs/lab-03/reviewer.md)           | Lab 3 peer review record                     |
| [`docs/lab-03/ai-use.md`](docs/lab-03/ai-use.md)               | Lab 3 AI use and reflection                  |

## Visual Evidence

Screenshots at desktop, tablet, and mobile widths are captured automatically by
the E2E suite and stored under `artifacts/lab-02/screenshots/`:

```text
requester-selection/    create-ticket/    my-tickets/    ticket-detail/
```

Each folder holds `desktop.png`, `tablet.png`, and `mobile.png`, plus state
variants for validation errors, expanded filters, the empty list, and removed
attachments. (The Requester Selection screen was removed in Lab 3; its folder
is kept as Lab 2 evidence and is no longer regenerated.)

Lab 3 screenshots are written to `artifacts/lab-03/screenshots/`, one folder per
`ui-spec.md` §16 group, named `<viewport>-<state>.png`
(`desktop-`, `tablet-`, `mobile-`):

```text
authentication/    requester-tickets/    staff-queue/
staff-ticket-detail/    user-management/
```

A screenshot is only written after the automated visual checklist passes for
that state (no horizontal page scroll, no clipped button or label, everything
inside the viewport), and the `VIS-coverage` test fails if any required screen
is missing at any of the three sizes.

## License

This project is developed for educational purposes.
