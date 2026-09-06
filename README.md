# TokTickIT

TokTickIT is an IT Service Desk application for CPE334 Software Engineering course.
The project uses a React frontend, an Express backend, PostgreSQL, and Prisma.

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
│   ├── uploads/                   Attachment files (gitignored)
│   ├── .env.example
│   ├── package.json
│   └── vitest.config.ts
│
├── e2e/lab-02/                    Playwright E2E, responsive and visual tests
│
├── docs/
│   ├── lab-01/
│   └── lab-02/                    Specification, API spec, UI spec, test plan,
│                                  peer review record, AI use record
│
├── artifacts/lab-02/screenshots/  Desktop/tablet/mobile visual evidence
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

Because these share one database, the suite runs one file at a time
(`fileParallelism: false` in `vitest.config.ts`).

### Frontend tests

From the `client` directory:

```bash
npm test
```

Component tests cover the requester selector, Create Ticket, My Tickets, Ticket
Detail, and the attachment section, plus a UI style suite that checks the Zen
Green tokens, required-field markers, validation presentation, and read-only
field styling.

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

The E2E suite creates tickets in the database. It clears its own leftovers at
the start of each run; to remove them by hand:

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

### API endpoints

| Method   | Endpoint                                                                | Purpose                          |
| -------- | ----------------------------------------------------------------------- | -------------------------------- |
| `GET`    | `/api/health`                                                           | Service health check             |
| `GET`    | `/api/categories`                                                       | Active categories                |
| `GET`    | `/api/related-systems`                                                  | Active related systems           |
| `GET`    | `/api/development-requesters`                                           | Active Development Requesters    |
| `POST`   | `/api/tickets`                                                          | Create one ticket                |
| `GET`    | `/api/requesters/:requesterId/tickets`                                  | The requester's own ticket list  |
| `GET`    | `/api/requesters/:requesterId/tickets/:ticketId`                        | Ticket detail                    |
| `POST`   | `/api/requesters/:requesterId/tickets/:ticketId/attachments`            | Upload an attachment             |
| `GET`    | `/api/requesters/:requesterId/tickets/:ticketId/attachments`            | Attachment metadata              |
| `GET`    | `/api/requesters/:requesterId/tickets/:ticketId/attachments/:id`        | Download an active attachment    |
| `DELETE` | `/api/requesters/:requesterId/tickets/:ticketId/attachments/:id`        | Soft-remove an attachment        |

The full request and response contract is in
[`docs/lab-02/api-spec.md`](docs/lab-02/api-spec.md).

## Documentation

| Document                                                     | Contents                                     |
| ------------------------------------------------------------ | -------------------------------------------- |
| [`docs/lab-02/specification.md`](docs/lab-02/specification.md) | Requirements, business rules, acceptance criteria |
| [`docs/lab-02/api-spec.md`](docs/lab-02/api-spec.md)           | Endpoint contracts and status codes          |
| [`docs/lab-02/ui-spec.md`](docs/lab-02/ui-spec.md)             | Zen Green design system, screens, responsive rules |
| [`docs/lab-02/tests.md`](docs/lab-02/tests.md)                 | Test plan and acceptance-criteria traceability |
| [`docs/lab-02/reviewer.md`](docs/lab-02/reviewer.md)           | Peer review record                           |
| [`docs/lab-02/ai-use.md`](docs/lab-02/ai-use.md)               | AI use and reflection                        |

## Visual Evidence

Screenshots at desktop, tablet, and mobile widths are captured automatically by
the E2E suite and stored under `artifacts/lab-02/screenshots/`:

```text
requester-selection/    create-ticket/    my-tickets/    ticket-detail/
```

Each folder holds `desktop.png`, `tablet.png`, and `mobile.png`, plus state
variants for validation errors, expanded filters, the empty list, and removed
attachments.

## License

This project is developed for educational purposes.
