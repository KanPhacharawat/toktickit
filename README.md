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
├── client/
│   ├── src/
│   ├── tests/
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
│
├── server/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   ├── tests/
│   ├── .env.example
│   ├── package.json
│   └── vitest.config.ts
│
├── .gitignore
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

### Frontend Tests

From the `client` directory:

```bash
npm test
```

If the project uses the Vitest CLI directly:

```bash
npx vitest run
```

### Backend Tests

From the `server` directory:

```bash
npm test
```

Or:

```bash
npx vitest run
```

The backend tests use Supertest for HTTP API testing.

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

Development work should be completed on feature branches rather than directly on `main` or `lab1-staging`.

For example:

```text
feature/1-project-foundation
feature/2-health-check
feature/3-category-seed
feature/4-category-list
```

## Security

Do not commit sensitive information to the repository.

The following files/directories should not be committed:

```text
.env
node_modules/
```

Use `.env.example` to document required environment variables without including real passwords, API keys, or other secrets.

## Lab 1 Scope

Lab 1 focuses on establishing the project foundation and implementing the initial IT Service Desk functionality:

1. Project foundation
2. API health check
3. IT request category database and seed
4. Category list API and UI

Further functionality can be added in later development tasks.

## License

This project is developed for educational purposes.
