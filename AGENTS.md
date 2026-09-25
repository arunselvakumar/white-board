# AGENTS.md

Instructions for anyone (human or agent) changing this repository.

## What we are building

**Whiteboard** is an education-management product. The authenticated app is Whiteboard. The public site is the **Marketing Site**. They are not one app.

We sell first to **Training Institutes** (computer education centres, home tuition, skill/vocational shops). School, Preschool, College, University, and Other exist on Workspace Creation as **Coming soon** and cannot be selected.

Current slice is **P0 — Replace the register**: an Owner can add a **Student**, put them on a **Course**/**Batch** with **Timings** and **Class Mode**, take a **Fee Payment**, issue a **Receipt**, and see today’s Batches on the **Owner Dashboard**.

- Product language: [`CONTEXT.md`](./CONTEXT.md) — use those words; do not invent synonyms
- P0 spec: [`docs/prd/training-institute-p0.md`](./docs/prd/training-institute-p0.md)
- Ticket board: [`docs/prd/tasks.md`](./docs/prd/tasks.md) — work in sequence, update Status
- Architecture: [`docs/adr/`](./docs/adr/) — follow every ADR that applies; do not quietly reverse one

P1 (attendance, enquiry CRM, session calendar, certificates, WhatsApp) and School/College modules are out of scope until P0 tickets are `done`.

## How to pick work

1. Open `docs/prd/tasks.md`.
2. Take the next `todo` whose `Blocked by` tickets are `done`.
3. Set it to `in_progress`, implement, verify, set `done`.
4. Do not skip ahead to Fees or Dashboard while Course/Student/Batch/Enrollment are open.

## Language (non-negotiable)

| Say                              | Do not say                                    |
| -------------------------------- | --------------------------------------------- |
| Workspace                        | organization, tenant, org (in UI copy)        |
| User                             | account, customer                             |
| Student                          | user, pupil (Student is not a User)           |
| Course                           | class (as the catalog entity)                 |
| Batch                            | section, period                               |
| Enrollment                       | admission (admission is creating the Student) |
| Class Mode                       | delivery type                                 |
| Fee Plan / Fee Payment / Receipt | invoice, bill (in P0)                         |
| Owner Dashboard                  | analytics                                     |

A **Student** remains a Workspace record, distinct from a Clerk User. Add Student invites a Student with an email address as `org:student` and father, mother, and Guardians with email addresses as `org:parent`. The Owner (`org:admin`) alone can use the existing register screens and APIs; Student and Parent currently have Hello world pages.

## Architecture

- Context-first modular monolith inside Whiteboard: `apps/whiteboard/src/<context>/{domain,application,infrastructure}` (ADR-0009). How-to: [`.grok/skills/modular-monolith/SKILL.md`](./.grok/skills/modular-monolith/SKILL.md).
- First product context is **`training`**.
- HTTP is Next.js Route Handlers in `apps/whiteboard/app/api` (ADR-0006). No separate API process.
- Writes = commands, reads = queries, no bus (ADR-0007). Named operations, not generic PATCH (ADR-0015).
- Zod only on HTTP Request/Response models next to routes (ADR-0016, ADR-0021). Domain does not import Zod.
- OpenAPI from those models; a route is unfinished until it is on `/api/docs` (ADR-0012).
- Tenant is the **Active Workspace** on the Session. Never send `workspaceId` in the body (ADR-0014). 401 no Session, 403 no Active Workspace, 404 other tenant.
- Postgres holds resource rows only. Clerk ids are opaque strings. No User or Workspace table (ADR-0018).
- Soft delete is an invisible tombstone (ADR-0019). Lists use bidirectional cursors plus total (ADR-0020).
- Errors: `{ code, message, details? }` (ADR-0017).
- Prisma lives only in `packages/db` (ADR-0010).

## UI

- Import from `@repo/ui`. No native `<select>`, `<input>`, `<textarea>`, or raw `<button>` for product chrome.
- Forms: react-hook-form + zod. Select via `Controller`.
- Visual tokens: ADR-0002, ADR-0003.
- In-app chrome: `AppShell` with nav from `lib/app-nav.ts`. Page reads: `useSuspenseQuery` + `queryOptions` in `src/queries` (ADR-0026).
- Patterns: [`.grok/skills/frontend-patterns/SKILL.md`](./.grok/skills/frontend-patterns/SKILL.md), [`.grok/skills/tanstack-query/SKILL.md`](./.grok/skills/tanstack-query/SKILL.md).
- Storybook play functions for every P0 form and empty state. Select options portal to `document.body`.
- Student photos and initials use `components/students/student-avatar.tsx`; see [`docs/ui/student-avatar.md`](./docs/ui/student-avatar.md) for the color rule. Do not choose avatar colors in individual screens.
- Add forms use the Add Student page content width: `w-full p-6` outside and `max-w-4xl` inside. Apply this to Add Course, Add Batch, Enroll Student, and future add flows; keep Storybook previews aligned with the page.

## Testing

- Domain unit tests (no Prisma) for invariants.
- HTTP tests against real Postgres (`whiteboard_test`), not SQLite (ADR-0023).
- `bun run test` and `bun run test:http`. Typecheck: `bun run check-types`.
- Verify UI in Storybook (and the browser when chrome-devtools is available). A screenshot is not verification.

## Commands

```sh
bun install
docker compose up -d
bun run generate
bun run --filter @repo/db migrate:deploy
bun run dev --filter=whiteboard   # :3000
bun run test
bun run test:http
bun run check-types
```

Whiteboard APIs: http://localhost:3000/api/docs

## Do not

- Build School/College features (report cards, TC, transport, library, hostel, periods).
- Treat Students as Clerk Users.
- Hang fees off the Student instead of the Enrollment.
- Add attendance, WhatsApp, GST, live video, or franchise royalty in P0.
- Add a sample Todo context back.
- Add a second process, a CQRS bus, or a Workspace table in Prisma.
