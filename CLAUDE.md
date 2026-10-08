# CLAUDE.md

Claude Code instructions for Whiteboard. Operating rules that apply to every agent are in [`AGENTS.md`](./AGENTS.md) — read that. Product words are in [`CONTEXT.md`](./CONTEXT.md).

## What we are building

Whiteboard is an education-management SaaS. Identity lives only in the authenticated **Whiteboard** app (`apps/whiteboard`). The **Marketing Site** (`apps/marketing`) is public and has no Session.

We are **not** building a school ERP yet. Workspace Creation only allows **Training Institute** (default). School, Preschool, College, University, and Other are **Coming soon**.

### P0 — Replace the register (current work)

A Training Institute owner (CSC-style computer centre, home tuition, skill centre) should throw away the paper register.

They must be able to:

1. Add a **Student** (a record, not a User)
2. Define **Courses** (DCA, Tally, Python — what is taught)
3. Open **Batches** (when, Class Mode, capacity — how it is run)
4. **Enroll** a Student (Timings inherited from the Batch, or Student-specific for home tuition; Offline / Online / Hybrid)
5. Attach a **Fee Plan**, take a **Fee Payment** (partial OK), print a **Receipt**
6. See the **Owner Dashboard**: active Students, dues, today’s Batches

Spec: [`docs/prd/training-institute-p0.md`](./docs/prd/training-institute-p0.md)  
Tickets: [`docs/prd/tasks.md`](./docs/prd/tasks.md) — sequential; update the Status column.

Do not start P1 (attendance, enquiry CRM, certificates, WhatsApp, live classroom) or School/College modules until P0 is done.

## Read before coding

| File                                      | Why                                               |
| ----------------------------------------- | ------------------------------------------------- |
| `CONTEXT.md`                              | Words you put on screens and in code comments     |
| `docs/prd/training-institute-p0.md`       | What P0 is                                        |
| `docs/prd/tasks.md`                       | Which ticket to implement                         |
| `docs/adr/`                               | HTTP, CQRS, tenancy, Prisma, tests                |
| `.grok/skills/frontend-patterns/SKILL.md` | How to build forms, selects, and the in-app shell |
| `.grok/skills/tanstack-query/SKILL.md`    | Client reads: `queryOptions` + `useSuspenseQuery` |
| `.grok/skills/modular-monolith/SKILL.md`  | Domain/application/infrastructure layering        |
| `AGENTS.md`                               | Architecture don’ts and commands                  |

## Implementation shape

- New domain goes in `apps/whiteboard/src/training-institute/{domain,application,infrastructure}`.
- HTTP in `apps/whiteboard/app/api/training-institute/...` with Zod Request/Response models beside the route. Model names carry the context (`CreateTrainingInstituteStudentRequestModel`) because they become global OpenAPI components.
- Prisma in `packages/db` only. Each context has its own schema file (`prisma/schema/training-institute.prisma`), its own Postgres schema (`training_institute`), and `TrainingInstitute`-prefixed models and enums. Raw SQL names the schema (`training_institute.batches`).
- The first real bounded context is `training-institute`. A new context gets its own Postgres schema, model prefix, API prefix, and `src/` folder (ADR-0030). Do not add a sample Todo context.
- Students are not Users. Auth is `@repo/auth` (Better Auth, ADR-0034): `getAuth()` on the server, `useAuth()` in the browser. Fees belong to the Enrollment, not the Student.

## Commands

```sh
bun run dev --filter=whiteboard
bun run test
bun run test:http
bun run check-types
```

APIs: http://localhost:3001/api/docs (Whiteboard; the Marketing Site is on :3000)
