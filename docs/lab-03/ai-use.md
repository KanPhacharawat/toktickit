# Lab 3 — AI Use and Reflection

**LLM/agent used:** Claude Code, running as an agent inside the repository with
file, terminal, and database access. Claude Opus was used for planning and
architecture, and Claude Sonnet for implementation.

**How it was used:** the Lab 3 planning was done first, from the lab handout,
before any code. Each GitHub Issue was then given to the agent as the prompt,
with the approved documents in `docs/lab-03/` (`specification.md`, `api-spec.md`,
`ui-spec.md`, `tests.md`) as the source of truth. The agent read those documents
itself rather than being told the requirements second-hand.

## Selected key prompts

One row per Lab 3 Issue / pull request. Prompts are summarised.

| #   | Prompt (summarised) | How I used the answer with the project |
| --- | ------------------- | -------------------------------------- |
| 1   | "Read this document (the Lab 3 handout). Help me with the planning stage first, sections 01–04 only. Read 01 for the scope and read the entire codebase so you know the current project. Then do 02, the spec: create `specification.md`, `ui-spec.md` and `api-spec.md`. The UI keeps the Lab 2 Zen Green design system; `ui-spec.md` only covers screen structure, modes, controls, feedback states and responsive behaviour." | I got the three documents that every later Issue was built and tested against, and reviewed the API and UI contracts before any implementation (PR #55). |
| 2   | Pasted the test-plan step: write `tests.md` from the approved specification, mapping every acceptance criterion to a planned test, before implementation. | Tests were specified first, so later code was measured against a plan the agent had not written to fit its own code. I used the traceability table to check that no acceptance criterion was left without a test. |
| 3   | Pasted the Authentication Foundation Issue: migrate Lab 2's Development Requesters into a `User` model, hash passwords, add login, logout, current-user and change-password, plus the Login and Change Password screens. Told it to read `docs/lab-03`. | I used the migration, bcrypt hashing, session cookie and login throttling it built (PR #56). I checked the migration by having it prove that Requester A–E kept their ids and tickets, and used the seeded development accounts to sign in as each role. |
| 4   | Pasted the Authorization Middleware Issue: protect every API route and the client navigation by role. | The agent implemented the authorization matrix from `api-spec.md` (PR #57). Because the client has no URL routes, I had it test forbidden access with direct API calls returning `403` instead of relying on hidden buttons. |
| 5   | Pasted the Requester Regression Issue: remove the Development Requester selector, run the Lab 2 journey under the signed-in user, add Public Comments and "Problem Appears Resolved". | I used it to move Lab 2 routes to the new `/api/tickets/...` routes and to re-run the Lab 1–2 tests against the new user model (PR #58). |
| 6   | Pasted the IT Staff Ticket Queue Issue: queue API and UI with search, filter, sort and pagination. | I used the queue endpoint and screen (PR #59) and the separate queue-query unit tests. |
| 7   | Pasted the Ticket Operations Issue: claim, assign and reassign, IT priority, the status workflow, Public Comments and Internal Notes. | I used the endpoints and the status transition rules (PR #60). I asked for every pair in the transition matrix to be tested, and for a Requester asking for Internal Notes to be refused. |
| 8   | Pasted the Administrator User Management Issue: create, edit, reset password, activate and deactivate users, with rules protecting administrators. | I used the admin API and screen (PR #61), including the temporary password flow that forces a change at first login. |
| 9   | Pasted the E2E and Visual Issue: Playwright tests for every role, accessibility checks, and screenshots at desktop, tablet and mobile. | I got the `e2e/lab-03/` suites, an axe accessibility scan, and screenshots under `artifacts/lab-03/screenshots/` that are only written after the layout checks pass (PR #62). |
| 10  | "Is there anything left to fix, or is this Issue done?" — asked at the end of each Issue. | I used the answer as an audit list rather than an assurance, and fixed what it reported before opening the pull request. |
| 11  | "Write the README and `docs/lab-03/ai-use.md`." | The README's scope, API endpoint table, test and documentation sections were updated for Lab 3, which I reviewed against the Lab 3 documents (PR #63). |

## Evidence that the AI work was checked, not accepted

- **Tests before code.** `tests.md` was written from the approved specification
  before implementation, and every acceptance criterion (AC-01 to AC-61) maps to
  at least one planned test.
- **Authorization checked from the outside.** Each rule in the authorization
  matrix is exercised by direct API calls that bypass the UI, because a hidden
  button is not proof that a route is protected.
- **Real database and browser.** Server tests run against a live PostgreSQL
  database and E2E tests run in a real browser, so results did not depend on
  mocks. The suites are not skipped or disabled.
- **Boundaries and races.** Password length (7/8/72/73), comment length
  (0/1/2000/2001), every status transition pair, claim races and stale updates
  were tested on purpose, not only the normal path.
- **Screenshots gated by checks.** A screenshot is only saved after the
  automated visual checklist passes, and a coverage test fails if any screen is
  missing at any of the three sizes.
- **Peer review.** Every change went through a pull request reviewed by my
  partner before merging into `lab3-staging`; the release to `main` was one
  reviewed PR.

## Where I had to correct or reject the agent

- **Spec versus issue text.** Where an Issue's wording disagreed with the
  approved `api-spec.md`, I made the agent surface the conflict instead of
  choosing silently. The main example is the old requester-scoped routes,
  which `api-spec.md` replaces with `/api/tickets/...` routes.
- **Branch base.** Feature branches must be cut from `lab3-staging`, not `main`.
  Each Lab 3 feature branch was checked to be cut from the current staging
  branch before the agent started, so it had all the merged Lab 3 work.
- **Data I care about.** Tests create and delete tickets and users, so I kept
  manual test data away from anything the cleanup script touches (only tickets
  whose summary starts with `E2E ` and users on `@toktickit.test`).
- **Test-only behaviour.** The test plan needs a way to reset login throttling
  and to move a session's expiry. I had these limited to `NODE_ENV=test` so they
  cannot be reached in a normal run.

## Reflection

Planning before coding worked well. Having the agent read the handout and the
whole codebase first, and turning that into approved specification, API and UI
documents, gave every later Issue a fixed contract, so the agent's output could
be checked against the documents instead of against my memory of them. Giving
the agent the real Lab 3 documents worked better than explaining requirements
in my own words.

Asking for proof helped as much as asking for code. Questions like "is anything
still left to fix?" turned a summary into an audit, and direct API calls for
authorization showed what the interface only hid. Security work is where a
confident summary is most dangerous, so I trusted the tests over the agent's
description.

Using the stronger model for planning and the cheaper one for implementation
kept token use reasonable without lowering the quality of the design decisions.

I am still responsible for what enters the repository. The agent can work
quickly, but I checked the branch base, the data it touched, and the
pull-request diff before merging.
