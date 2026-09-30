# Lab 4 — AI Use and Reflection

**LLM/agent used:** Claude Code, running as an agent inside the repository with
file, terminal, and database access. Claude Opus was used for planning and
architecture, and Claude Sonnet for implementation.

**How it was used:** I use Claude Opus for planning lab 4 sprint first, from reading the handout and write required documents. For the implementation phase, I will provide the issue to the agent and let them strictly implement and follow the documents in `docs/lab-04/` as the source of truth. Agent will read documents rather than hallucinate other information

## Selected key prompts

Prompts are from the Lab 4 release-hardening session (final README/tests.md/DoD pass before `feature/lab4-release`), summarised in order.

| #   | Prompt (summarised)                                                                                                                                                                                                         | How I used the answer with the project                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Read the codebase. 1. Update README. 2. Check .gitignore. 3. Verify the Definition of Done checklist in `docs/lab-04/specification.md`. 4. Update `tests.md`'s Final column to pass with real file paths."                 | Used as the scope for the whole session, not a single-shot request — I let the agent work through all four items and checked each output before moving on, rather than accepting a combined "done" claim.                                                                                                         |
| 2   | (Implicit in task 1, made explicit when the agent's first pass just repeated the doc's own "Done" labels) "Don't just trust what `tests.md` already says — run the suites for real."                                        | Made the agent start a local Prisma dev database, run `prisma migrate deploy` + seed, and run the full server (`npm test --prefix server`) and client (`npm test --prefix client`) suites before touching the Final column. This is the actual source of the 651/651 and 262/262 numbers now cited in `tests.md`. |
| 3   | "Check background task bbtzntlt4 (Playwright `e2e/lab-04` run) output, update `tests.md` RS-01/AX-01/E-01..E-04, then report the completed work."                                                                           | Used the real Playwright run (43/44 passing) instead of guessing; when one test failed, had the agent re-run that spec file alone to rule out a fluke before writing "Failing" in the doc.                                                                                                                        |
| 4   | "Write `docs/lab-04/ai-use.md`, just the section of selected key prompts (at least 6 prompts), evidence that the AI work was checked not accepted, and where I had to correct or reject the agent. Get data from our chat." | This prompt — used to replace the Lab‑3‑era content that had been left in this file (it still referred to "Lab 3 Issue", PRs #55–63, and `docs/lab-03`) with an honest record of this session instead of reusing another lab's text.                                                                              |
| 5   | (Follow-up correction while reviewing task 3) "Verify the DoD checklist" was read as a read-only audit, not "check the boxes for me."                                                                                       | The agent reported DoD status (what passed, what's missing — `ai-use.md` empty, `reviewer.md` PR count stale, one E2E test failing) but left every checkbox in `specification.md` §10 unticked, since sign-off is mine to give, not the agent's to assume.                                                        |
| 6   | "Confirm the .gitignore is actually correct, not just present."                                                                                                                                                             | Had the agent cross-check `.gitignore` patterns against real generated output on disk (`server/dist/`, `client/.env`, `server/.env`, root `test-results/`) with directory/glob searches rather than eyeballing the file.                                                                                          |
| 7   | "Report back what changed and what's still outstanding."                                                                                                                                                                    | Used the closing summary as a punch list (the E-02 status-dropdown bug, the empty `ai-use.md`, the stale `reviewer.md` count) rather than as a sign that the branch was ready to release.                                                                                                                         |

## Evidence that the AI work was checked, not accepted

- **Ran the suites instead of trusting the doc.** `tests.md` already marked
  most rows "Done"/"Planned" before this session; I did not let that stand as
  evidence. The agent started a real local Prisma Postgres database, migrated
  and seeded it, and ran the actual server (651 tests), client (262 tests),
  and `e2e/lab-04` Playwright (44 tests) suites — the Final column now reflects
  that real run, not the file's prior claims.
- **Reproduced the E2E failure before writing it down.** When
  `ticket-resolution.spec.ts` failed inside the full 44-test run, I had the
  agent re-run that one spec file in isolation. It failed the same way twice
  (the "Change status to" dropdown resets to its placeholder before "Update
  Status" becomes clickable), which is what let me record it as a real,
  reproducible bug in `tests.md` (E-02) instead of a flake.
- **Cross-checked every file path, not just the prose.** Seven file paths
  cited in the old `tests.md` (`action-validation.unit.test.ts`,
  `dashboard-metrics.unit.test.ts`, `ticket-timestamps.unit.test.ts`,
  `idempotency-and-assignee.unit.test.ts`, `authorization.api.test.ts`,
  `concurrency.api.test.ts`, `dashboard-drilldown.api.test.ts`) do not exist on
  disk. I had the agent grep the real test files for the matching assertions
  before rewriting each path to where that coverage actually lives.
- **.gitignore checked against real output, not read in isolation.** The
  agent searched the working tree for actual build artifacts and env files
  (`server/dist/`, `.env`, `test-results/`) and confirmed each was covered,
  instead of assuming the existing patterns were sufficient.
- **DoD status reported, not asserted.** I had the agent read `ai-use.md`,
  `reviewer.md`, and the accessibility checklist directly rather than restate
  the specification's own claims about them, which is how the empty
  `ai-use.md` and the 5-PRs-vs-"9 merged" mismatch in `reviewer.md` were
  caught.

## Where I had to correct or reject the agent

- **Rejected copying `tests.md`'s existing status verbatim.** The agent's
  first read of the file would have let most rows stay "Done"/"Planned"
  unchanged; I required an actual test run before any row could be marked
  Passing.
- **Rejected the first E2E result as final.** One failing test in a 44-test
  run could have been a fluke; I made the agent isolate and re-run that spec
  before accepting the failure as real and writing it into the documentation
  as "Failing" with the actual Playwright error rather than papering over it.
- **Stopped the agent from checking DoD boxes on my behalf.** Task 3 said
  "verify", not "update" — I kept the agent to reporting status in prose and
  did not let it tick checkboxes in `specification.md` §10, since that
  checklist is a team sign-off record, not something an agent should mark
  complete unilaterally.
- **Rejected reusing this file's leftover Lab 3 content.** Before this
  prompt, `docs/lab-04/ai-use.md` still contained Lab 3's prompts, PR numbers,
  and branch names (`lab3-staging`, PRs #55–63) copied in as a placeholder. I
  had the agent replace that with what actually happened in Lab 4's release
  session instead of leaving the stale Lab 3 record in place.

## Reflection

At the start of this course I'm not that familiar with using AI in full stack project. But now on lab 4 I think I'm really familiar with it. I know how to use AI for planning at the start of lab 4 sprint. I know how to let AI implement the project but don't hallucinate and do anything without a source of truth. In summary, I feel that I know how I can use AI with project development in planning, implementing, and finalizing the sprint.
