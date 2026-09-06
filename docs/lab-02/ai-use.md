# Lab 2 — AI Use and Reflection

**LLM/agent used:** Claude Code (Claude Opus), running as an agent inside the
repository with file, terminal, and database access.

**How it was used:** each GitHub Issue was pasted in as the prompt, with the
approved documents in `docs/lab-02/` as the source of truth. The agent read the
specification itself rather than being told the requirements second-hand.

## Selected key prompts

| #   | Prompt (summarised)                                                                                                                                                            | How I used the answer with the project                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pasted Issue "Create Prisma models for DevelopmentRequester, Ticket, Attachment, Category, RelatedSystem" with all tasks and acceptance criteria, plus "read the docs/lab-02". | The agent read `specification.md` §7 itself and produced `schema.prisma`, the migration, and an idempotent seed. I had it prove each criterion against the live database instead of trusting the summary — the duplicate ticket number was rejected with Prisma `P2002` and soft removal kept the metadata row. |
| 2   | "How can I test each criteria and tasks manually?"                                                                                                                             | I got `prisma/verify-lab2.sql`, a script that checks models, keys, indexes, enums, and seed counts, with the behavioural checks inside a transaction that rolls back. I use it to re-verify the database without writing SQL by hand.                                                                           |
| 3   | Pasted the Development Requester Selection issue.                                                                                                                              | Before writing code the agent noticed my feature branch had been cut from `main` instead of `lab2-staging`, so the `DevelopmentRequester` model was missing. I had it rebase onto staging first. This is a mistake I would not have caught until the build failed.                                              |
| 4   | "Where is my server/package.json?"                                                                                                                                             | It found the file had been deleted and that a later `npm` run had wiped `package-lock.json` and pruned `node_modules`. It restored both from the last commit and reinstalled. Understanding the _sequence_ mattered more than the missing file.                                                                 |
| 5   | Pasted the Create Ticket issue with "don't touch the git process, I will commit on my own".                                                                                    | The agent built `POST /api/tickets` and the form, and respected the boundary — it staged nothing and committed nothing. I keep control of history while it does the implementation.                                                                                                                             |
| 6   | Pasted the My Tickets issue: "Create a GET /api/tickets, Create UI of My tickets".                                                                                             | The issue said `/api/tickets` but `api-spec.md` §7 documents `/api/requesters/:requesterId/tickets`. Rather than silently picking one, it implemented the documented route and added the other as an alias sharing one handler, then told me so I could decide.                                                 |
| 7   | "Could you adjust the search and filter box at the top to be expand or hide because I think right now it's too long."                                                          | It collapsed the filters behind a toggle and kept the search row visible, and added a count badge so a collapsed panel never hides that the list is filtered — a detail I had not asked for but wanted once I saw it.                                                                                           |
| 8   | Pasted the Ticket Detail and Attachment issue (5 endpoints, 14 acceptance criteria).                                                                                           | I used the delivered endpoints and screens directly. I also had it verify the whole lifecycle against the running server — upload 201, `.exe` 415, download byte-match, other requester 403, removal without reason 400, download after removal 410.                                                            |
| 9   | "Is there any problem you need to fix first or this issue is done?"                                                                                                            | Instead of an assurance I got an audit: it found a real bug where one failed upload cancelled the remaining files, fixed it, and reported the E2E and style-test gaps that were still open. I now ask this at the end of every issue.                                                                           |
| 10  | "Follow the tests.md strictly and after pass every test, write down the summary."                                                                                              | It created the four missing test files, renamed every suite to its test ID for traceability, and filled in the `Final` column. It also flagged that one style assertion had been passing on an empty string — a test that proved nothing.                                                                       |
| 11  | Pasted the E2E and screenshot issue.                                                                                                                                           | I got the responsive suite plus 24 screenshots under `artifacts/lab-02/screenshots/`. The layout rules are asserted rather than eyeballed, which found two real touch-target defects.                                                                                                                           |
| 12  | Pasted the final review issue: "just check the following lists".                                                                                                               | It audited instead of agreeing: `main` was 17 commits behind `lab2-staging` with no Lab 2 code, `reviewer.md` and `ai-use.md` were missing, and the README had no Lab 2 content. That list became my remaining work.                                                                                            |

## Evidence that the AI work was checked, not accepted

Several defects were found by tests the agent wrote, and fixed in the source
rather than by weakening the test:

| Defect                                                                                                          | How it surfaced                                       |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Duplicate-submission protection was a read-then-write check, so two simultaneous requests both created a ticket | The agent's own concurrency test failed               |
| Changing requester left the new identity on the previous requester's Create Ticket screen                       | E2E-03 failed in a real browser                       |
| A failed upload in a multi-file selection cancelled the remaining files                                         | Found during the "is anything left to fix?" audit     |
| "Change Requester" and the ticket-number link were 31px and 24px tall — below a comfortable tap target          | The responsive suite's touch-target assertion         |
| A style test read `theme.css` through an import that returns empty under jsdom, so it asserted nothing          | Assertions failed loudly instead of passing vacuously |

## Where I had to correct or reject the agent

- **Wrong branch base.** The Requester Selection work was started from `main`,
  which had none of the Lab 2 database work. It had to rebase onto
  `lab2-staging` before anything would compile.
- **Destructive cleanup.** While clearing test data the agent ran a wildcard
  delete over `server/uploads/` and removed two attachment files belonging to a
  ticket I had created by hand. Both were already soft-removed so the
  application behaviour was unaffected, but the files were gone. It reported
  this itself rather than hiding it. I now keep manual test data out of
  directories that automated cleanup touches.
- **Spec versus issue text.** Where an issue's wording disagreed with the
  approved `api-spec.md`, I made the agent surface the conflict instead of
  choosing silently.
- **A stray NUL byte** written into `server/src/tickets.ts` as a string
  separator broke a SQL parameter with a confusing Postgres encoding error.
  The generated code is not always clean, and the error message pointed
  somewhere else entirely.

## Reflection

The prompts that worked best were the ones where I gave the agent the approved documents and asked it to read them. This worked better than explaining the requirements in my own words. For example, giving the full issue with its acceptance criteria and adding “read the docs/lab-02” helped the agent follow the business rules. When I explained a feature myself, the result looked good but sometimes did not follow the real requirements.

The second thing that improved the quality was asking for proof. Questions like “How can I check this myself?” and “Is anything still broken?” helped me find problems that were not clear from the summary. I could test the real database, API, and browser myself. Most of the real bugs in this lab were found through these tests, not just by reading the code.

One thing I would not do again is let an automated process change data that I care about. The deleted attachment files, deleted `package.json`, and the branch created from the wrong base were good examples. The agent can work quickly and can tell me when it makes a mistake, but I am still responsible for checking what goes into the repository.
