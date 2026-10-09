# Milestone kickoff prompt

Paste the block below into a **fresh** Claude Code session at the repo root, replacing `<MILESTONE>` (e.g. `M1`). One session = one milestone = one PR. The agent has no memory of earlier sessions; everything it needs is in the files the prompt names.

```text
You are implementing milestone <MILESTONE> of the Construction Management app in this monorepo. One milestone = one branch = one PR.

## Read first, in this order (do not start coding before you have read all of them)
1. CLAUDE.md and AGENTS.md at the repo root — architecture rules and commands. Follow every root ADR in docs/adr/ (modular monolith per context, Postgres schema per context, Zod only at HTTP, commands/queries, OpenAPI from request models, soft delete, cursor pagination, HTTP tests on Postgres).
2. apps/construction-management/docs/README.md — table of contents for the product docs.
3. apps/construction-management/docs/03-target-architecture.md — contexts, schema names, API prefixes, shared kernel, data conventions.
4. apps/construction-management/docs/prd/milestones-and-tasks.md — the board. Find the <MILESTONE> section. Its "Spec" column names the module specs under docs/modules/ to read for this milestone; read those specs fully, including their "Business rules", "Permissions" and "Open questions" sections.
5. apps/construction-management/CONTEXT.md if it exists — use those words in code, UI copy and tests. (M0 creates it.)
6. apps/construction-management/docs/adr/ — ADRs already recorded by earlier milestones. Do not reverse one silently.

## Ground rules
- Branch from main: `git checkout main && git pull && git checkout -b feat/cm-<milestone lowercase>-<short-name>`.
- Work the milestone's tickets top to bottom. Each ticket: set Status to in_progress in milestones-and-tasks.md, implement, verify, set done, commit with the ticket id in the message (e.g. "CM-104 Company creation"). Do not skip a ticket whose Blocked by is not done.
- Scope is exactly the milestone's tickets. If a ticket needs something from a later milestone, build the smallest stub the ticket's "Done when" allows and note it in the PR description. If a spec is wrong or silent, decide, write it into the spec (same PR), and list the decision in the PR description under "Spec changes".
- Decisions that change architecture get an ADR under apps/construction-management/docs/adr/ named CM-00NN-<slug>.md (next free number). Several tickets name their ADR explicitly.
- Code goes in apps/construction-management/src/<context>/{domain,application,infrastructure}, HTTP in apps/construction-management/app/api/construction/<context>/..., Prisma only in packages/db/construction/prisma/schema/construction-<context>.prisma (@repo/construction-db) with @@schema("construction_<context>") and Construction<Context>-prefixed model names. No context imports another context's folder; use ids and in-process domain events.
- Identity (users, sessions, workspaces=companies, memberships, invitations) stays in @repo/auth. Company = Workspace. Never join to the identity schema.
- Every command checks the permission matrix via can(member, menu, flag, { projectId? }) once CM-107 exists; before that, owner-only.
- Money is integer paise; quantities are decimal + UoM; balances are derived from append-only ledger entries (ADR CM-0004).
- UI: @repo/ui components, react-hook-form + zod, AppShell, useSuspenseQuery + queryOptions, Storybook play functions for every form and empty state. Form widths and avatar rules follow AGENTS.md.
- Verify as you go: `bun run check-types`, `bun run lint`, `bun run test --filter=construction-management`, `bun run test:http --filter=construction-management`, `bun run format:check` (CI fails on an unformatted file). Run the dev server and check screens in the browser; a screenshot is not verification.
- Mark anything you had to assume with a short note in the PR description. Do not pad; do not add features outside the tickets.

## Finish
1. All tickets of <MILESTONE> are `done` in milestones-and-tasks.md; `updated:` in its front matter is today.
2. Write apps/construction-management/docs/prd/handoff/<MILESTONE>.md: what shipped, spec changes, ADRs added, stubs left for later milestones, how to run/verify, and open questions for the owner. The next session reads this file.
3. `bun run format:check` passes; all tests pass.
4. Push the branch and open ONE pull request to main titled "<MILESTONE>: <milestone name>" whose body lists the tickets, links the handoff file, and ends with the attribution line from your system reminders. Do not merge.
5. Report back: PR URL, what is stubbed, and the open questions.
```

## Milestones (one PR each, in this order)

| Session | Milestone                                       | Branch name                        | Reads specs                             | Unblocks    |
| ------- | ----------------------------------------------- | ---------------------------------- | --------------------------------------- | ----------- |
| 1       | **M0 Project setup**                            | `feat/cm-m0-project-setup`         | 03-target-architecture                  | everything  |
| 2       | **M1 SaaS onboarding & access**                 | `feat/cm-m1-onboarding-access`     | modules/01, modules/12                  | M2, M3, M4  |
| 3       | **M2 Site workforce (labour & vendor)**         | `feat/cm-m2-site-workforce`        | modules/08, modules/02 (labour subset)  | M7          |
| 4       | **M3 Staff HRMS**                               | `feat/cm-m3-hrms`                  | modules/10                              | —           |
| 5       | **M4 Projects & structure**                     | `feat/cm-m4-projects-structure`    | modules/03                              | M5, M8, M10 |
| 6       | **M5 Procurement & inventory**                  | `feat/cm-m5-procurement-inventory` | modules/06, modules/02                  | M6, M7      |
| 7       | **M6 Daily site work**                          | `feat/cm-m6-daily-site-work`       | modules/04                              | M9          |
| 8       | **M7 Finance**                                  | `feat/cm-m7-finance`               | modules/07                              | M9, M11     |
| 9       | **M8 Tasks, issues, inspections**               | `feat/cm-m8-tracking`              | modules/05                              | —           |
| 10      | **M9 Dashboards, reports, notifications, chat** | `feat/cm-m9-reporting-messaging`   | modules/11, modules/13                  | M12         |
| 11      | **M10 Sales CRM**                               | `feat/cm-m10-sales-crm`            | modules/09                              | —           |
| 12      | **M11 India compliance**                        | `feat/cm-m11-india-compliance`     | 04-gaps-and-roadmap §Phase 3, research/ | —           |
| 13      | **M12 Differentiators**                         | `feat/cm-m12-differentiators`      | 04-gaps-and-roadmap §Phase 4            | —           |

Before starting session N+1, merge (or at least rebase onto) the PR from session N; the kickoff prompt branches from `main`. M4–M10 boards have no "Done when" sections yet — the session that starts one of those milestones writes them first (from the module spec) as its opening commit, then implements.

## What the owner does between sessions

- Review the PR and the `handoff/<MILESTONE>.md` file; answer its open questions by editing the spec or the board before kicking off the next session.
- Merge to `main`.
- If a milestone is too large for one session's context, split it at a ticket boundary: tell the next session "continue <MILESTONE> from ticket CM-nnn on branch <branch>" and keep the same PR.
