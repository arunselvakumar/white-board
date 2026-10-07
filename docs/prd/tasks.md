---
title: P0 tasks — Replace the register
prd: ./training-institute-p0.md
created: 2026-09-12
updated: 2026-09-12
status_values:
  - todo
  - in_progress
  - blocked
  - done
---

# P0 tasks — Replace the register

The P0 board below is the original delivery sequence. Work after P0 is recorded at the end of this file.

Sequential tickets for [training-institute-p0.md](./training-institute-p0.md). Work **top to bottom**. Do not start a ticket until every `Blocked by` ticket is `done`.

Update **Status** in the board when you pick up or finish work. Leave **Issue** blank until a tracker id exists.

## Legend

| Status        | Meaning                                                            |
| ------------- | ------------------------------------------------------------------ |
| `todo`        | Not started                                                        |
| `in_progress` | Someone is implementing it                                         |
| `blocked`     | Cannot proceed; note why in the ticket                             |
| `done`        | Merged and verified (tests + Storybook/UI where the ticket has UI) |

| Area   | Meaning                        |
| ------ | ------------------------------ |
| Docs   | Language and spec only         |
| Shell  | Authenticated chrome           |
| Data   | Prisma                         |
| Domain | `src/training` aggregates      |
| HTTP   | Route Handlers + OpenAPI       |
| UI     | Whiteboard screens + Storybook |

## Board

| ID     | Seq | Title                                                                  | Status | Blocked by             | Area    | Issue |
| ------ | --: | ---------------------------------------------------------------------- | ------ | ---------------------- | ------- | ----- |
| P0-001 |   1 | Record P0 language in CONTEXT.md                                       | done   | —                      | Docs    |       |
| P0-002 |   2 | In-app shell: nav to Dashboard, Students, Courses, Batches, Fees       | done   | P0-001                 | Shell   |       |
| P0-003 |   3 | Prisma schema for Course, Batch, Student, Enrollment, Fee Payment      | done   | P0-001                 | Data    |       |
| P0-004 |   4 | Scaffold `training` context (ports, ids, errors, no HTTP yet)          | done   | P0-003                 | Domain  |       |
| P0-005 |   5 | Course aggregate and commands                                          | done   | P0-004                 | Domain  |       |
| P0-006 |   6 | Course HTTP APIs + OpenAPI                                             | done   | P0-005                 | HTTP    |       |
| P0-007 |   7 | Course screens (list, create, edit, archive)                           | done   | P0-002, P0-006         | UI      |       |
| P0-008 |   8 | Student aggregate and commands                                         | done   | P0-004                 | Domain  |       |
| P0-009 |   9 | Student HTTP APIs + OpenAPI                                            | done   | P0-008                 | HTTP    |       |
| P0-010 |  10 | Student screens (list, search, create, profile, drop)                  | done   | P0-002, P0-009         | UI      |       |
| P0-011 |  11 | Batch aggregate and commands                                           | done   | P0-005                 | Domain  |       |
| P0-012 |  12 | Batch HTTP APIs + OpenAPI                                              | done   | P0-006, P0-011         | HTTP    |       |
| P0-013 |  13 | Batch screens (list, create, schedule, close)                          | done   | P0-007, P0-012         | UI      |       |
| P0-014 |  14 | Enrollment aggregate (mode, timings, capacity, move, end)              | done   | P0-008, P0-011         | Domain  |       |
| P0-015 |  15 | Enrollment HTTP APIs + OpenAPI                                         | done   | P0-009, P0-012, P0-014 | HTTP    |       |
| P0-016 |  16 | Enrollment screens (enroll, override mode, student timings, move, end) | done   | P0-010, P0-013, P0-015 | UI      |       |
| P0-017 |  17 | Fee Plan on Enrollment + Fee Payment + Receipt                         | done   | P0-014                 | Domain  |       |
| P0-018 |  18 | Fee HTTP APIs + OpenAPI                                                | done   | P0-015, P0-017         | HTTP    |       |
| P0-019 |  19 | Fee screens (plan, collect payment, remaining dues, print Receipt)     | done   | P0-016, P0-018         | UI      |       |
| P0-020 |  20 | Owner Dashboard (counts, dues, today's Batches, recent Students)       | done   | P0-016, P0-018         | HTTP+UI |       |
| P0-021 |  21 | Delete the Todo sample context and `/api/todos`                        | done   | P0-009                 | Domain  |       |
| P0-022 |  22 | P0 polish: empty states, nav from dashboard cards, Storybook coverage  | done   | P0-019, P0-020         | UI      |       |

## Tickets

### P0-001 — Record P0 language in CONTEXT.md

| Field      | Value |
| ---------- | ----- |
| Status     | done  |
| Blocked by | —     |
| Area       | Docs  |

**Done when:** CONTEXT.md defines Student, Guardian, Course, Batch, Class Mode, Timing, Enrollment, Fee Plan, Fee Payment, Receipt, Owner Dashboard, P0; relationships and example dialogue match the PRD. Agents must use these words.

### P0-002 — In-app shell

| Field      | Value  |
| ---------- | ------ |
| Status     | done   |
| Blocked by | P0-001 |
| Area       | Shell  |

Replace the placeholder In-app Home chrome with authenticated navigation: **Dashboard**, **Students**, **Courses**, **Batches**, **Fees**. Dashboard can still be a static empty state. Routes exist and respect Auth Gate + Workspace Gate. `@repo/ui` only. Storybook for the shell.

**Done when:** a signed-in User with an Active Workspace can click each nav item and see a titled empty page. Marketing Site unchanged.

### P0-003 — Prisma schema

| Field      | Value  |
| ---------- | ------ |
| Status     | done   |
| Blocked by | P0-001 |
| Area       | Data   |

Add tables in `packages/db` for Course, Batch, Student, Enrollment, Fee Payment (and Fee Plan fields on Enrollment unless a separate table is justified). Include `workspaceId`, audit Clerk ids, `deletedAt` / `deletedByUserId`, money as integer paise, INR implied. Indexes for Workspace-scoped lists. Migration. No repositories yet.

**Done when:** `bun run --filter @repo/db migrate:deploy` applies on Compose Postgres; generate succeeds.

### P0-004 — Scaffold `training` context

| Field      | Value  |
| ---------- | ------ |
| Status     | done   |
| Blocked by | P0-003 |
| Area       | Domain |

Create `apps/whiteboard/src/training/{domain,application,infrastructure}` with shared `WorkspaceId`, `UserId`, `DomainError`, event dispatcher port, repository ports as interfaces only. Copy the Todo layering, not Todo's product language. Do not expose HTTP.

**Done when:** the folder compiles; no `/api/training` yet.

### P0-005 — Course aggregate and commands

| Field      | Value  |
| ---------- | ------ |
| Status     | done   |
| Blocked by | P0-004 |
| Area       | Domain |

Course: create, update, archive. Invariants: name required; default fee ≥ 0 paise; archived Course cannot accept new Batches (enforced when Batch exists in P0-011; document the rule now). Domain unit tests. Prisma repository.

**Done when:** domain tests pass; repository round-trips a Course in the Active Workspace.

### P0-006 — Course HTTP APIs + OpenAPI

| Field      | Value  |
| ---------- | ------ |
| Status     | done   |
| Blocked by | P0-005 |
| Area       | HTTP   |

Named commands as in the PRD. Zod Request/Response models next to routes. 401/403/400/404. List is cursor + total. Appears at `/api/docs`. HTTP tests on Postgres.

**Done when:** create/list/get/update/archive are documented and tested; other Workspace ids 404.

### P0-007 — Course screens

| Field      | Value          |
| ---------- | -------------- |
| Status     | done           |
| Blocked by | P0-002, P0-006 |
| Area       | UI             |

List, create, edit, archive. Empty state: “Add the first Course this centre teaches.” react-hook-form + zod + `@repo/ui`. Storybook play: validation, create, archive.

**Done when:** an Owner can add DCA and see it in the list without using Swagger.

### P0-008 — Student aggregate and commands

| Field      | Value  |
| ---------- | ------ |
| Status     | done   |
| Blocked by | P0-004 |
| Area       | Domain |

Student: create (admit), update profile, drop. Fields per CONTEXT.md. Not a Clerk User. Domain tests for drop vs delete. Prisma repository.

**Done when:** domain tests pass; Student persists scoped to Workspace.

### P0-009 — Student HTTP APIs + OpenAPI

| Field      | Value  |
| ---------- | ------ |
| Status     | done   |
| Blocked by | P0-008 |
| Area       | HTTP   |

Create, list (`q` on name/phone + cursors), get, update profile, drop. Isolation and envelope tests.

**Done when:** `/api/docs` shows Student operations; HTTP tests green.

### P0-010 — Student screens

| Field      | Value          |
| ---------- | -------------- |
| Status     | done           |
| Blocked by | P0-002, P0-009 |
| Area       | UI             |

List with search, create, profile edit, drop. Empty state. Storybook play for validation and search.

**Done when:** an Owner can admit a Student from the UI and find them by phone.

### P0-011 — Batch aggregate and commands

| Field      | Value  |
| ---------- | ------ |
| Status     | done   |
| Blocked by | P0-005 |
| Area       | Domain |

Batch belongs to a Course. Class Mode, capacity, room, join URL, default Timings, open/closed. Cannot create on an archived Course. Domain tests for capacity occupancy (once Enrollment exists, tests can use a fake count or wait for P0-014 — prefer writing capacity as a Batch invariant checked at enroll time in P0-014; here test close and schedule).

**Done when:** a Batch can be created for a Course with weekday Timings and a mode.

### P0-012 — Batch HTTP APIs + OpenAPI

| Field      | Value          |
| ---------- | -------------- |
| Status     | done           |
| Blocked by | P0-006, P0-011 |
| Area       | HTTP           |

Create, list (filter by course), get (enrolled count may be 0 until P0-015), update schedule, close. HTTP tests.

**Done when:** documented and tested.

### P0-013 — Batch screens

| Field      | Value          |
| ---------- | -------------- |
| Status     | done           |
| Blocked by | P0-007, P0-012 |
| Area       | UI             |

List (grouped or filterable by Course), create (pick Course, Class Mode, Timings, capacity), edit schedule, close. Storybook.

**Done when:** an Owner can open “DCA Weekday 9–11 Offline” from the UI.

### P0-014 — Enrollment aggregate

| Field      | Value          |
| ---------- | -------------- |
| Status     | done           |
| Blocked by | P0-008, P0-011 |
| Area       | Domain         |

Enroll, override Class Mode, set Timing source (`batch` | `student`) and Student-specific Timings, move to another Batch of the same Course, end. Capacity 409 at enroll. Closed Batch and archived Course refuse new Enrollments. One Student may have many Active Enrollments. Domain tests for all of the above.

**Done when:** unit tests cover inherit vs override for mode and Timings, capacity, move, end.

### P0-015 — Enrollment HTTP APIs + OpenAPI

| Field      | Value                  |
| ---------- | ---------------------- |
| Status     | done                   |
| Blocked by | P0-009, P0-012, P0-014 |
| Area       | HTTP                   |

Routes per PRD. Get Student includes Enrollment summaries. Get Batch includes enrolled count of Active Enrollments. HTTP tests including 409 capacity.

**Done when:** documented and tested.

### P0-016 — Enrollment screens

| Field      | Value                  |
| ---------- | ---------------------- |
| Status     | done                   |
| Blocked by | P0-010, P0-013, P0-015 |
| Area       | UI                     |

Enroll from Student or from Batch. Toggle inherit Batch Timings vs Student-specific. Override Class Mode. Move. End. Show enrollments on the Student profile. Storybook for both timing paths and capacity error.

**Done when:** a Student can be put in a Batch with either timing mode from the UI.

### P0-017 — Fee Plan, Fee Payment, Receipt

| Field      | Value  |
| ---------- | ------ |
| Status     | done   |
| Blocked by | P0-014 |
| Area       | Domain |

On enroll, copy Course default fee into a Fee Plan (one-time | monthly | N installments). Adjust plan. Record payment (partial allowed; overpay is a domain conflict). Mint Receipt number per Workspace. Remaining dues = plan − sum of payments. Domain tests.

**Done when:** dues math and receipt uniqueness are unit-tested.

### P0-018 — Fee HTTP APIs + OpenAPI

| Field      | Value          |
| ---------- | -------------- |
| Status     | done           |
| Blocked by | P0-015, P0-017 |
| Area       | HTTP           |

Adjust plan, record payment, list payments, get receipt. HTTP tests for partial payment and overpay 409.

**Done when:** documented and tested.

### P0-019 — Fee screens

| Field      | Value          |
| ---------- | -------------- |
| Status     | done           |
| Blocked by | P0-016, P0-018 |
| Area       | UI             |

Fees nav: dues list. On Enrollment: plan summary, collect payment (method + amount), remaining dues, Receipt print/download. Storybook for partial payment and validation.

**Done when:** an Owner can take ₹1,000 of a ₹5,000 plan and print a Receipt.

### P0-020 — Owner Dashboard

| Field      | Value          |
| ---------- | -------------- |
| Status     | done           |
| Blocked by | P0-016, P0-018 |
| Area       | HTTP+UI        |

`GET /api/dashboard`: active Student count, outstanding dues total, today’s Batches (Workspace timezone, weekday match) with enrolled counts, recent Students. In-app Home renders this. Click a Batch to its roster. Empty state if no Courses yet.

**Done when:** after the happy path, the dashboard shows the Student, today’s Batch, and remaining dues without opening other pages. Desktop and a narrow viewport checked.

### P0-021 — Delete Todo sample

| Field      | Value  |
| ---------- | ------ |
| Status     | done   |
| Blocked by | P0-009 |
| Area       | Domain |

Remove `src/todo`, `/api/todos`, Todo Prisma model (migration), Storybook/tests that exist only for Todo. OpenAPI no longer lists todos. Do this as soon as Student HTTP is the first real resource — do not wait for P0-022.

**Done when:** no Todo symbols remain; `bun run test` and `bun run test:http` pass.

### P0-022 — P0 polish

| Field      | Value          |
| ---------- | -------------- |
| Status     | done           |
| Blocked by | P0-019, P0-020 |
| Area       | UI             |

Empty states in sequence (Course → Batch → Student → Enroll → Pay). Dashboard cards deep-link. Storybook coverage for every P0 form. Copy uses CONTEXT.md words only. No leftover “Open board” / Todo chrome.

**Done when:** a new Owner can complete the P0 loop using only the UI, and Storybook play functions cover that loop’s screens.

## Changes after P0

| ID     | Title                                                                                    | Status      | Area                           |
| ------ | ---------------------------------------------------------------------------------------- | ----------- | ------------------------------ |
| WB-001 | Invite Students and family contacts; gate Owner routes by Clerk role                     | done        | Auth+HTTP+UI                   |
| WB-002 | Require Workspace selection after authentication for Users with multiple Workspaces      | done        | Auth+UI                        |
| WB-003 | Teacher profile, role, invitations, Batch assignments, and My Batches                    | done        | Domain+Data+Auth+HTTP+UI       |
| WB-004 | Student Attendance Registers, marks, history, and Owner/Teacher access                   | done        | Domain+Data+Auth+HTTP+UI       |
| WB-005 | Optional Batch Enrollment while adding a Student                                         | done        | UI+Enrollment                  |
| WB-006 | Record Attendance for a missed earlier date                                              | in_progress | Domain+HTTP+UI                 |
| WB-007 | Read-only role-scoped Calendar for recurring Batch Timings                               | done        | Read+HTTP+UI                   |
| WB-008 | Expand Teacher profiles, photo capture, private documents, availability, and pay records | done        | Domain+Data+HTTP+UI            |
| WB-009 | Online class pre-join, external links, Whiteboard meetings, and recordings               | in_progress | Domain+Data+HTTP+UI+Cloudflare |
| WB-010 | Class cancellations, Holidays, and Moved Classes                                         | done        | Domain+Data+HTTP+UI            |
| WB-011 | Training Institute Postgres schema, qualified model names, and API prefix                | done        | Data+HTTP+Docs                 |
| WB-012 | Student and Parent Home: next Class, dues, Attendance, and recordings                    | in_progress | Read+HTTP+UI+Access            |
| WB-015 | Replace Clerk with Better Auth (`@repo/auth`), Resend, and React Email invitations       | in_progress | Auth+Data+HTTP+UI+Email        |
| WB-013 | Enquiries, follow-ups, demo classes, and conversion to a Student                         | in_progress | Domain+Data+HTTP+UI            |
| WB-014 | Study Material and Homework: share, set, submit, check with a remark                     | in_progress | Domain+Data+HTTP+UI+Access     |

### WB-001 — Student and Parent Workspace invitations

**Done when:** Add Student sends role-specific Clerk invitations for supplied email addresses; Student and Parent Users see one Hello world navigation item and cannot enter Owner pages or APIs; route, HTTP, and Storybook tests pass. See [ADR-0027](../adr/0027-student-and-parent-workspace-invitations.md).

### WB-003 — Teachers

**Spec:** [training-institute-teachers.md](./training-institute-teachers.md). **Blocked by:** WB-001 and WB-002 (both done).

**Done when:** Owner can create, edit, invite, deactivate, and assign a Teacher to Batches; an invited Teacher can activate and see only assigned Batches; role and Workspace isolation, OpenAPI, unit tests, Postgres HTTP tests, and Storybook play functions pass.

### WB-004 — Student Attendance

**Spec:** [training-institute-attendance.md](./training-institute-attendance.md). **Blocked by:** WB-003 (done).

**Done when:** Owner and assigned Teacher can open today's Batch Attendance Register, save and correct Marks with an audit trail, and see only authorized roster data; Owner can review Student Attendance history; OpenAPI, unit, Postgres HTTP, Storybook, typecheck, lint, and build pass.

### WB-005 — Add Student with optional Enrollment

**Done when:** Add Student offers an optional open Batch; selecting one creates the Student and then an Enrollment using the Batch defaults. If Enrollment fails after Student creation, the Owner can retry without creating another Student. Existing Add Student without Enrollment and Edit Student keep working. Storybook, typecheck, lint, and build pass.

### WB-006 — Record Attendance for a missed earlier date

**Spec:** [training-institute-attendance.md](./training-institute-attendance.md). **Blocked by:** WB-004 (done).

**Done when:** Owner and assigned Teacher can choose a date from Batch creation through today, open or reopen that date's Register, review the current scheduled roster, and save Marks. Future and pre-Batch dates are rejected; HTTP tests, Storybook, typecheck, lint, and build pass. Mark `done` after merge.

### WB-007 — Calendar

**Blocked by:** WB-003 (done). Requested as a separate feature while WB-006 is in progress.

**Done when:** Owner, Teacher, Student, and Parent can open a read-only Calendar scoped to their Batches or Enrollments; week is the default, day and month can be selected; role and Workspace isolation, OpenAPI, Postgres HTTP tests, Storybook, typecheck, lint, and build pass.

### WB-008 — Expanded Teacher profile

**Spec:** [training-institute-teachers.md](./training-institute-teachers.md), expanded profile section. **Blocked by:** WB-003 (done). Requested while WB-006 is in progress.

**Done when:** Owner can create and edit the complete Teacher profile, take or upload and replace a photo, record availability and private verification/pay details, and upload/download/remove private documents. Role and Workspace isolation, OpenAPI, domain and Postgres HTTP tests, Storybook, typecheck, lint, and build pass.

### WB-009 — Online classes

**Spec:** [Whiteboard online classes design](../superpowers/specs/2026-09-30-whiteboard-online-classes-design.md). **Blocked by:** WB-007 (done). Requested separately while WB-006 is in progress.

**Done when:** An Online or Hybrid Batch uses an external link or a Whiteboard class; role-scoped Users visit a pre-join page; Owner/assigned Teacher starts a RealtimeKit meeting; Students/Parents join after recording begins; the private R2 recording can be downloaded after upload; OpenAPI, tests, Storybook, typecheck, lint, build, and a live Cloudflare class verification pass. Cloudflare App, webhook, and private R2 bucket are configured; the Owner recording and download passed. Student join and unauthorized User checks remain deferred by the user.

### WB-010 — Class cancellations, Holidays, and Moved Classes

**Spec:** [training-institute-class-changes.md](./training-institute-class-changes.md). **Issue:** [#13](https://github.com/white-board-io/white-board-v3/issues/13). **Decisions:** [ADR-0028](../adr/0028-class-changes-are-exceptions-over-weekly-timings.md), [ADR-0029](../adr/0029-class-change-product-decisions.md). **Blocked by:** WB-004, WB-007, WB-009 (Attendance, Calendar, and online Classes exist). **Tracking:** [GitHub project](https://github.com/orgs/white-board-io/projects/6).

**Done when:** Owner and assigned Teachers can cancel, move, and restore a Class; the Owner can declare and remove Workspace Holidays; every role's Calendar shows the changes and Upcoming changes; cancelled Classes can't be started, joined, or marked; the Owner Dashboard respects today's changes. Role and Workspace isolation, OpenAPI, domain and Postgres HTTP tests, Storybook play functions, typecheck, lint, and build pass.

### WB-011 — Training Institute Postgres schema, qualified model names, and API prefix

**Issue:** [#14](https://github.com/white-board-io/white-board-v3/issues/14). **Decision:** [ADR-0030](../adr/0030-postgres-schema-per-bounded-context.md), which supersedes ADR-0010's single schema. **Blocked by:** WB-010 (merged). **Tracking:** [GitHub project](https://github.com/orgs/white-board-io/projects/7).

**Done when:** every Training Institute table and enum lives in the `training_institute` Postgres schema with no data loss; Prisma models and enums, HTTP models, and OpenAPI components carry the `TrainingInstitute` prefix; routes live under `/api/training-institute/`; `src/training` is `src/training-institute`; an ESLint rule keeps contexts from importing each other; typecheck, lint, unit, and Postgres HTTP tests pass. No behaviour changes for users.

### WB-012 — Student and Parent Home

**Issue:** [#12](https://github.com/white-board-io/white-board-v3/issues/12). **Decisions:** [ADR-0031](../adr/0031-student-and-parent-home-product-decisions.md). **Blocked by:** WB-001, WB-004, WB-007, WB-009 (invitations, Attendance, Calendar, and recordings exist). **Tracking:** [GitHub project](https://github.com/orgs/white-board-io/projects/8).

**Done when:** an invited Student lands on a Student Home that shows their next Class, remaining dues per active Enrollment, latest 5 Attendance marks, and latest 5 ready recordings, or a clear empty state for each; a Parent sees the same for each linked Student on one page; Students and Parents can download recordings of their own Classes since the Enrollment began; Owner and Teacher flows are unchanged. Role and Workspace isolation, OpenAPI, unit and Postgres HTTP tests, Storybook play functions, typecheck, lint, and build pass. Mark `done` after merge.

### WB-013 — Enquiries and demo classes

**Spec:** [training-institute-enquiries.md](./training-institute-enquiries.md). **Issue:** [#19](https://github.com/white-board-io/white-board-v3/issues/19). **Decisions:** [ADR-0032](../adr/0032-enquiry-and-demo-product-decisions.md). **Blocked by:** WB-003, WB-004, WB-010 (Teachers, Attendance, and Class Changes exist).

**Done when:** the Owner and Teachers can record, follow up, close, and reopen Enquiries, see Follow-ups due, and book, mark, and cancel free or paid Batch and one-to-one demos; the Owner converts an Enquiry into a Student and Enrollment in one step under the usual admission rules, manages Enquiry Sources, and sees the monthly summary; a Teacher's Home lists their demos; Students and Parents can't see any of it; Enquiries and demo fees don't change Batch capacity, dues, Attendance, or the Owner Dashboard. Role and Workspace isolation, OpenAPI, domain and Postgres HTTP tests, Storybook play functions, typecheck, lint, and build pass. Mark `done` after merge.

### WB-014 — Study Material and Homework

**Issue:** [#21](https://github.com/white-board-io/white-board-v3/issues/21). **Decisions:** [ADR-0033](../adr/0033-study-material-and-homework-product-decisions.md). **Blocked by:** WB-003, WB-010, WB-012 (Teachers, Class Changes, and Student and Parent Home exist). **Tracking:** [GitHub project](https://github.com/orgs/white-board-io/projects/9).

**Done when:** the Owner and assigned Teachers can share Study Material and set Homework against a Class date with a due date, edit and remove them, and see per Homework who submitted, who didn't, and who was late, checking each with a remark; Students and linked Parents see them on Home and the Homework page, submit with optional files, and see remarks; late joiners see earlier items without owing them; leavers keep items from while enrolled; unassigned Teachers and other Batches' Students can't see or post. Role and Workspace isolation, OpenAPI, domain and Postgres HTTP tests, Storybook play functions, typecheck, lint, and build pass. Mark `done` after merge.

### WB-015 — Replace Clerk with Better Auth

**Plan:** [2026-10-07-clerk-to-better-auth.md](../superpowers/plans/2026-10-07-clerk-to-better-auth.md). **Decisions:** [ADR-0034](../adr/0034-identity-on-better-auth.md). **Tracking:** [GitHub project](https://github.com/orgs/white-board-io/projects/10).

**Done when:** Sign-up with Email Verification, Sign-in by Username or Email, Google Sign-in, Password Reset, Workspace Creation and Selection, and Teacher, Student, and Parent invitations work on Better Auth with Users, Workspaces, members, and invitations in the `identity` schema; roles are `owner`, `teacher`, `student`, `parent`; emails are React Email templates sent with Resend; no code imports Clerk; every existing 401/403/404 tenancy test passes unchanged in intent; identity flows have Postgres HTTP tests; Storybook play functions cover every auth form state; CI runs unit and Postgres HTTP tests; typecheck, lint, and build pass. Mark `done` after merge.
